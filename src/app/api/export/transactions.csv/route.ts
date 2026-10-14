import { getOwner } from "@/server/auth";
import { transactionsCsv } from "@/server/services/export";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await getOwner())) return Response.json({ error: "Não autorizado" }, { status: 401 });
  return new Response(await transactionsCsv(), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="movimentacoes.csv"', "cache-control": "no-store" },
  });
}
