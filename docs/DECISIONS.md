# Decisões e regras de negócio

## Arquitetura
- Next.js + Prisma + PostgreSQL (nenhuma stack pré-existente). Um único usuário: as tabelas **não** têm `userId`; o isolamento é feito exigindo sessão válida em middleware, páginas, rotas de API e Server Actions.
- Regras financeiras vivem em `src/domain` (puro, testável) e `src/server/services` (transações de banco). O frontend só exibe e envia intenções; **nenhum cálculo financeiro no cliente**.
- ORM: Prisma (escolha única). Sem Redis, filas ou microsserviços.

## Dinheiro
- Banco: `Decimal(14,2)` BRL. Domínio: **centavos inteiros** (`number`), conversão sem float (`toCents`/`toDecimalString`). Entradas da API são inteiros em centavos validados por Zod.
- Parcelamento: `base = floor(total/n)`; os centavos restantes vão 1 a 1 para as **primeiras** parcelas. A soma é sempre exatamente o total.
- Percentuais: arredondados a 1 casa com inteiros. Divisão por zero → `null` ("Não disponível").
- CHECK constraints no banco: valores > 0, contas de transferência distintas, dias de cartão válidos, saldo de dívida ≥ 0, movimentação não pode ter conta **e** cartão.

## Movimentações
- Tipos: `INCOME`, `EXPENSE`, `TRANSFER_IN/OUT`, `INVOICE_PAYMENT`, `DEBT_PAYMENT`. O valor é sempre positivo; o sinal vem do tipo.
- **Saldo da conta** = saldo inicial + movimentações `SETTLED` com data ≥ data do saldo inicial. **Previstas (`PLANNED`) nunca afetam o saldo real.**
- Relatórios de receita/despesa só consideram `INCOME`/`EXPENSE`. Transferências, pagamentos de fatura e de dívida **não** são receita nem despesa (evita contagem dupla).
- Exclusão é lógica (`deletedAt`). Excluir uma perna de transferência remove as duas; excluir uma parcela remove todo o parcelamento.
- Edição: transferências e pagamentos são editados pela própria operação; valor/data de compra parcelada não são editáveis (excluir e recadastrar).

## Cartões e faturas
- Compra no cartão = `EXPENSE` com `cardId`, **sem conta**, vinculada à fatura. Reconhecida como despesa na **data da compra/parcela** (competência); não reduz o saldo bancário; consome limite.
- Fatura que recebe a compra: compra até o dia de fechamento (**inclusive**) → fatura que fecha no mês; depois → mês seguinte. Dia 31 em mês curto usa o último dia. Vencimento = primeiro `dueDay` estritamente depois do fechamento.
- Parcela *k* tem data = data da compra + *k* meses (mantendo o dia, limitado ao fim do mês) e cai na fatura correspondente.
- **Limite usado** = tudo comprado no cartão (inclusive parcelas futuras) − pagamentos de fatura. Limite nunca entra em saldo, saldo projetado ou patrimônio.
- Pagamento (total/parcial) = `INVOICE_PAYMENT` saindo da conta (padrão: a do cartão), vinculado à fatura, limitado ao valor em aberto. Situação: Aberta / Fechada / Parcial / Paga / Atrasada.

## Recorrências
- Ocorrências são calculadas a partir da data inicial (sem deriva de fim de mês) e geradas como **previstas** até hoje + 35 dias.
- Idempotência: `@@unique([recurringId, occurrenceDate])` + checagem prévia; chamadas repetidas/concorrentes não duplicam (testado). Ocorrência excluída não é recriada.
- Recorrência em cartão gera compra já na fatura.

