import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { ensureDefaultCategories } from "./services/categories";

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
/** Modo aberto temporário (AUTH_DISABLED=true): sem login. Qualquer pessoa com a URL acessa os dados. */
export const authDisabled = () => process.env.AUTH_DISABLED === "true";

async function openModeOwner() {
  const existing = await prisma.profile.findFirst();
  if (existing) return existing;
  await ensureDefaultCategories();
  return prisma.profile.create({ data: { email: "aberto@local", name: "Você", passwordHash: "disabled" } }); // hash inválido: login por senha impossível
}

export async function getOwner() {
  if (authDisabled()) return openModeOwner();
  const s = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const p = await prisma.profile.findUnique({ where: { id: s.sub } });
  return p && p.sessionVersion === s.v ? p : null;
}
export async function requireOwner() {
  const p = await getOwner();
  if (!p) redirect("/login");
  return p;
}
/** Para Server Actions: lança em vez de redirecionar. */
export async function assertOwner() {
  const p = await getOwner();
  if (!p) throw new Error("Não autorizado");
  return p;
}
