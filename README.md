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

## Mensagem das 06:00 (push)

Todo dia às 06:00 (Brasília) o servidor envia uma mensagem do banco em `src/domain/messages.ts` (100 mensagens; edite/acrescente à vontade — nenhuma repete antes de todas saírem).

1. Gere as chaves: `npm run vapid` e coloque na Vercel: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (ex.: `mailto:voce@email.com`) e `CRON_SECRET`.
2. O agendamento diário está em `vercel.json` (`0 9 * * *` UTC = 06:00 de Brasília). **No plano Hobby da Vercel o horário do cron não é exato: roda em algum momento da hora marcada (entre 06:00 e 06:59).** Para pontualidade exata, use um agendador gratuito como o cron-job.org chamando `GET https://SEU-APP.vercel.app/api/cron/daily` às 06:00 (fuso America/Sao_Paulo) com o cabeçalho `Authorization: Bearer <CRON_SECRET>`; o envio é protegido para sair **uma única vez por dia**, mesmo com os dois agendadores ligados.
3. No app: **Início → sino (Notificações) → Mensagem das 06:00 → Ativar neste aparelho**. No iPhone, só funciona com o app instalado na Tela de Início (iOS 16.4+).
4. A notificação do sistema usa o som padrão do aparelho (navegadores não permitem som personalizado em push). O som de **caixa registradora** (`public/sounds/caixa-registradora.wav`) toca ao abrir a mensagem no app, no botão 🔊 e quando a notificação chega com o app aberto. Para usar o som também fora do app, no Android escolha-o nas configurações de notificação do site/app instalado.

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
