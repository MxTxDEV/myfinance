// Textos de parabéns por conquistas. Várias versões por tipo; a escolha é estável para o mesmo item.
import { formatBRL } from "./money";

function pick<T>(arr: readonly T[], seed: string): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return arr[(h >>> 0) % arr.length];
}
export interface Celebration { title: string; body: string }

export function goalDone(name: string, id: string): Celebration {
  return pick<Celebration>([
    { title: "🏆 PARABÉNS! Meta concluída", body: `Você concluiu a meta “${name}”. Prometeu e cumpriu — é assim que se faz. Agora não pare: quem para aqui perde o embalo.` },
    { title: "🎉 Meta batida!", body: `“${name}” está CONCLUÍDA. Quem disse que você não ia conseguir acabou de perder a aposta. Escolha a próxima.` },
    { title: "🥇 Você conseguiu!", body: `Meta “${name}” completa. Guarde esse sentimento: é ele que paga o próximo objetivo. Quem para agora desperdiça essa vitória.` },
  ], id);
}
export function goalMilestone(name: string, percent: 50 | 75, id: string): Celebration {
  return percent === 75
    ? { title: "⚡ 75% da meta!", body: `“${name}” já está em 75%. Falta pouco — parar agora seria jogar todo o esforço no lixo. Termine.` }
    : pick<Celebration>([
        { title: "🔥 Metade do caminho!", body: `A meta “${name}” chegou a 50%. Desistir agora é perder tudo o que você já fez. Continue.` },
        { title: "💪 50% concluído", body: `“${name}” está na metade. O que veio até aqui foi o mais difícil de começar — não deixe isso se perder.` },
      ], id);
}
export function debtPaid(name: string): Celebration {
  return { title: "💥 DÍVIDA QUITADA!", body: `“${name}” está paga. Cada parcela valeu a pena: agora esse dinheiro volta a ser seu. Não volte a dever — quem recai perde tudo de novo.` };
}
export function monthWin(monthLabel: string, savingsRate: number | null): Celebration {
  const taxa = savingsRate !== null ? ` Você poupou ${savingsRate}% da renda.` : "";
  return { title: "📈 Mês no azul!", body: `Você fechou ${monthLabel} gastando menos do que ganhou.${taxa} Quem faz isso todo mês constrói liberdade. Repita.` };
}
export function budgetWin(monthLabel: string, count: number): Celebration {
  return { title: "✅ Orçamento respeitado!", body: `Você ficou dentro de ${count === 1 ? "todo o orçamento" : `todos os ${count} orçamentos`} de ${monthLabel}. Isso é disciplina de quem vai longe.` };
}
export { formatBRL };
