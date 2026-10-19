import { ImageResponse } from "next/og";
import { hero, product } from "@/config/landing";

export const alt = `${product.name} — ${product.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "radial-gradient(900px 500px at 85% 0%, #2a2766, #06080b 60%)", color: "#eef1f5", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 36, fontWeight: 700 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "#10151c", border: "3px solid #8b84ff", display: "flex" }} />{product.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>{hero.headline}</div>
          <div style={{ fontSize: 28, color: "#9aa6b6", maxWidth: 900 }}>Contas, cartões, faturas e um plano para quitar as dívidas.</div>
        </div>
      </div>
    ),
    size,
  );
}
