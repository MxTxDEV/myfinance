# Status por fase

| Fase | Situação |
|---|---|
| 1 Fundação e design | ✅ Arquitetura, Figma (tokens + 4 telas), design system em código, Postgres + migrações, autenticação real |
| 2 Núcleo financeiro | ✅ Dashboard, RECEBI/GASTEI, histórico (busca, filtros, ordenação, totais, paginação), categorias, contas, transferências, saldos |
| 3 Compromissos | ✅ Cartões, faturas, parcelamento, pagamento total/parcial, recorrências idempotentes, contas a pagar/receber |
| 4 Planejamento | ✅ Orçamentos, metas, dívidas (+simulação), patrimônio, relatórios, projeção, notificações, CSV/JSON, resumo imprimível |
| 5 Qualidade | ✅ Testes, headers/CSP, a11y (axe), PWA, backup/restore testado · ⏳ ver pendências |

## Atualização — offline, investimentos, contas fixas e mensagens
✅ App offline com fila e sincronização idempotente · ✅ Investimentos (aporte/resgate/valor/rentabilidade/distribuição) · ✅ Contas fixas (painel do mês, editar, encerrar, repetir) · ✅ 170 mensagens (gastar + investir, com emojis) em horários aleatórios 06:00–22:00 com menu de configuração · ✅ avisos push de vencimento de contas, faturas e dívidas (estágios 3/1/0 dias, agrupados) · ✅ parabéns por conquistas (meta, dívida, mês no azul, orçamento) · ✅ incentivo agressivo "não desista" · ✅ som de caixa registradora.
✅ Importação de extrato/fatura (PDF, OFX, CSV) com categoria aprendida e anti-duplicidade · ✅ lançamento vinculado a dívida/investimento/meta · ✅ teste de conservação do patrimônio entre todos os módulos · ⏳ ligação automática com o banco (Open Finance): plano em `docs/OPEN_FINANCE.md`, depende de provedor e credenciais.
Limitações do PDF: só PDFs com texto (não digitalizados) e layouts que sigam "data + descrição + valor"; layouts muito diferentes podem exigir ajuste do interpretador (envie um exemplo sem dados sensíveis).
Limitações: os horários aleatórios exigem um agendador externo chamando `/api/cron/tick` a cada 5 min (cron-job.org); som personalizado só dentro do app; push no iPhone exige app instalado; offline não permite editar/excluir.

## Testes
- Unitários: dinheiro/arredondamento, datas, ciclo de cartão, recorrência, orçamento, metas, patrimônio, dívidas.
- Integração (Postgres real): criação/edição/exclusão/duplicação, saldos, previstas, transferências, cartão (limite, faturas, parcelas, pagamento total/parcial), recorrências (incluindo chamadas concorrentes), orçamento, metas, dívidas, patrimônio, relatórios, notificações, desempenho com 10.000 registros.
- E2E (navegador real): rotas e APIs protegidas, senha errada, fluxo conta→receita→gasto→saldo, persistência após recarregar, ocultar valores, sem rolagem horizontal, cartão parcelado/pagamento parcial, orçamento/meta, acessibilidade (axe WCAG A/AA) em 5 telas.

## Pendências e limitações conhecidas
- Edição de dívida, meta e orçamento pela interface (a regra de orçamento é "upsert": redefinir o limite edita). Transferências podem ser editadas na lista e são criadas em Perfil.
- Anexos: o campo existe no modelo (`attachmentUrl`), mas não há upload na v1.
- Edição de recorrência (hoje: pausar/retomar e recriar).
- Limitador de login é em memória (instância única).
- Saldos são calculados em memória a partir das movimentações efetivadas (rápido até dezenas de milhares; para volumes maiores, mover para agregação SQL).
- Sem fila offline: sem internet o app mostra a página offline e não registra nada.

- Multiusuário + super admin + chave de lançamento automático: implementado e testado (integração e E2E). Open Finance direto: pendente de escolha de provedor.
- Pluggy (Open Finance): implementado (widget, mapeamento, sincronização idempotente, webhook, reconciliação); testes com API simulada. Falta validar em sandbox com credenciais reais.
- Mensagens: até 100/dia, personalizadas com os dados do usuário; Planejamento: plano de quitação (avalanche/bola de neve), orçamento ideal ("quanto posso gastar"), despesas fixas simples, tipos de dívida e edição.
- Aba Cartões (Planejamento): por cartão, fatura atual/próxima/seguintes, limite usado, informar saldo e parcelas por fatura, juros; cartões entram sozinhos no plano de quitação.
- Landing page premium (/bem-vindo e / para visitantes): capturas reais com dados fictícios, motion em CSS, bento, demo guiada, analytics preparado, SEO; pendentes: preços, termos/privacidade, vídeo, analytics real (docs/LANDING.md).
