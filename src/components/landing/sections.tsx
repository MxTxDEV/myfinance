import Image from "next/image";
import Link from "next/link";
import { Bell, CalendarClock, CreditCard, FileUp, Landmark, Lock, Repeat, Smartphone, Target, WalletCards, Zap, ShieldCheck, Check, Plus, WifiOff, type LucideIcon } from "lucide-react";
import { benefits, contactEmail, demoDisclaimer, faq, features, finalCta, hero, legal, links, nav, plans, problems, product, security, steps, type Feature } from "@/config/landing";
import { Cta, DemoTabs, Logo } from "./client";

export function Phone({ shot, alt, priority, className = "", sizes = "320px" }: { shot: string; alt: string; priority?: boolean; className?: string; sizes?: string }) {
  return (
    <div className={`lp-phone ${className}`}><div className="lp-phone-screen">
      <Image src={`/landing/${shot}.webp`} alt={alt} width={600} height={1344} sizes={sizes} priority={priority} />
    </div></div>
  );
}

/* ───────────── A. Hero ───────────── */
export function Hero() {
  return (
    <section className="lp-section !pb-24 !pt-[132px] md:!pt-[168px]" aria-labelledby="hero-title">
      <div className="lp-wrap grid items-center gap-16 lg:grid-cols-[1.08fr_1fr]">
        <div className="lp-hero-in">
          <p className="lp-pill"><span className="lp-dot" aria-hidden />{hero.eyebrow}</p>
          <h1 id="hero-title" className="lp-h1 mt-6"><span className="lp-grad">{hero.headline}</span></h1>
          <p className="lp-lead mt-7 max-w-xl">{hero.sub}</p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Cta href={links.signup} event="cta_primary_click" where="hero">{hero.primaryCta}</Cta>
            <Cta href={links.demo} event="demo_click" where="hero" variant="ghost" arrow={false}>{hero.secondaryCta}</Cta>
          </div>
          <p className="lp-mut mt-6 flex items-center gap-2 text-sm"><Check className="size-4 text-[color:var(--lp-acc-2)]" aria-hidden />{hero.note}</p>
        </div>
        <div className="relative mx-auto w-[min(330px,78vw)] sm:w-[340px]">
          <div className="pointer-events-none absolute -inset-16 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(139,132,255,.35),transparent)] blur-2xl lp-glow-pulse" aria-hidden />
          <div data-parallax="0.05"><div className="lp-hero-float"><div className="lp-hero-phone"><Phone shot="inicio" alt="Tela inicial do Finance OS com saldo, resumo do mês e mensagem do dia (dados fictícios)" priority sizes="340px" /></div></div></div>
          <div className="lp-chip -left-6 top-[16%] sm:-left-24" data-i="1" aria-hidden><small>Fatura atual · Cartão Roxo</small><strong className="num">R$ 805,80</strong></div>
          <div className="lp-chip -right-4 top-[34%] sm:-right-20" data-i="2" aria-hidden><small>Quanto posso gastar</small><strong className="num text-[color:var(--lp-acc-2)]">R$ 435,77</strong></div>
          <div className="lp-chip hidden sm:flex -left-4 bottom-[22%] sm:-left-20" data-i="3" aria-hidden><small>Plano de quitação</small><strong>Livre em 09/2027</strong></div>
          <div className="lp-chip hidden sm:flex -right-2 bottom-[8%] sm:-right-14" data-i="4" aria-hidden><small>Orçamento · Mercado</small><strong className="num">58% usado</strong></div>
        </div>
      </div>
      <p className="lp-wrap lp-mut mt-10 text-center text-xs">Valores de exemplo, de uma conta de demonstração.</p>
    </section>
  );
}

