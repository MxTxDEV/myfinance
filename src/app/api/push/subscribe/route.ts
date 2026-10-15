import { z } from "zod";
import { getOwner } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";
const body = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }) });

export async function POST(req: Request) {
  if (!(await getOwner())) return Response.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({ where: { endpoint }, update: { p256dh: keys.p256dh, auth: keys.auth }, create: { endpoint, p256dh: keys.p256dh, auth: keys.auth } });
  return Response.json({ ok: true });
}
