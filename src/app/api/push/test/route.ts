import { z } from "zod";
import { getOwner } from "@/server/auth";
import { sendTestPush } from "@/server/services/daily";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await getOwner())) return Response.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().url(), kind: z.enum(["spend", "invest", "bill"]).default("spend") }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos" }, { status: 400 });
  return Response.json(await sendTestPush(parsed.data.endpoint, parsed.data.kind));
}
