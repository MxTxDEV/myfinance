# Ligação automática com o banco (Open Finance via Pluggy)

**Situação:** implementada, **ainda não validada com a API real** (o ambiente de desenvolvimento não alcança api.pluggy.ai; os testes usam respostas simuladas baseadas no SDK oficial `pluggy-sdk`). Valide primeiro em **sandbox**.

## Como funciona
1. Perfil → **Banco e cartão (Open Finance)** → *Conectar meu banco*: abre o widget da Pluggy (`pluggy-connect-sdk`). Você autoriza no ambiente do banco; o app **nunca vê sua senha bancária**.
2. O servidor gera um *connect token* com `clientUserId = seu usuário`. Ao receber o `itemId`, confere na Pluggy que o item é **seu** antes de guardar (um item de outra conta é recusado).
3. Cada conta/cartão do banco pode ir para: uma conta/cartão que você já tem, **ser criado** a partir do banco (saldo inicial calculado para o saldo do app bater com o do banco; limite e dias de fechamento/vencimento vêm do banco), ou *não importar*.
4. **Sincronizar:** 30 dias no primeiro acesso, depois janela de 7 dias para trás. Cada lançamento entra por `createTransaction` com `importKey = pluggy:<id>` (idempotente). Regras: pendentes ignorados até virarem postados; no cartão só compras (pagamentos/estornos ficam de fora); na conta, pagamento de fatura é ignorado se houver cartão ligado (pague a fatura no app); lançamento igual (valor, ±1 dia, mesmo destino) já feito à mão/atalho **não duplica**; categoria pelo que você já usou, senão "Outras…".
5. **Automático:** webhook `POST /api/webhooks/pluggy?s=<segredo>` (a URL é registrada no *connect token*; exige `https`) sincroniza na hora; o agendador (`/api/cron/tick`) reconcilia a cada ~6 h. O conteúdo do webhook não é confiado: só o `itemId`, e os dados são buscados de novo, autenticados.
6. **Desconectar** apaga o item na Pluggy (revoga o acesso) e o vínculo; o que já foi importado fica.

## Configuração (Vercel → Environment Variables)
`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` (do dashboard.pluggy.ai), `PLUGGY_SANDBOX=1` para testar com bancos de teste, `APP_URL=https://seu-app.vercel.app` (opcional). Segredos só no servidor.

## Limites conhecidos
- O modelo de cobrança/limites do plano gratuito da Pluggy muda; confira no dashboard. A renovação do consentimento do Open Finance é periódica (o status do vínculo aparece em caso de erro).
- Faturas: as compras entram como compras do cartão (o app monta a fatura pelas regras de fechamento do cartão criado/ligado); parcelas chegam como lançamentos individuais com "(n/N)".
- Ainda não há reconciliação de saldo automática depois da primeira sincronização.
