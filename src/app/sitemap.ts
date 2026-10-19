import type { MetadataRoute } from "next";

const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${base}/`, changeFrequency: "monthly", priority: 1 }, { url: `${base}/cadastro`, changeFrequency: "yearly", priority: 0.5 }, { url: `${base}/login`, changeFrequency: "yearly", priority: 0.3 }];
}
