import { z } from "zod";
import { getOwner } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await getOwner())) return Response.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
  return Response.json({ ok: true });
}