## Orçamento, metas, dívidas, patrimônio
- Orçamento: gasto do mês por categoria (inclui cartão, só efetivadas); alertas em 50/80/100% (configurável); "peso na renda" ≥ 30% das receitas.
- Meta: aporte/retirada é reserva interna (`GoalEntry`), **não** é receita nem altera saldo da conta; aparece como "reservado". Retirada ≤ acumulado. Viabilidade compara o valor mensal necessário ao excedente médio dos 3 meses completos anteriores; se inviável, mostra projeção em meses.
- Dívida: pagamento = `DEBT_PAYMENT` (saída de caixa) que reduz o saldo devedor; **não** é despesa. Juros/multas devem ser lançados como despesa ("Juros e taxas"). Simulação de quitação com juros mensais e pagamento extra.
- Patrimônio líquido = (saldos das contas + bens manuais) − (saldos devedores + faturas em aberto). Bens vivem só em `Asset` (sem somar duas vezes); limite de crédito não conta.
- Taxa de poupança = (receitas − despesas) ÷ receitas × 100.
- Despesas fixas = recorrentes + parcelas; variáveis = demais.

## Notificações
- Geradas ao abrir Início/Notificações, idempotentes por `dedupeKey` (uma por evento), tipos desligáveis e antecedência configurável. Sem push externo na v1.

## Investimentos
- Módulo próprio (`Investment` + histórico `InvestmentEntry`), manual, sem cotações. Valor atual é informado por você.
- **Aporte** com conta = saída da conta (`INVESTMENT_OUT`) e o valor do investimento sobe; **resgate** com conta = entrada (`INVESTMENT_IN`). Nenhum dos dois é despesa/receita nos relatórios. Sem conta, só registra a posição (dinheiro que já estava fora do app; usado também na posição inicial).
- Rendimento total = valor atual + resgatado − aportado; rentabilidade = rendimento ÷ aportado. Resgate não passa do valor atual.
- Patrimônio: investimentos entram **uma vez** (o aporte já reduziu a conta). Excluir um aporte/resgate pelo extrato desfaz tudo (conta, histórico e valor).

## Contas fixas
- Compromisso recorrente + painel do mês: previsto, pago, falta pagar, atrasado, custo mensal médio (semanal/quinzenal/anual convertidos para mês) e peso na renda.
- Editar valor/dados vale para as próximas ocorrências **não pagas** (inclusive vencidas em aberto); as pagas não mudam. Encerrar remove as futuras não pagas, mantém vencidas em aberto e o histórico.
- "Repetir" no lançamento rápido cria o compromisso e já marca o lançamento como a 1ª ocorrência (não duplica).

## Offline
- Cache de páginas (rede primeiro) + fila de lançamentos RECEBI/GASTEI com `clientId` único (índice único no banco): reenvio idempotente, inclusive concorrente. Pendentes **não** entram no saldo e são mostrados como pendentes. Sem edição/exclusão offline (evita conflitos).

## Mensagens e avisos por push
- Preferências em `Profile.notifyPrefs.menu` (validadas por zod, com padrão: 06:00–22:00, manhã + 4 sorteadas, intervalo mín. 60 min, avisos 3/1/0 dias; orçamento e metas desligados por padrão para não gerar excesso).
- **Sorteio determinístico e persistido** (`PushSlot`, único por dia+posição): mesma preferência + mesmo dia = mesmos horários; mudar a preferência refaz só o que ainda não foi enviado, respeitando o limite do dia. O "dia" é o de São Paulo; conversões usam o deslocamento real do fuso.
- **Envio exatamente uma vez:** o horário é reservado (`sentAt`) antes de enviar; se nenhum aparelho recebeu, a reserva é desfeita e tenta no próximo tick. Horário atrasado > 2 h é marcado como pulado.
- **Avisos de vencimento por estágio:** cada conta/fatura/dívida gera no máximo um aviso por estágio (`dueStage`: o menor estágio já alcançado), com chave de idempotência por estágio; o push sai agrupado e só dentro da janela de horário (antes disso, fica pendente até ela abrir, por até 24 h).
- O agendador é externo (cron-job.org, a cada 5 min); o app registra um batimento (`Heartbeat`) e avisa na tela se ele parar.
- **Conquistas** (`CELEBRATION`): meta (100%, e marcos 50/75), dívida quitada (saldo zero **com** pagamento registrado), mês anterior no azul e todos os orçamentos do mês anterior respeitados. Um por conquista (dedupeKey), sem valores em reais no texto. Saem por push individualmente (nunca agrupadas com vencimentos) e na hora, ao registrar aporte/pagamento (`celebrateNow`), sem nunca derrubar a ação que as originou.
- Mensagens: as de "pense antes de gastar" são texto puro e ganham um emoji estável por mensagem; as de investir e de incentivo já trazem emoji. O incentivo é duro mas não ofende (teste proíbe insultos). Emojis desligados são removidos no envio. Push de mensagem não contém valores financeiros.

