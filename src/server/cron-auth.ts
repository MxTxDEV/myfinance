import { timingSafeEqual } from "node:crypto";

/** Confere o CRON_SECRET (cabeçalho Authorization: Bearer … ou ?secret=…). Sem segredo configurado, tudo é negado. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? new URL(req.url).searchParams.get("secret") ?? "";
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
