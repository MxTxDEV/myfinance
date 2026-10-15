# Finance OS

Sistema financeiro pessoal (usuário único), mobile-first e instalável como PWA.
**RECEBI** e **GASTEI** a um toque; contas, cartões, faturas, parcelas, recorrências, orçamento, metas, dívidas, patrimônio e relatórios.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind v4 · PostgreSQL · Prisma 6 · Zod · Recharts · Lucide · Vitest · Playwright.

## Rodando localmente

```bash
cp .env.example .env            # preencha DATABASE_URL e AUTH_SECRET (openssl rand -base64 48)
npm install
npm run db:migrate              # aplica as migrações
OWNER_EMAIL=voce@email.com OWNER_NAME="Seu Nome" OWNER_PASSWORD='uma-senha-longa' npm run db:seed-owner
npm run dev
```

`db:seed-owner` cria (ou troca a senha d)o proprietário e as categorias padrão. **Não há cadastro público**: só existe o proprietário criado por esse comando. Trocar a senha invalida todas as sessões.

## Testes

```bash
npm test                 # unitários (domínio) + integração (Postgres real, banco finance_os_test)
npm run typecheck
npx next build && npx playwright test   # E2E: login, rotas protegidas, fluxos, persistência, acessibilidade (axe)
```

Os testes de integração/E2E usam o banco `finance_os_test` (crie com `createdb`; usuário/senha de teste em `vitest.config.ts` e `playwright.config.ts`) e **apagam os dados dele** — nunca aponte para o banco real.

## Deploy (Vercel + PostgreSQL gerenciado)

1. Crie um Postgres gerenciado (Neon, Supabase, Vercel Postgres) com backup/PITR habilitado.
2. Na Vercel, defina `DATABASE_URL` e `AUTH_SECRET` (somente no servidor; nada vai para o frontend).
3. Rode `npm run db:migrate` e `npm run db:seed-owner` uma vez apontando para o banco de produção.
4. HTTPS é automático na Vercel; o app envia HSTS, CSP, `X-Frame-Options: DENY` e demais headers (`next.config.ts`).

## Offline

O app é instalável (PWA) e funciona sem internet:
- As telas principais são salvas no aparelho (ficam em cache do navegador). Sem conexão você **vê os últimos dados** e uma faixa avisa que está offline.
- **RECEBI/GASTEI offline:** o lançamento vai para uma fila no aparelho (IndexedDB), marcada como **pendente** — *não* conta no saldo até chegar ao servidor. Ao voltar a internet é enviado sozinho; cada lançamento tem um identificador único, então reenvios **nunca duplicam**. Se o servidor recusar (ex.: categoria arquivada), o app mostra o erro e deixa você descartar.
- Outras ações (editar, excluir, cartões, planejamento…) exigem internet.
- Ao **Sair**, as telas salvas no aparelho são apagadas.
- O offline só existe no app publicado (build de produção); no `npm run dev` o service worker fica desligado.

## Mensagens e avisos (push)

O que chega no celular (tudo configurável em **Início → sino → Organizar notificações**):
- **Mensagem da manhã** (06:00) e **mensagens sorteadas** ao longo do dia, em horários aleatórios entre 06:00 e 22:00 (janela, quantidade de 0 a 10 por dia e intervalo mínimo ajustáveis). Duas categorias: **“pense antes de gastar”** (100 mensagens, em `src/domain/messages.ts`) e **“invista em vez de gastar”** (70, em `src/domain/messages-invest.ts`), alternadas; nenhuma repete antes de todas saírem. Emojis liga/desliga.
- **Avisos de vencimento**: contas e lançamentos previstos, faturas do cartão (fechamento e vencimento) e dívidas, 3 dias antes, 1 dia antes e no dia (escolha os momentos), mais atrasos. Vários avisos juntos viram **uma só** notificação. Orçamento, metas e resumo do mês são opcionais. Fora da janela de horário, nada é enviado.
- Os horários sorteados do dia aparecem na tela (“Hoje”); a mensagem só é mostrada depois de enviada.

### Configuração (uma vez)
1. Na Vercel, defina `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:voce@email.com`) e `CRON_SECRET` (gere com `npm run vapid`) e faça redeploy.
2. No app: **sino → Neste aparelho → Ativar** (no iPhone, só com o app instalado na Tela de Início, iOS 16.4+). Use os botões de teste (Gastar / Investir / Vencimento).
3. **Agendador (obrigatório para os horários aleatórios).** O plano Hobby da Vercel só agenda 1 vez por dia, então use o cron-job.org (grátis):
   - Crie conta em cron-job.org → **Create cronjob**.
   - **URL:** `https://SEU-APP.vercel.app/api/cron/tick` · **Schedule:** *Every 5 minutes*.
   - Aba **Advanced → Headers:** nome `Authorization`, valor `Bearer <seu CRON_SECRET>`.
   - Salve e clique **Test run**: deve responder `200` com `{"ok":true,…}`. Em **Notificações → Agendador** o app mostra “Ativo — última verificação há X min” (ou avisa que parou).
   O fuso (Brasília) é tratado no servidor; o `vercel.json` mantém uma chamada diária como reserva.

Garantias: cada horário é enviado **uma única vez**, mesmo com vários agendadores; se o agendador ficar parado e um horário atrasar mais de 2 h, ele é pulado (nada chega fora de hora); cada aviso de vencimento é enviado uma vez por estágio.

Limites: a notificação do sistema usa o som padrão do aparelho (o som de **caixa registradora**, `public/sounds/caixa-registradora.wav`, toca ao abrir o app, no botão 🔊 e quando a notificação chega com o app aberto); push no iPhone exige app instalado; as mensagens de push nunca levam valores em reais (tela bloqueada) — exceto os avisos de vencimento, que citam a conta e o valor.

## Backup e recuperação

```bash
DATABASE_URL=... ./scripts/backup.sh backups       # pg_dump comprimido, mantém os 30 últimos
DATABASE_URL=... ./scripts/restore.sh backups/x.dump   # restaura (pede confirmação)
```
Backup/restauração foram testados de ponta a ponta. Agende o script e copie os arquivos para fora do servidor. Em Perfil há ainda **exportação de movimentações (CSV)** e **de todos os dados (JSON)**.

## Documentação

- [`docs/DECISIONS.md`](docs/DECISIONS.md) — regras de negócio e decisões (leia antes de mexer em cálculos).
- [`docs/DESIGN.md`](docs/DESIGN.md) — identidade visual, tokens e link do Figma.
- [`docs/STATUS.md`](docs/STATUS.md) — o que está feito por fase, pendências e limitações conhecidas.
