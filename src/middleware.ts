import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/manifest.webmanifest", "/icon.svg", "/sw.js", "/offline", "/pdf.worker.min.mjs"];
// /api/cron/* se protege sozinha com CRON_SECRET (o agendador não tem cookie de sessão).
const PUBLIC_PREFIX = ["/sounds/", "/api/cron/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (process.env.AUTH_DISABLED === "true") return NextResponse.next(); // modo aberto temporário
  if (PUBLIC.some((p) => pathname === p) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next") || pathname === "/favicon.ico") return NextResponse.next();
  const token = req.cookies.get("fos_session")?.value;
  let ok = false;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), { algorithms: ["HS256"] });
      ok = true;
    } catch { /* inválido/expirado */ }
  }
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
