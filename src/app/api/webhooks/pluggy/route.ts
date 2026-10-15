import { syncItemFromWebhook, webhookAuthorized } from "@/server/services/pluggy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Aviso da Pluggy (item atualizado). Protegido por segredo na URL. O conteúdo do aviso NÃO é confiado:
 * só o itemId é usado e os dados são buscados de novo na Pluggy autenticado — um aviso forjado, no máximo, dispara uma sincronização.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!webhookAuthorized(url.searchParams.get("s"))) return Response.json({ error: "Não autorizado" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { event?: string; itemId?: string } | null;
  if (!body?.itemId || !/^(item\/(created|updated)|transactions\/)/.test(body.event ?? "item/updated")) return Response.json({ ok: true, ignored: true });
  const n = await syncItemFromWebhook(body.itemId);
  return Response.json({ ok: true, links: n });
}
