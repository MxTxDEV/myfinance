"use client";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/domain/money";

const NAMES: Record<string, string> = { income: "Receitas", expense: "Despesas", balance: "Saldo" };
export function SeriesChart({ data }: { data: { label: string; income: number; expense: number; balance: number }[] }) {
  const sr = data.map((d) => `${d.label}: receitas ${formatBRL(d.income)}, despesas ${formatBRL(d.expense)}, saldo ${formatBRL(d.balance)}`).join("; ");
  return (
    <div role="img" aria-label={`Evolução mensal. ${sr}`} className="h-56 w-full">
      <ResponsiveContainer>
        <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
          <YAxis hide />
          <Tooltip formatter={(v, n) => [formatBRL(Number(v)), NAMES[String(n)] ?? n]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }} />
          <Bar dataKey="income" fill="var(--income)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="var(--expense)" radius={[4, 4, 0, 0]} />
          <Line dataKey="balance" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
