# Finance OS

Sistema financeiro pessoal **multiusuário** (cada pessoa só vê os próprios dados; um super administrador gerencia as contas), mobile-first e instalável como PWA.
**RECEBI** e **GASTEI** a um toque; contas, cartões, faturas, parcelas, recorrências, orçamento, metas, dívidas, patrimônio e relatórios.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind v4 · PostgreSQL · Prisma 6 · Zod · Recharts · Lucide · Vitest · Playwright.

## Rodando localmente

```bash
cp .env.example .env            # preencha DATABASE_URL e AUTH_SECRET (openssl rand -base64 48)
npm install
npm run db:migrate              # aplica as migrações
SUPERADMIN_EMAIL=voce@email.com SUPERADMIN_PASSWORD='senha-temporaria-longa' npm run db:bootstrap
npm run dev
```

`db:bootstrap` (roda também no `npm run build`/deploy) cria o **super administrador** a partir de `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`. A senha é temporária: no primeiro acesso o app exige trocá-la. Se já existir um administrador, nada é sobrescrito (use `SUPERADMIN_FORCE_RESET=1` se esquecer a senha). Se houver dados da versão de usuário único, a conta mais antiga é promovida a administrador e **fica com esses dados**.

## Contas e administração
- **Cadastro público** em `/cadastro` (pode ser desligado em **Perfil → Painel do administrador**). Sem serviço de e-mail: quem esquecer a senha pede ao administrador, que gera uma senha temporária (a troca é exigida no acesso seguinte).
- **Painel `/admin`** (só super admin): lista contas (só contagem de lançamentos — **nunca valores ou descrições**), cria contas com senha temporária, desativa/reativa, gera nova senha, exclui conta e todos os dados dela.
- **Isolamento:** toda tabela de dados tem `userId`; o acesso passa por um cliente Prisma com escopo (`src/server/db.ts`) que injeta o usuário da sessão em toda consulta e **falha** se não houver usuário. Testes em `tests/integration/multiuser.test.ts`.
- Cada pessoa pode excluir a própria conta e todos os dados (Perfil → Conta).

## Lançamento automático (cartão/banco)
Veja [docs/AUTOMACAO.md](docs/AUTOMACAO.md): chave pessoal + endpoint `POST /api/ingest/transaction` para Atalhos do iPhone/Tasker. Ligação direta com o banco via Open Finance (Pluggy): [docs/OPEN_FINANCE.md](docs/OPEN_FINANCE.md).

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
3. Defina `SUPERADMIN_EMAIL` e `SUPERADMIN_PASSWORD` (temporária). O build aplica as migrações e cria o administrador. **Não** defina `AUTH_DISABLED` (removido): o login é sempre exigido.
4. HTTPS é automático na Vercel; o app envia HSTS, CSP, `X-Frame-Options: DENY` e demais headers (`next.config.ts`).

## Importar extrato do banco e fatura do cartão

Em **Perfil → Importar extrato do banco ou fatura**: escolha a conta (extrato) ou o cartão (fatura), envie o arquivo **PDF, OFX ou CSV** baixado no app do banco, revise e confirme.
- **PDF:** é lido **no seu aparelho** (o arquivo não é enviado ao servidor, só o texto extraído). Funciona com PDFs de texto (a maioria dos extratos e faturas) e pede a senha se o PDF for protegido. O entendimento é por regras (datas, valores, coluna de saldo, marcadores D/C), não por IA: cada linha vem com botão para trocar entrada/saída e as duvidosas aparecem com “⚠ confira”. PDF digitalizado (imagem) não tem texto e não é lido — nesse caso use OFX/CSV. Sempre que o banco oferecer OFX, ele é o formato mais confiável.
- Reconhece formatos brasileiros (data dd/mm/aaaa, `1.234,56`, `;` ou `,`, colunas Débito/Crédito).
- **Categoria sugerida** pelo que você já lançou com a mesma descrição; você ajusta antes de gravar.
- **Não duplica:** reimportar o mesmo arquivo não cria nada de novo; lançamentos que você já digitou à mão (mesmo valor, ±1 dia) vêm desmarcados.
- **Pagamento de fatura** no extrato da conta vem desmarcado (a fatura já foi contada nas compras do cartão; pague-a em Perfil → cartão → Pagar). Na fatura, pagamentos/estornos também ficam de fora.
- O que é importado funciona como qualquer lançamento: saldo, fatura/limite, orçamento, relatórios, metas e patrimônio atualizam juntos.
- Ligação **automática** com o banco (Open Finance): ver `docs/OPEN_FINANCE.md`.

