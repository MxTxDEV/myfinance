import type { Metadata } from "next";
import "@/components/landing/landing.css";
import { LandingEffects, Nav } from "@/components/landing/client";
import { Benefits, Bento, Demo, Faq, FinalCta, Footer, Hero, Pricing, Problem, Showcase, Steps, Trust } from "@/components/landing/sections";
import { hero, product } from "@/config/landing";

const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
const title = `${product.name} — ${product.tagline}`;
const description = hero.sub;

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title, description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "pt_BR", siteName: product.name, title, description, url: "/" },
  twitter: { card: "summary_large_image", title, description },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication", name: product.name, description,
  applicationCategory: "FinanceApplication", operatingSystem: "Web", inLanguage: "pt-BR",
};

export default function Landing() {
  return (
    <div className="lp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="lp-ambient" aria-hidden /><div className="lp-grid" aria-hidden />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">Ir para o conteúdo</a>
      <Nav />
      <main id="conteudo">
        <Hero /><Problem /><Showcase /><Bento /><Demo /><Benefits /><Steps /><Trust /><Pricing /><Faq /><FinalCta />
      </main>
      <Footer />
      <LandingEffects />
    </div>
  );
}
