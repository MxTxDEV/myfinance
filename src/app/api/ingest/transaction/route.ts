import { ZodError } from "zod";
import { DomainError } from "@/server/errors";
import { ingestTransaction, userForToken } from "@/server/services/apitokens";

export const dynamic = "force-dynamic";

// Limite simples por chave (instância única): 60 lançamentos por minuto.
const hits = new Map<string, { n: number; reset: number }>();

/** POST /api/ingest/transaction — Authorization: Bearer fos_… — corpo JSON: { amount, merchant|description, card|account?, date?, id? } */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  const userId = await userForToken(token);
  if (!userId) return Response.json({ error: "Chave inválida" }, { status: 401 });
  const h = hits.get(userId);
  const now = Date.now();
  if (h && h.reset > now && h.n >= 60) return Response.json({ error: "Muitas requisições" }, { status: 429 });
  hits.set(userId, h && h.reset > now ? { n: h.n + 1, reset: h.reset } : { n: 1, reset: now + 60_000 });
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return Response.json({ error: "Corpo JSON inválido" }, { status: 400 });
    return Response.json({ ok: true, ...(await ingestTransaction(userId, body)) });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ error: e.message }, { status: 422 });
    if (e instanceof ZodError) return Response.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("ingest falhou", e instanceof Error ? e.name : "erro");
    return Response.json({ error: "Falha ao registrar" }, { status: 500 });
  }
}
