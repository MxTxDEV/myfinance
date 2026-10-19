import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finance OS", short_name: "Finance", description: "Meu painel financeiro pessoal",
    start_url: "/?pwa=1", display: "standalone", background_color: "#f5f6f8", theme_color: "#4338ca", lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
