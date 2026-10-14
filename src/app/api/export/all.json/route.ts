import { getOwner } from "@/server/auth";
import { exportAll } from "@/server/services/export";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await getOwner())) return Response.json({ error: "Não autorizado" }, { status: 401 });
  return new Response(JSON.stringify(await exportAll(), null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="finance-os-dados.json"', "cache-control": "no-store" },
  });
}
