import { cronAuthorized } from "@/server/cron-auth";
import { runTick } from "@/server/services/scheduler";

export const dynamic = "force-dynamic";

/**
 * Chame a cada ~5 minutos (cron-job.org) — e 1x/dia pelo Vercel Cron como reserva.
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Não autorizado" }, { status: 401 });
  return Response.json({ ok: true, ...(await runTick()) });
}
