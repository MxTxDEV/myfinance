import { timingSafeEqual } from "node:crypto";
import { sendDailyPush } from "@/server/services/daily";
import { generateRecurring } from "@/server/services/recurring";
import { generateNotifications } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false; // sem segredo configurado, a rota fica fechada
  const url = new URL(req.url);
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? url.searchParams.get("secret") ?? "";
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Chamado todo dia (Vercel Cron: Authorization: Bearer CRON_SECRET) ou por um agendador externo às 06:00. */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Não autorizado" }, { status: 401 });
  const push = await sendDailyPush();
  await generateRecurring();
  await generateNotifications();
  return Response.json({ ok: true, ...push });
}