/* ───────────── B. Problema → consequência → solução ───────────── */
export function Problem() {
  return (
    <section className="lp-section" aria-labelledby="problema-title" id="problema">
      <div className="lp-wrap">
        <div className="max-w-3xl" data-reveal><p className="lp-eyebrow">O problema</p>
          <h2 id="problema-title" className="lp-h2 mt-4">O dinheiro some em lugares que você não está olhando.</h2></div>
        <ol className="mt-16 divide-y divide-[color:var(--lp-line)] border-y border-[color:var(--lp-line)]">
          {problems.map((p, i) => (
            <li key={p.n} data-reveal style={{ "--d": `${i * 60}ms` } as React.CSSProperties} className="grid gap-6 py-10 md:grid-cols-[90px_1.2fr_1fr_1fr] md:gap-10">
              <span className="num text-sm font-semibold text-[color:var(--lp-acc)]">{p.n}</span>
              <h3 className="text-[1.45rem] font-semibold leading-snug tracking-tight">{p.title}</h3>
              <p className="lp-mut leading-relaxed"><span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-[color:var(--lp-bad)]">Consequência</span>{p.cost}</p>
              <p className="leading-relaxed"><span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-[color:var(--lp-acc-2)]">No Finance OS</span>{p.fix}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────── C. Apresentação do produto ───────────── */
export function Showcase() {
  const trio = [
    { shot: "cartoes", t: "Cartões", d: "Fatura atual, próxima e as seguintes", y: "md:translate-y-12", p: "0.05" },
    { shot: "dividas", t: "Dívidas", d: "Quanto gastar e o plano para quitar", y: "", p: "0.1" },
    { shot: "metas", t: "Metas", d: "Quanto guardar e em quantos meses", y: "md:translate-y-20", p: "0.03" },
  ];
  return (
    <section className="lp-section overflow-hidden" aria-labelledby="produto-title" id="produto">
      <div className="lp-wrap">
        <div className="mx-auto max-w-3xl text-center" data-reveal><p className="lp-eyebrow justify-center">O produto</p>
          <h2 id="produto-title" className="lp-h2 mt-4">Um painel que mostra o mês que vem, não só o que passou.</h2>
          <p className="lp-lead mt-6">Telas reais do aplicativo, gravadas com uma conta de demonstração.</p></div>
        <div className="mt-28 grid items-start gap-12 md:grid-cols-3 md:gap-8 lg:gap-14">
          {trio.map((t, i) => (
            <figure key={t.shot} className={`mx-auto w-[min(290px,74vw)] ${t.y}`} data-reveal="scale" style={{ "--d": `${i * 110}ms` } as React.CSSProperties}>
              <div data-parallax={t.p}><Phone shot={t.shot} alt={`Tela ${t.t} do ${product.name} (dados fictícios)`} sizes="290px" /></div>
              <figcaption className="mt-6 text-center"><span className="lp-h3 block">{t.t}</span><span className="lp-mut text-sm">{t.d}</span></figcaption>
            </figure>
          ))}
        </div>
        <p className="lp-mut mt-24 text-center text-xs md:mt-32">{demoDisclaimer}</p>
      </div>
    </section>
  );
}

/* ───────────── D. Funcionalidades (Bento) ───────────── */
const ICON: Record<string, LucideIcon> = { plano: Target, cartoes: CreditCard, gastar: WalletCards, orcamentos: Landmark, fixas: CalendarClock, metas: Target, avisos: Bell, importar: FileUp, auto: Zap, offline: WifiOff };
const SPAN: Record<string, string> = {
  plano: "lg:col-span-4", cartoes: "lg:col-span-2", gastar: "lg:col-span-2", orcamentos: "lg:col-span-2", avisos: "lg:col-span-2",
  fixas: "lg:col-span-2", metas: "lg:col-span-2", importar: "lg:col-span-2", auto: "lg:col-span-3", offline: "lg:col-span-3",
};

function Tile({ f, i }: { f: Feature; i: number }) {
  const Icon = ICON[f.id] ?? Smartphone;
  const bleed = !!f.shot && (f.id === "plano" || f.id === "cartoes");
  return (
    <article className={`lp-card ${SPAN[f.id] ?? ""} ${bleed ? "lg:min-h-[620px]" : ""}`} data-reveal style={{ "--d": `${(i % 3) * 80}ms` } as React.CSSProperties} data-feature={f.id}>
      <div className={`relative z-10 p-7 md:p-8 ${f.id === "plano" ? "lg:max-w-[55%]" : ""}`}>
        <span className="mb-5 grid size-11 place-items-center rounded-2xl border border-[color:var(--lp-line-2)] bg-white/5 text-[color:var(--lp-acc)]"><Icon className="size-5" aria-hidden /></span>
        <h3 className="lp-h3 !text-[1.3rem]">{f.name}</h3>
        <p className="mt-1 font-medium text-[color:var(--lp-acc-2)]">{f.benefit}</p>
        <p className="lp-mut mt-3 text-[.95rem] leading-relaxed">{f.text}</p>
        {f.id === "plano" && <PlanViz />}
        {f.id === "gastar" && <SpendViz />}
        {f.id === "orcamentos" && <BudgetViz />}
        {f.id === "auto" && <p className="lp-pill mt-5 w-fit"><Smartphone className="size-3.5" aria-hidden />Atalho do iPhone + chave pessoal revogável</p>}
        {f.id === "importar" && <p className="lp-pill mt-5 w-fit">OFX · CSV · PDF</p>}
        {f.id === "offline" && <p className="lp-pill mt-5 w-fit"><Repeat className="size-3.5" aria-hidden />Sincroniza ao voltar a conexão</p>}
      </div>
      {bleed && (
        <div className={`mx-auto h-[330px] w-[min(240px,62vw)] overflow-hidden lg:absolute lg:h-auto lg:overflow-visible ${f.id === "plano" ? "lg:-bottom-32 lg:right-10 lg:w-[250px]" : "lg:-bottom-[190px] lg:left-1/2 lg:-translate-x-1/2 lg:w-[240px]"}`} data-parallax="0.04">
          <div className="lp-phone !rounded-[34px] !p-[7px]"><div className="lp-phone-screen !rounded-[28px]"><Image src={`/landing/${f.shot}.webp`} alt={`Tela ${f.name} (dados fictícios)`} width={600} height={1344} sizes="250px" loading="lazy" /></div></div>
        </div>
      )}
    </article>
  );
}

const PLAN_ROWS = [["Cartão Roxo", 2, "good"], ["Cartão Ouro", 2, "good"], ["Empréstimo", 4, ""], ["Financiamento", 11, "warn"]] as const;
function PlanViz() {
  return (
    <div className="mt-6 rounded-2xl border border-[color:var(--lp-line)] bg-black/25 p-4" role="img" aria-label="Exemplo fictício: ordem de quitação das dívidas em meses">
      <p className="mb-3 flex items-center justify-between text-xs"><span className="lp-mut">Ordem de quitação · exemplo fictício</span><span className="num font-semibold text-[color:var(--lp-acc-2)]">livre em 11 meses</span></p>
      <ul className="space-y-2.5">
        {PLAN_ROWS.map(([n, m, tone], i) => (
          <li key={n} className="grid grid-cols-[104px_1fr_34px] items-center gap-3 text-xs"><span className="truncate">{i + 1}º {n}</span>
            <span className={`lp-bar ${tone}`} style={{ "--w": `${(m / 11) * 100}%`, "--bd": `${i * 160}ms` } as React.CSSProperties}><i /></span><span className="num lp-mut text-right">{m} m</span></li>
        ))}
      </ul>
    </div>
  );
}
function SpendViz() {
  return (
    <div className="mt-5 rounded-2xl border border-[color:var(--lp-line)] bg-black/25 p-4" aria-label="Exemplo fictício de orçamento mensal">
      <p className="lp-mut mb-2 text-xs">Exemplo fictício · por mês</p>
      <p className="num text-[1.9rem] font-bold leading-none tracking-tight text-[color:var(--lp-acc-2)]"><span data-count="435.77" data-dec="2" data-prefix="R$ ">R$ 435,77</span></p>
      <p className="lp-mut mt-1 text-xs">de gasto livre, depois de fixos, parcelas e reserva</p>
    </div>
  );
}
const BUDGETS = [["Mercado", 58, ""], ["Alimentação", 17, ""], ["Lazer", 9, ""]] as const;
function BudgetViz() {
  return (
    <ul className="mt-5 space-y-3 rounded-2xl border border-[color:var(--lp-line)] bg-black/25 p-4" aria-label="Exemplo fictício de orçamentos">
      {BUDGETS.map(([n, pct], i) => (
        <li key={n} className="text-xs"><div className="mb-1.5 flex justify-between"><span>{n}</span><span className="num lp-mut">{pct}%</span></div>
          <span className="lp-bar" style={{ "--w": `${pct}%`, "--bd": `${i * 150}ms` } as React.CSSProperties}><i /></span></li>
      ))}
    </ul>
  );
}

export function Bento() {
  return (
    <section className="lp-section" aria-labelledby="func-title" id="funcionalidades">
      <div className="lp-wrap">
        <div className="max-w-3xl" data-reveal><p className="lp-eyebrow">Funcionalidades</p>
          <h2 id="func-title" className="lp-h2 mt-4">Tudo o que você precisa para entender e organizar o seu dinheiro.</h2>
          <p className="lp-lead mt-6">Só o que o aplicativo já faz hoje.</p></div>
        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-6 lg:gap-5 [&>*]:min-w-0">
          {features.map((f, i) => <Tile key={f.id} f={f} i={i} />)}
        </div>
      </div>
    </section>
  );
}

/* ───────────── E. Demonstração guiada ───────────── */
export function Demo() {
  return (
    <section className="lp-section" aria-labelledby="demo-title" id="demo">
      <div className="lp-wrap">
        <div className="mx-auto mb-14 max-w-3xl text-center" data-reveal><p className="lp-eyebrow justify-center">Demonstração</p>
          <h2 id="demo-title" className="lp-h2 mt-4">Explore o aplicativo, tela por tela.</h2></div>
        <div data-reveal="scale"><DemoTabs /></div>
      </div>
    </section>
  );
}

/* ───────────── F. Benefícios ───────────── */
export function Benefits() {
  return (
    <section className="lp-section" aria-labelledby="ben-title" id="beneficios">
      <div className="lp-wrap grid gap-14 lg:grid-cols-[1fr_1.4fr]">
        <div className="lg:sticky lg:top-32 lg:self-start" data-reveal="left"><p className="lp-eyebrow">Benefícios</p>
          <h2 id="ben-title" className="lp-h2 mt-4">Menos adivinhação. Mais decisão.</h2>
          <p className="lp-lead mt-6">O Finance OS organiza as informações; as decisões continuam sendo suas.</p></div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {benefits.map((b, i) => (
            <li key={b.title} className="lp-card p-7" data-reveal style={{ "--d": `${i * 90}ms` } as React.CSSProperties}>
              <span className="num text-sm font-semibold text-[color:var(--lp-acc)]">0{i + 1}</span>
              <h3 className="lp-h3 mt-4 !text-[1.2rem]">{b.title}</h3><p className="lp-mut mt-3 leading-relaxed">{b.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ───────────── G. Como funciona ───────────── */
export function Steps() {
  return (
    <section className="lp-section" aria-labelledby="como-title" id="como-funciona">
      <div className="lp-wrap">
        <div className="max-w-3xl" data-reveal><p className="lp-eyebrow">Como funciona</p>
          <h2 id="como-title" className="lp-h2 mt-4">Em quatro passos você sabe onde está e para onde vai.</h2></div>
        <ol className="mt-16 grid gap-10 md:grid-cols-4 md:gap-6">
          {steps.map((s, i) => (
            <li key={s.title} className="relative md:pr-4" data-reveal style={{ "--d": `${i * 110}ms` } as React.CSSProperties}>
              <div className="mb-6 flex items-center gap-3"><span className="num grid size-12 place-items-center rounded-full border border-[color:var(--lp-line-2)] bg-white/5 text-lg font-bold text-[color:var(--lp-acc)]">{i + 1}</span>
                {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-gradient-to-r from-[color:var(--lp-acc)]/60 to-transparent md:block" aria-hidden />}</div>
              <h3 className="lp-h3">{s.title}</h3><p className="lp-mut mt-2 leading-relaxed">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────── H. Segurança e confiança ───────────── */
export function Trust() {
  return (
    <section className="lp-section" aria-labelledby="seg-title" id="seguranca">
      <div className="lp-wrap">
        <div className="lp-card !rounded-[36px] p-8 md:p-14">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr]">
            <div data-reveal><span className="mb-5 grid size-14 place-items-center rounded-2xl border border-[color:var(--lp-line-2)] bg-white/5 text-[color:var(--lp-acc-2)]"><ShieldCheck className="size-7" aria-hidden /></span>
              <h2 id="seg-title" className="lp-h2 !text-[clamp(1.8rem,3.6vw,2.7rem)]">Segurança que você pode verificar.</h2>
              <p className="lp-mut mt-5 leading-relaxed">Descrevemos apenas o que o aplicativo faz de fato. Não anunciamos certificações nem proteção absoluta.</p></div>
            <ul className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
              {security.map((s, i) => (
                <li key={s.title} data-reveal style={{ "--d": `${i * 70}ms` } as React.CSSProperties}>
                  <h3 className="flex items-center gap-2 font-semibold"><Lock className="size-4 shrink-0 text-[color:var(--lp-acc)]" aria-hidden />{s.title}</h3>
                  <p className="lp-mut mt-1.5 text-[.95rem] leading-relaxed">{s.text}</p></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── I. Planos ───────────── */
export function Pricing() {
  return (
    <section className="lp-section" aria-labelledby="planos-title" id="planos">
      <div className="lp-wrap">
        <div className="mx-auto max-w-3xl text-center" data-reveal><p className="lp-eyebrow justify-center">Planos</p>
          <h2 id="planos-title" className="lp-h2 mt-4">Comece criando a sua conta.</h2></div>
        {plans.length === 0 ? (
          <div className="lp-card mx-auto mt-14 max-w-2xl p-10 text-center" data-reveal="scale">
            <p className="lp-h3">Preços em definição</p>
            <p className="lp-mut mx-auto mt-3 max-w-md leading-relaxed">Hoje o aplicativo não tem cobrança configurada. Quando os planos forem definidos, eles serão apresentados aqui, com todas as condições.</p>
            <div className="mt-8 flex justify-center"><Cta href={links.signup} event="cta_primary_click" where="planos">Criar minha conta</Cta></div>
          </div>
        ) : (
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => (
              <article key={p.name} className={`lp-card flex flex-col p-8 ${p.highlight ? "!border-[color:var(--lp-acc)]/60" : ""}`} data-reveal>
                {p.highlight && <p className="lp-pill mb-4 w-fit text-[color:var(--lp-acc)]">Recomendado</p>}
                <h3 className="lp-h3">{p.name}</h3><p className="mt-4"><span className="num text-4xl font-bold tracking-tight">{p.price}</span><span className="lp-mut ml-1 text-sm">{p.period}</span></p>
                <p className="lp-mut mt-3 text-sm">{p.description}</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[color:var(--lp-acc-2)]" aria-hidden />{f}</li>)}</ul>
                <div className="mt-8"><Cta href={p.href} event={p.checkout ? "purchase_cta_click" : "cta_primary_click"} where={`plano-${p.name}`}>{p.cta}</Cta></div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────── J. FAQ ───────────── */
export function Faq() {
  return (
    <section className="lp-section" aria-labelledby="faq-title" id="faq">
      <div className="lp-wrap grid gap-14 lg:grid-cols-[1fr_1.6fr]">
        <div data-reveal="left"><p className="lp-eyebrow">Perguntas frequentes</p><h2 id="faq-title" className="lp-h2 mt-4">Antes de criar a conta.</h2></div>
        <div className="lp-faq divide-y divide-[color:var(--lp-line)] border-y border-[color:var(--lp-line)]" data-reveal>
          {faq.map((f) => (
            <details key={f.q} className="group py-1"><summary className="flex items-center justify-between gap-6 py-5 text-left text-[1.05rem] font-semibold">{f.q}
              <Plus className="lp-plus size-5 shrink-0 text-[color:var(--lp-acc)]" aria-hidden /></summary>
              <p className="lp-mut max-w-2xl pb-6 leading-relaxed">{f.a}</p></details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────── K. CTA final ───────────── */
export function FinalCta() {
  return (
    <section className="lp-section !pb-28" aria-labelledby="final-title">
      <div className="lp-wrap">
        <div className="relative overflow-hidden rounded-[40px] border border-[color:var(--lp-line-2)] px-6 py-20 text-center md:px-16 md:py-28" data-reveal="scale">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(139,132,255,.32),transparent_70%),radial-gradient(40%_60%_at_85%_100%,rgba(61,214,140,.16),transparent_70%)]" aria-hidden />
          <h2 id="final-title" className="lp-h2 mx-auto max-w-3xl">{finalCta.title}</h2>
          <p className="lp-lead mx-auto mt-6 max-w-xl">{finalCta.text}</p>
          <div className="mt-10 flex justify-center"><Cta href={links.signup} event="cta_primary_click" where="final">{finalCta.cta}</Cta></div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── L. Rodapé ───────────── */
export function Footer() {
  return (
    <footer className="relative z-[1] border-t border-[color:var(--lp-line)] py-14">
      <div className="lp-wrap grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div><Link href="/" className="flex items-center gap-2.5 font-bold"><Logo /><span>{product.name}</span></Link>
          <p className="lp-mut mt-4 max-w-xs text-sm leading-relaxed">{product.tagline}. Projeções são simulações com os dados que você informa.</p></div>
        <nav aria-label="Rodapé"><p className="mb-3 text-sm font-semibold">Página</p><ul className="space-y-2 text-sm lp-mut">{nav.map((n) => <li key={n.href}><a href={n.href} className="hover:text-white">{n.label}</a></li>)}</ul></nav>
        <div><p className="mb-3 text-sm font-semibold">Conta</p><ul className="space-y-2 text-sm lp-mut">
          <li><Link href={links.signup} className="hover:text-white">Criar conta</Link></li><li><Link href={links.login} className="hover:text-white">Entrar</Link></li>
          {contactEmail && <li><a href={`mailto:${contactEmail}`} className="hover:text-white">{contactEmail}</a></li>}
          {legal.terms && <li><a href={legal.terms} className="hover:text-white">Termos de uso</a></li>}
          {legal.privacy && <li><a href={legal.privacy} className="hover:text-white">Política de privacidade</a></li>}</ul></div>
      </div>
      <div className="lp-wrap lp-mut mt-10 border-t border-[color:var(--lp-line)] pt-6 text-xs">© {new Date().getFullYear()} {product.name}.{legal.company ? ` ${legal.company}` : ""}</div>
    </footer>
  );
}
