import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
// Next injeta scripts inline para hidratação; por isso 'unsafe-inline' em script-src.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.pluggy.ai",
  "media-src 'self' https:", // vídeo da landing (MP4 por URL configurável)
  "frame-src https://*.pluggy.ai https://www.youtube-nocookie.com https://player.vimeo.com", // widget de conexão bancária (Open Finance); o banco é autorizado lá, nunca no app
  "worker-src 'self' blob:", // leitura de PDF (pdf.js) roda em um worker do próprio site
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};
export default nextConfig;
