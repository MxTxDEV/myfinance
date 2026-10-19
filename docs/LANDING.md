# Landing page — Finance OS

Página comercial pública, no conceito **Premium Dark Finance**. Fica em `/bem-vindo` e é servida também em **`/`** para quem não tem sessão. Quem já está logado continua vendo o app em `/`; o app instalado (PWA, `start_url: /?pwa=1`) continua indo direto para o login.

## 1. O que foi auditado (e reaproveitado)
- Next.js 15 (App Router) · TypeScript · Tailwind v4 · Prisma/Postgres · autenticação própria (cookie JWT) · PWA. **Sem biblioteca de animação instalada** — não foi adicionada nenhuma dependência.
- Identidade existente: marca "Finance OS", violeta `#8b84ff`, verde de receita `#3dd68c`, fundo `#0b0d10`, fonte Inter (pilha do sistema). A landing usa essas cores, só mais profundas.
- Rotas reais usadas pelos CTAs: `/cadastro` (criar conta), `/login` (entrar). **Não há checkout** no app; nada simula compra.
- Funcionalidades mostradas = as que existem e têm teste: lançamento rápido, contas, cartões/faturas/parcelas, plano de quitação, "quanto posso gastar", orçamentos, despesas fixas, metas, importação OFX/CSV/PDF, avisos no celular, lançamento automático (Atalho + chave), offline/PWA, Open Finance (Pluggy, quando configurado).

## 2. Direção de arte e arquitetura
- Superfícies grafite/preto com bordas finas, glassmorphism só nos chips e na navegação, brilhos radiais discretos, tipografia grande e apertada, composição assimétrica (hero 2 colunas, problema em colunas editoriais, Bento Grid).
- **Capturas reais**: as telas nos celulares são prints do app verdadeiro, gerados com uma conta de demonstração **100% fictícia** (`scripts/landing-demo-seed.ts` + `scripts/landing-shots.mjs`). Estão identificadas como dados fictícios na página.
- Server Components para toda a estrutura; ilhas client mínimas em `src/components/landing/client.tsx` (navegação, abas da demo, vídeo, efeitos).

## 3. Motion
CSS puro + um único `IntersectionObserver` (`LandingEffects`): entrada da hero, scroll reveal, parallax (limitado a ±36 px, com rAF), chips e celular flutuando, barras que crescem, contadores (somente no exemplo fictício "Quanto posso gastar"), destaque do cartão de funcionalidade que passa pelo centro da tela, brilho que segue o ponteiro, microinterações em botões. `prefers-reduced-motion` desliga tudo e deixa o conteúdo visível (testado). Nada é animado como resultado financeiro real.

## 4. Onde editar (sem mexer em componentes)
Tudo em **`src/config/landing.ts`**: headline (e 4 variações para teste A/B), textos, problemas, funcionalidades, abas da demo, benefícios, passos, segurança, **planos**, FAQ, CTA final. Links/contatos/vídeo por variáveis de ambiente (veja `.env.example`, bloco "Landing page").
- **Vídeo**: `NEXT_PUBLIC_DEMO_VIDEO_URL` com MP4/WebM (URL ou arquivo em `public/`) ou YouTube/Vimeo (carrega só ao clicar, via `youtube-nocookie`). Vazio = a demonstração mostra só as telas.
- **Planos**: `plans = []` hoje → a página mostra "Preços em definição / hoje não há cobrança configurada". Preencha o array (nome, preço, período, benefícios, CTA, `href`, `highlight`, `checkout`) e os cartões aparecem. Com `checkout: true` o clique dispara `purchase_cta_click`.
- **Rodapé**: termos, privacidade, contato e razão social só aparecem quando preenchidos.
- **Trocar as capturas** depois de mudar o app: crie o banco `finance_os_demo`, rode `DATABASE_URL=…/finance_os_demo npx prisma migrate deploy && npx tsx scripts/landing-demo-seed.ts`, suba `npx next start -p 3300` com esse banco e rode `node scripts/landing-shots.mjs` (usa `sharp`, que já vem com o Next). Os arquivos vão para `public/landing/*.webp`. Se testar localmente, apague `.next/cache/images` para o Next não servir a versão antiga.

## 5. Analytics (`src/lib/analytics.ts`)
Eventos: `landing_view`, `cta_primary_click`, `demo_click`, `demo_video_play`, `pricing_view`, `purchase_cta_click`, `signup_start` (clique em qualquer CTA para `/cadastro`). Cada evento vai para `window.dataLayer` (GTM/GA4), `window.plausible` e um `CustomEvent("fos:analytics")`, **se existirem** — nenhum serviço é instalado. Respeita "Não rastrear"; nunca envia dados financeiros ou pessoais.
**Pendente (precisa de integração sua):** instalar o script de analytics (GTM/Plausible…) e `signup_complete` (exige disparar o evento após o cadastro: um pixel/tag na página pós-cadastro ou um evento server-side).

## 6. SEO e acessibilidade
Metadados + Open Graph/Twitter (imagem gerada em `opengraph-image.tsx`), canonical `/`, `robots.txt`, `sitemap.xml`, JSON-LD `SoftwareApplication` (sem preço/avaliação), HTML semântico, navegação por teclado (abas com setas), foco visível, link "Ir para o conteúdo", contraste checado com axe (0 violações sérias, desktop e celular), imagens `webp` (~60 KB), só a imagem da hero é prioritária.

## 7. Pendências comerciais (preencher)
| Item | Onde |
|---|---|
| Preços/planos e checkout | `plans` em `src/config/landing.ts` |
| Termos de uso e política de privacidade (**necessários antes de divulgar**) | `NEXT_PUBLIC_TERMS_URL`, `NEXT_PUBLIC_PRIVACY_URL` |
| E-mail de contato | `NEXT_PUBLIC_CONTACT_EMAIL` |
| Razão social/CNPJ | `NEXT_PUBLIC_COMPANY_INFO` |
| Vídeo de demonstração | `NEXT_PUBLIC_DEMO_VIDEO_URL` |
| Domínio oficial (OG/sitemap) | `NEXT_PUBLIC_SITE_URL` |
| Depoimentos, número de usuários, avaliações | **não existem** — não foram inventados |
| Analytics + `signup_complete` | seção 5 |

## 8. Testes
`tests/e2e/landing.spec.ts`: landing em `/` para visitante e login para `?pwa=1`; rotas privadas continuam 401; metas SEO; CTAs apontam para `/cadastro` e disparam eventos; demo por teclado; FAQ; planos sem preço inventado; sem rolagem horizontal, sem erros no console e sem violações sérias de acessibilidade (desktop e celular); movimento reduzido; usuário logado continua vendo o app.

## 9. Executar e publicar
`npm run dev` → `http://localhost:3000/bem-vindo`. Deploy: igual ao app (Vercel). Nada novo é necessário; variáveis `NEXT_PUBLIC_*` opcionais exigem novo deploy.

## 10. Depende de recursos externos
Vídeo real gravado; analytics; textos jurídicos; nota de desempenho (Lighthouse) medida no domínio publicado; teste real em aparelhos físicos; checkout (se vender planos).