## Lançamento vinculado (tudo sincronizado)
No RECEBI/GASTEI, em **Mais detalhes → Vincular a**, o mesmo lançamento pode pagar uma **dívida**, aportar em um **investimento**, guardar em uma **meta** ou resgatar um investimento. Ele atualiza a conta, o saldo da dívida/valor do investimento/progresso da meta, os relatórios e o patrimônio de uma vez. Um teste automático garante a conservação do patrimônio: só receitas, despesas e valorizações o alteram; transferências, aportes, resgates, pagamento de fatura/dívida e reserva de meta não.

## Offline

O app é instalável (PWA) e funciona sem internet:
- As telas principais são salvas no aparelho (ficam em cache do navegador). Sem conexão você **vê os últimos dados** e uma faixa avisa que está offline.
- **RECEBI/GASTEI offline:** o lançamento vai para uma fila no aparelho (IndexedDB), marcada como **pendente** — *não* conta no saldo até chegar ao servidor. Ao voltar a internet é enviado sozinho; cada lançamento tem um identificador único, então reenvios **nunca duplicam**. Se o servidor recusar (ex.: categoria arquivada), o app mostra o erro e deixa você descartar.
- Outras ações (editar, excluir, cartões, planejamento…) exigem internet.
- Ao **Sair**, as telas salvas no aparelho são apagadas.
- O offline só existe no app publicado (build de produção); no `npm run dev` o service worker fica desligado.

## Mensagens e avisos (push)

O que chega no celular (tudo configurável em **Início → sino → Organizar notificações**):
- **Mensagem da manhã** (06:00) e **mensagens sorteadas** ao longo do dia, em horários aleatórios entre 06:00 e 22:00 (janela, quantidade de 0 a 10 por dia e intervalo mínimo ajustáveis). Três categorias, alternadas: **“pense antes de gastar”** (100 mensagens, `src/domain/messages.ts`), **“invista em vez de gastar”** (70, `src/domain/messages-invest.ts`) e **“incentivo / não desista”** (64, agressivas, no formato do que você perde se desistir — `src/domain/messages-motivation.ts`); nenhuma repete antes de todas saírem. Emojis liga/desliga.
- **Avisos de vencimento**: contas e lançamentos previstos, faturas do cartão (fechamento e vencimento) e dívidas, 3 dias antes, 1 dia antes e no dia (escolha os momentos), mais atrasos. Vários avisos juntos viram **uma só** notificação. Orçamento, metas e resumo do mês são opcionais. Fora da janela de horário, nada é enviado.
- **Parabéns por conquistas** (ligue/desligue em “Comemorar minhas conquistas”): meta concluída (e marcos de 50% e 75%), dívida quitada, mês fechado no azul e orçamentos respeitados. Chega por push (sozinho, na hora, quando você registra o aporte ou o pagamento) e vira um cartão verde no topo do Início até você dispensar. Textos em `src/domain/celebrations.ts`.
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

**Não está chegando?** Abra Início → sino → **Por que não chegou?**: a tela mostra se as chaves estão no servidor, se há aparelho ativado e se o agendador está rodando, e tem o botão “Rodar o envio agora” para testar de ponta a ponta. Sem o agendador só chegam os testes manuais.

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