## Importação de extratos e vínculos
- Fonte única de entrada: `previewStatement`/`commitStatement`; cada linha tem `importKey` (`conta|cartão : id do banco` ou hash data|valor|descrição + nº da ocorrência) com índice único. Reimportar nunca duplica, nem concorrente.
- Duplicado "provável" (lançado à mão) é só sugestão: vem desmarcado, o usuário decide. Pagamento de fatura no extrato da conta vem desmarcado para não contar a despesa duas vezes.
- Cartão: o sinal predominante do arquivo define o que é compra; o restante (pagamento/estorno) vem desmarcado.
- Lançamento **vinculado** reutiliza os serviços existentes (dívida: `DEBT_PAYMENT`; investimento: `INVESTMENT_OUT/IN`; meta: reserva interna sem mexer no saldo da conta), por isso herda todas as validações. **Conservação do patrimônio** (teste de integração): Δ patrimônio = receitas − despesas + valorização.

## Leitura de PDF
- Extração do texto com pdf.js **no navegador** (worker em `/pdf.worker.min.mjs`, copiado por `scripts/copy-pdf-worker.mjs`; CSP `worker-src 'self' blob:`): o PDF não sai do aparelho e não depende de limites de servidor. O servidor recebe só o texto (marcador `%%PDFTEXT%%`) e o interpreta com `parsePDFText` (puro e testado).
- Sinal da transação, em ordem de confiança: (1) variação do saldo da coluna de saldo; (2) marcador explícito (`-`, parênteses, `D/C`, `CR/DB`); (3) sugestão por palavras (recebido/depósito × compra/pagamento), sempre marcada "⚠ confira". Em fatura de cartão, valor sem sinal é compra.
- Não é IA: não interpreta imagem (PDF digitalizado é recusado com mensagem clara). Reimportar o mesmo PDF não duplica (mesma `importKey`); um mesmo lançamento vindo por PDF e depois por OFX cai na detecção de "provável duplicado".

## Segurança
- Senha com scrypt (N=2¹⁵) + salt; sessão JWT HS256 em cookie `httpOnly`/`sameSite=lax`/`secure` (prod), 14 dias, validada no middleware (assinatura) e no servidor (versão no banco). Limite de tentativas de login em memória (instância única — aceitável para uso pessoal; em serverless considere um limitador externo).
- Logs de erro não incluem dados financeiros. CSV neutraliza injeção de fórmulas.
- PWA: o service worker só cacheia a página offline; **dados financeiros nunca são cacheados** e não há fila offline (nada é exibido como salvo antes da confirmação do servidor; sem carregamento otimista).

## Dados de demonstração
Não há dados de demonstração nem fictícios no sistema. Valores como "R$ 4.600,00" aparecem apenas nos layouts do Figma, identificados como exemplo.

## Multiusuário e super administrador
- Isolamento por `userId` em 18 tabelas + cliente Prisma com escopo (extensão de consulta) que injeta/filtra o usuário e **falha sem usuário** (fail-closed). `prismaRaw` (sem escopo) só em auth, admin, agendador e scripts.
- O usuário do contexto vem de `AsyncLocalStorage` (`runAs`: cron/testes) ou, em requisições, do **cookie de sessão assinado** conferido no banco (cache de 10 s) — `enterWith` não propaga ao chamador após `await`, por isso não é a fonte única.
- Dados legados (modo aberto) passam à conta mais antiga, promovida a super admin por `scripts/bootstrap-admin.ts` (migração com backfill testada em dois cenários).
- Admin nunca vê valores/descrições (só contagens). Redefinição de senha pelo admin (senha temporária + troca obrigatória), sem e-mail. Cadastro público com limite por IP e botão para fechar.
- Chave de lançamento automático: hash sha256, só cria lançamentos, idempotente.
