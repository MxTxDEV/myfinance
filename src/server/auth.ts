import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { Profile } from "@prisma/client";
import { enterUser, prismaRaw, setRequestUserResolver } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
export const SESSION_COOKIE = "fos_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 dias

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltHex, keyHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length, SCRYPT);
  return timingSafeEqual(key, expected);
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curto (mínimo 32 caracteres)");
  return new TextEncoder().encode(s);
}

export async function signSession(profileId: string, version: number): Promise<string> {
  return new SignJWT({ v: version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(profileId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function readSession(token: string | undefined): Promise<{ sub: string; v: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub ? { sub: payload.sub, v: Number(payload.v ?? 0) } : null;
  } catch {
    return null;
  }
}

// Limitador simples em memória (instância única): 5 falhas / 15 min por e-mail+IP.
const attempts = new Map<string, { n: number; until: number }>();
export function loginBlocked(key: string): boolean {
  const a = attempts.get(key);
  return !!a && a.n >= 5 && a.until > Date.now();
}
export function loginFailed(key: string) {
  const a = attempts.get(key);
  attempts.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60_000 });
}
export const loginSucceeded = (key: string) => attempts.delete(key);

export async function startSession(profileId: string, version: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(profileId, version), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}
export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Valida sessão no servidor (assinatura + versão no banco). Use em páginas e ações. */
/** Rate limit simples em memória para cadastro (instância única; reduz abuso, não substitui um WAF). */
const signups = new Map<string, { n: number; until: number }>();
export function signupBlocked(key: string): boolean { const a = signups.get(key); return !!a && a.n >= 5 && a.until > Date.now(); }
export function signupCounted(key: string) { const a = signups.get(key); signups.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 3_600_000 }); }

type Loaded = { profile: Profile | null; reason: "ok" | "none" | "must-change" };

// Resolvedor de usuário por requisição (cookie assinado + conferência no banco, cache de 10 s por sessão).
const resolved = new Map<string, { id: string | null; until: number }>();
setRequestUserResolver(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await readSession(token);
  if (!token || !s) return null;
  const hit = resolved.get(token);
  if (hit && hit.until > Date.now()) return hit.id;
  const p = await prismaRaw.profile.findUnique({ where: { id: s.sub }, select: { id: true, active: true, sessionVersion: true } });
  const id = p && p.active && p.sessionVersion === s.v ? p.id : null;
  if (resolved.size > 500) resolved.clear();
  resolved.set(token, { id, until: Date.now() + 10_000 });
  return id;
});

async function load(): Promise<Loaded> {
  const s = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return { profile: null, reason: "none" };
  const p = await prismaRaw.profile.findUnique({ where: { id: s.sub } });
  if (!p || !p.active || p.sessionVersion !== s.v) return { profile: null, reason: "none" };
  enterUser(p.id); // a partir daqui, todas as consultas deste fluxo são do usuário e só dele
  return { profile: p, reason: p.mustChangePassword ? "must-change" : "ok" };
}

/** Sessão válida e senha em dia → perfil; senão null. (Senha temporária pendente conta como "não liberado".) */
export async function getOwner(opts: { allowMustChange?: boolean } = {}) {
  const { profile, reason } = await load();
  return reason === "ok" || (reason === "must-change" && opts.allowMustChange) ? profile : null;
}
export async function requireOwner(opts: { allowMustChange?: boolean } = {}) {
  const { profile, reason } = await load();
  if (!profile) redirect("/login");
  if (reason === "must-change" && !opts.allowMustChange) redirect("/senha");
  return profile;
}
/** Para Server Actions: lança em vez de redirecionar. */
export async function assertOwner(opts: { allowMustChange?: boolean } = {}) {
  const p = await getOwner(opts);
  if (!p) throw new Error("Não autorizado");
  return p;
}
/** Somente o super administrador. Para qualquer outra pessoa a página "não existe". */
export async function requireAdmin() {
  const p = await requireOwner();
  if (p.role !== "SUPER_ADMIN") notFound();
  return p;
}
export async function assertAdmin() {
  const p = await assertOwner();
  if (p.role !== "SUPER_ADMIN") throw new Error("Não autorizado");
  return p;
}
