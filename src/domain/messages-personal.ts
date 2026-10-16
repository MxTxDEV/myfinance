import { formatBRL } from "./money";
import type { Cents } from "./money";

/** Os SEUS números do momento. Tudo em centavos. */
export interface PersonalStats {
  smallLimit: Cents; // "compra pequena" = até esse valor (R$ 30)
  today: { smallCount: number; smallTotal: Cents };
  week: { smallCount: number; smallTotal: Cents };
  month: { smallCount: number; smallTotal: Cents; spent: Cents; income: Cents; day: number; daysInMonth: number };
  topCategory: { name: string; total: Cents } | null;
  fixedMonthly: Cents;
  debt: { total: Cents; monthlyInterest: Cents; count: number };
}

const R = (c: Cents) => formatBRL(c).replace(/ /g, " ");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a * 100) / b) : 0);

/**
 * Mensagens montadas com os seus dados. Só entra na lista o que tem base real (ex.: nada de "suas compras pequenas"
 * se você não fez nenhuma). Retorna vazio quando ainda não há dados — o chamador usa uma mensagem comum.
 */
export function personalMessages(s: PersonalStats): string[] {
  const out: string[] = [];
  const lim = R(s.smallLimit);
  const m = s.month;
  const projected = m.day > 0 ? Math.round((m.spent / m.day) * m.daysInMonth) : 0;

  if (s.today.smallCount >= 2) {
    out.push(`🧾 Hoje você já fez ${s.today.smallCount} compras de até ${lim}: ${R(s.today.smallTotal)}. Se isso for todo dia, são ${R(s.today.smallTotal * 30)} por mês.`);
  }
  if (s.week.smallCount >= 3) {
    out.push(`📆 Nos últimos 7 dias: ${s.week.smallCount} compras de até ${lim}, somando ${R(s.week.smallTotal)}. Em um mês, nesse ritmo, são ${R(Math.round((s.week.smallTotal * 30) / 7))} que você nem sentiu sair.`);
  }
  if (m.smallCount >= 8 && m.spent > 0) {
    out.push(`🔎 Neste mês, ${m.smallCount} compras pequenas (até ${lim}) já somam ${R(m.smallTotal)}, ${pct(m.smallTotal, m.spent)}% de tudo que você gastou. É aqui que o mês vaza.`);
  }
  if (m.income > 0 && m.day >= 5) {
    if (projected > m.income) {
      out.push(`🚨 Nesse ritmo você fecha o mês gastando ${R(projected)} para uma renda de ${R(m.income)}: ${R(projected - m.income)} no negativo. As compras de 10, 20 reais acumuladas pesam nisso.`);
    } else if (pct(m.spent, m.income) > Math.round((m.day * 100) / m.daysInMonth) + 10) {
      out.push(`⚠️ Você já usou ${pct(m.spent, m.income)}% da renda do mês e estamos em ${Math.round((m.day * 100) / m.daysInMonth)}% do mês. Freie agora ou o fim do mês aperta.`);
    } else if (m.spent > 0) {
      out.push(`✅ Até aqui você usou ${pct(m.spent, m.income)}% da renda e o mês está em ${Math.round((m.day * 100) / m.daysInMonth)}%. Mantenha: cada gasto fora do plano tira daqui.`);
    }
  }
  if (s.topCategory && m.spent > 0) {
    out.push(`📊 O que mais pesa neste mês é ${s.topCategory.name}: ${R(s.topCategory.total)} (${pct(s.topCategory.total, m.spent)}% dos seus gastos). Vale cortar aí primeiro.`);
  }
  if (s.fixedMonthly > 0 && m.income > 0) {
    const left = m.income - s.fixedMonthly;
    out.push(left > 0
      ? `🏠 Suas despesas fixas levam ${pct(s.fixedMonthly, m.income)}% da renda (${R(s.fixedMonthly)}). Sobram ${R(left)} para todo o resto, incluindo dívidas e o que você quer guardar.`
      : `🏠 Suas despesas fixas (${R(s.fixedMonthly)}) já passam da renda do mês (${R(m.income)}). Sem cortar ou renegociar algo, qualquer gasto novo vira dívida.`);
  }
  if (s.debt.total > 0) {
    out.push(`💳 Você deve ${R(s.debt.total)} em ${s.debt.count} ${s.debt.count === 1 ? "dívida" : "dívidas"}${s.debt.monthlyInterest > 0 ? ` e os juros estimados custam cerca de ${R(s.debt.monthlyInterest)} por mês` : ""}. Cada real que você não gasta à toa encurta esse caminho.`);
    if (s.debt.monthlyInterest > 0) out.push(`🔥 Só de juros você paga ~${R(s.debt.monthlyInterest)} por mês: dinheiro que não compra nada e não volta. Veja o plano de quitação no app.`);
  }
  return out;
}
