# Lançamento automático (cartão de crédito / banco)

Cada conta tem **chaves pessoais** (Perfil → Lançamento automático). Quem tem a chave pode *criar lançamentos* na sua conta — nada além disso (não lê dados). Revogue a qualquer momento. Só o hash da chave é guardado; o valor completo aparece uma única vez.

## Endpoint
`POST https://SEU-APP/api/ingest/transaction` · `Authorization: Bearer fos_…` · JSON:

```json
{ "amount": "42,90", "merchant": "Padaria", "card": "Roxo", "id": "opcional-único" }
```
- `amount` (número ou texto "R$ 1.234,56"), `description` ou `merchant`; `type` `EXPENSE` (padrão) | `INCOME`; `date` AAAA-MM-DD (padrão: hoje); `card` ou `account` pelo nome (sem nome: usa o único cartão/conta); `category` opcional (senão a que você já usou para essa descrição, ou "Outras…"); `id` do remetente evita duplicar.
- Idempotente: o mesmo aviso nunca vira dois lançamentos (mesmo `id`, ou mesmo valor+local na mesma janela de 5 min). Limite de 60 req/min por conta.
- Respostas: 200 `{id, duplicate}`, 400/422 dados inválidos, 401 chave inválida, 429 limite.

## iPhone (Atalhos → Automação → Transação)
Ao pagar com Apple Pay, o Atalho recebe *Cartão, Comerciante, Valor*; use a ação "Obter conteúdo de URL" (POST, JSON, cabeçalho `Authorization`) com esses campos.

## Android
Tasker/MacroDroid lendo a notificação do app do banco ou do Google Wallet e chamando o mesmo endpoint.

## Limites (honestidade)
Só cobre pagamentos que geram aviso no aparelho (carteira digital/notificação do app do banco). Compra online com número do cartão ou débito automático não dispara. Para sincronizar o banco inteiro é preciso Open Finance (ver OPEN_FINANCE.md).
