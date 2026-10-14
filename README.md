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
