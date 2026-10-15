# Ligação automática com o banco (Open Finance) — plano

**Situação:** ainda não implementada. O app já tem todo o "cano" por onde as transações entram sozinhas:
`previewStatement` → `commitStatement` → `createTransaction` com `importKey` único (idempotente). Hoje a fonte é um arquivo
OFX/CSV; a ligação automática seria só **outra fonte** alimentando o mesmo cano.

## Por que não dá para fazer "direto"
Bancos brasileiros só liberam dados a instituições autorizadas no Open Finance. Um app pessoal precisa de um **intermediário
(agregador)** autorizado — por exemplo Pluggy ou Belvo (confira as condições atuais, inclusive planos gratuitos/pessoais).
O usuário autoriza o consentimento no app do próprio banco (o app **nunca** vê senha bancária) e o agregador entrega as
transações por API/webhook.

## Arquitetura proposta
1. `src/server/connectors/<provedor>.ts`: busca contas/transações, devolve `StatementRow[]` (data, descrição, valor, `externalId`).
2. Tabela `BankLink` (provedor, id do vínculo, conta/cartão do app, última sincronização, validade do consentimento — renovar a cada 12 meses).
3. O agendador existente (`/api/cron/tick`) chama a sincronização; opcional webhook do provedor para sincronizar na hora.
4. Linhas novas entram por `commitStatement` (mesmas regras de saldo/fatura/limite/orçamento/relatórios/patrimônio), com:
   categoria aprendida, pagamento de fatura ignorado (já contado nas compras do cartão), duplicado provável (já lançado à mão) enviado para **revisão** em vez de gravar.
5. Segredos do provedor só em variáveis de ambiente do servidor.

## O que é preciso de você para eu implementar
- Qual provedor usar e uma conta de desenvolvedor dele (Client ID/Secret em **sandbox**).
- Quais bancos/cartões você quer ligar.
- Observação: este ambiente de desenvolvimento não alcança as APIs externas, então eu construiria contra a documentação do provedor
  com testes simulados e você validaria com uma conexão real de teste antes de confiar nos números.
