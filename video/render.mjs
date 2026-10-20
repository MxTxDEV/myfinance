// Renderiza o comercial quadro a quadro (determinístico) e codifica com ffmpeg.
// Uso:  node video/render.mjs still <v|h> <tempo_s> saida.png
//       node video/render.mjs video <v|h> saida_sem_audio.mp4 [fps]
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const [, , mode, o, out, fpsArg] = process.argv;
const ROOT = new URL(".", import.meta.url).pathname;
const MIME = { ".html": "text/html", ".webp": "image/webp", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".js": "text/javascript" };
const server = http.createServer((req, res) => {
  const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
}).listen(0);
const port = server.address().port;
const [W, H] = o === "v" ? [1080, 1920] : [1920, 1080];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--font-render-hinting=none", "--disable-gpu-vsync"] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", (e) => console.error("PAGEERR", e.message));
await page.goto(`http://localhost:${port}/index.html?o=${o}`);
await page.evaluate(() => window.ready);

if (mode === "still") {
  await page.evaluate((t) => window.render(t), parseFloat(out));
  await page.waitForTimeout(80);
  await page.screenshot({ path: process.argv[5] });
} else {
  const fps = Number(fpsArg || 30), dur = await page.evaluate(() => window.DUR), n = Math.round(dur * fps);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 60 === 0) console.log(`quadro ${i}/${n}`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r));
}
await browser.close(); server.close();
