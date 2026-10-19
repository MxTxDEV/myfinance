"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, Play, X } from "lucide-react";
import { track, type LandingEvent } from "@/lib/analytics";
import { demoDisclaimer, demoTabs, demoVideo, links, nav, product } from "@/config/landing";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Link/botão de conversão com instrumentação. Nunca envia dados pessoais. */
export function Cta({ href, event, where, variant = "primary", size, children, arrow = true }: {
  href: string; event: LandingEvent; where: string; variant?: "primary" | "ghost"; size?: "sm"; children: React.ReactNode; arrow?: boolean;
}) {
  const cls = `lp-btn ${variant === "primary" ? "lp-btn-primary" : "lp-btn-ghost"} ${size === "sm" ? "lp-btn-sm" : ""}`;
  const onClick = () => {
    track(event, { where });
    if (href === links.signup) track("signup_start", { where });
  };
  const inner = <>{children}{arrow && <ArrowRight className="lp-arrow size-4" aria-hidden />}</>;
  return href.startsWith("#")
    ? <a href={href} className={cls} onClick={onClick}>{inner}</a>
    : <Link href={href} className={cls} onClick={onClick}>{inner}</Link>;
}

/** Navegação fixa com destaque da seção atual e menu no celular. */
export function Nav() {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  useEffect(() => {
    const onScroll = () => { setStuck(window.scrollY > 8); if (window.scrollY < 300) setActive(""); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const ids = nav.map((n) => n.href.slice(1));
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setActive(e.target.id); }, { rootMargin: "-45% 0px -50% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => { window.removeEventListener("scroll", onScroll); io.disconnect(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <header className="lp-nav" data-stuck={stuck || open}>
      <div className="lp-wrap flex h-[68px] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight" aria-label={`${product.name} — início`}>
          <Logo /><span className="text-[1.05rem]">{product.name}</span>
        </Link>
        <nav aria-label="Seções da página" className="hidden items-center gap-1 lg:flex">
          {nav.map((n) => <a key={n.href} href={n.href} className="lp-nav-link" aria-current={active === n.href.slice(1) ? "true" : undefined}>{n.label}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href={links.login} className="lp-nav-link hidden sm:inline-block">Entrar</Link>
          <Cta href={links.signup} event="cta_primary_click" where="nav" size="sm" arrow={false}>Criar conta</Cta>
          <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm !px-3 lg:hidden" aria-expanded={open} aria-controls="lp-menu" aria-label={open ? "Fechar menu" : "Abrir menu"} onClick={() => setOpen((v) => !v)}>
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="lp-menu" aria-label="Menu" className="lp-wrap flex flex-col gap-1 pb-5 lg:hidden">
          {nav.map((n) => <a key={n.href} href={n.href} className="lp-nav-link !py-3 !text-base" onClick={() => setOpen(false)}>{n.label}</a>)}
          <Link href={links.login} className="lp-nav-link !py-3 !text-base">Entrar</Link>
        </nav>
      )}
    </header>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs><linearGradient id="lpg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a09aff" /><stop offset="1" stopColor="#3dd68c" /></linearGradient></defs>
      <rect width="512" height="512" rx="120" fill="#10151c" stroke="url(#lpg)" strokeWidth="14" />
      <path d="M168 340l88-168 88 168" fill="none" stroke="url(#lpg)" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Um único observador para a página inteira: revela elementos [data-reveal], anima barras e contadores (valores de DEMONSTRAÇÃO),
 * aplica parallax discreto e destaca os cartões de funcionalidade conforme a rolagem. Respeita prefers-reduced-motion.
 */
export function LandingEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root) return;
    track("landing_view", { path: window.location.pathname });
    const calm = reduced();
    if (!calm) root.classList.add("js");

    // contadores
    const fmt = (el: HTMLElement, v: number) => {
      const dec = Number(el.dataset.dec ?? 0);
      el.textContent = `${el.dataset.prefix ?? ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}${el.dataset.suffix ?? ""}`;
    };
    const countUp = (el: HTMLElement) => {
      const to = Number(el.dataset.count), dur = 1300, t0 = performance.now();
      if (calm || !Number.isFinite(to)) return fmt(el, to);
      const tick = (t: number) => { const p = Math.min(1, (t - t0) / dur); fmt(el, to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.classList.add("in");
        el.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
        if (el.dataset.count) countUp(el);
        if (el.id === "planos") track("pricing_view");
        io.unobserve(el);
      }
    }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
    root.querySelectorAll("[data-reveal], [data-count], #planos").forEach((el) => io.observe(el));

    // destaque dos cartões de funcionalidade enquanto passam pelo centro da tela
    const lit = new IntersectionObserver((entries) => entries.forEach((e) => ((e.target as HTMLElement).dataset.lit = String(e.isIntersecting))), { rootMargin: "-38% 0px -38% 0px" });
    if (!calm) root.querySelectorAll("[data-feature]").forEach((el) => lit.observe(el));

    // parallax
    let raf = 0;
    const items = [...root.querySelectorAll<HTMLElement>("[data-parallax]")];
    const run = () => {
      raf = 0;
      const vh = window.innerHeight;
      for (const el of items) {
        const r = el.parentElement!.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const k = Number(el.dataset.parallax) || 0.06;
        const dy = Math.max(-36, Math.min(36, (r.top + r.height / 2 - vh / 2) * -k));
        el.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run); };
    if (!calm && items.length) { window.addEventListener("scroll", onScroll, { passive: true }); run(); }

    // brilho que segue o ponteiro nos cartões
    const move = (e: PointerEvent) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>(".lp-card");
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", `${e.clientX - r.left}px`); c.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    if (!calm) root.addEventListener("pointermove", move, { passive: true });

    return () => { io.disconnect(); lit.disconnect(); window.removeEventListener("scroll", onScroll); root.removeEventListener("pointermove", move); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}

/* ───────────── Demonstração guiada ───────────── */
function videoKind(url: string): "mp4" | "youtube" | "vimeo" | null {
  if (!url) return null;
  if (/\.(mp4|webm)(\?|$)/i.test(url)) return "mp4";
  if (/youtu\.be|youtube\.com/i.test(url)) return "youtube";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  return null;
}
function embedUrl(url: string, kind: "youtube" | "vimeo"): string | null {
  try {
    const u = new URL(url, "https://x.invalid");
    if (kind === "youtube") {
      const id = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v") ?? u.pathname.split("/").pop();
      return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null;
    }
    const id = u.pathname.split("/").filter(Boolean).pop();
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
  } catch { return null; }
}

function VideoPlayer() {
  const kind = videoKind(demoVideo.url);
  const [started, setStarted] = useState(false);
  const embed = kind === "youtube" || kind === "vimeo" ? embedUrl(demoVideo.url, kind) : null;
  if (!kind) return null;
  return (
    <div className="lp-card !rounded-[24px] aspect-video w-full">
      {kind === "mp4" ? (
        <video className="h-full w-full object-cover" controls preload="none" playsInline poster={demoVideo.poster} onPlay={() => track("demo_video_play", { kind })}>
          <source src={demoVideo.url} />
          Seu navegador não reproduz este vídeo.
        </video>
      ) : started && embed ? (
        <iframe className="h-full w-full" src={embed} title={demoVideo.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
      ) : (
        <button type="button" className="group relative h-full w-full" aria-label={`Reproduzir vídeo: ${demoVideo.title}`} onClick={() => { track("demo_video_play", { kind }); setStarted(true); }}>
          <Image src={demoVideo.poster} alt="" fill sizes="(min-width:1024px) 520px, 90vw" className="object-cover object-top opacity-60" />
          <span className="absolute inset-0 grid place-items-center"><span className="grid size-20 place-items-center rounded-full bg-[color:var(--lp-acc)] text-[#0b0d10] shadow-[0_0_60px_rgba(139,132,255,.7)] transition-transform group-hover:scale-110"><Play className="size-8 translate-x-0.5" aria-hidden /></span></span>
        </button>
      )}
    </div>
  );
}

export function DemoTabs() {
  const [id, setId] = useState(demoTabs[0].id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tab = demoTabs.find((t) => t.id === id)!;
  const idx = demoTabs.findIndex((t) => t.id === id);
  const go = useCallback((i: number) => {
    const t = demoTabs[(i + demoTabs.length) % demoTabs.length];
    setId(t.id); refs.current[t.id]?.focus();
  }, []);
  const hasVideo = !!videoKind(demoVideo.url);
  return (
    <div>
      <div role="tablist" aria-label="Telas do aplicativo" className="lp-scroll -mx-5 flex gap-1 overflow-x-auto px-5 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); } }}>
        {demoTabs.map((t) => (
          <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} role="tab" id={`tab-${t.id}`} aria-selected={id === t.id} aria-controls="demo-panel" tabIndex={id === t.id ? 0 : -1}
            className="lp-tab" onClick={() => { setId(t.id); track("demo_click", { tab: t.id }); }}>{t.label}</button>
        ))}
      </div>
      <div className={`mt-10 grid items-center gap-10 ${hasVideo ? "lg:grid-cols-[minmax(0,380px)_auto_minmax(0,480px)]" : "lg:grid-cols-[minmax(0,420px)_auto]"} lg:justify-center lg:gap-20`}>
        <div className="order-2 lg:order-1" id="demo-panel" role="tabpanel" aria-labelledby={`tab-${id}`}>
          <p className="lp-eyebrow">{String(idx + 1).padStart(2, "0")} / {String(demoTabs.length).padStart(2, "0")}</p>
          <h3 className="lp-h2 mt-4 !text-[clamp(1.8rem,3.4vw,2.6rem)]">{tab.label}</h3>
          <p className="lp-lead mt-4 max-w-md">{tab.caption}</p>
          <p className="lp-pill mt-8"><span className="lp-dot" aria-hidden />{demoDisclaimer}</p>
        </div>
        <div className="order-1 mx-auto w-[min(300px,72vw)] lg:order-2">
          <div className="lp-phone"><div className="lp-phone-screen">
            <Image key={tab.id} src={`/landing/${tab.id}.webp`} alt={`Tela ${tab.label} do ${product.name}, com dados fictícios`} width={600} height={1344} sizes="300px" className="animate-[lp-pop_.5s_ease-out]" />
          </div></div>
        </div>
        {hasVideo && <div className="order-3"><VideoPlayer /><p className="lp-mut mt-3 text-sm">Vídeo de demonstração.</p></div>}
      </div>
    </div>
  );
}
