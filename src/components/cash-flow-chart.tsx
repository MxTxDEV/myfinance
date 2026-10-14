"use client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/domain/money";

export function CashFlowChart({ data }: { data: { day: string; income: number; expense: number }[] }) {
  const sr = data.map((d) => `${d.day}: receitas ${formatBRL(d.income)}, despesas ${formatBRL(d.expense)}`).join("; ");
  return (
    <div role="img" aria-label={`Fluxo diário. ${sr}`} className="h-44 w-full">
      <ResponsiveContainer>
        <BarChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barGap={2}>
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} interval="preserveStartEnd" />
          <YAxis hide />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} formatter={(v, n) => [formatBRL(Number(v)), n === "income" ? "Receitas" : "Despesas"]}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }} labelFormatter={(l) => `Dia ${l}`} />
          <Bar dataKey="income" fill="var(--income)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="var(--expense)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
