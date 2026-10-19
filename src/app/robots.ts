import type { MetadataRoute } from "next";

const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/", "/bem-vindo"], disallow: ["/api/", "/admin", "/perfil", "/planejamento", "/movimentacoes", "/notificacoes", "/relatorio", "/senha"] }], sitemap: `${base}/sitemap.xml` };
}
