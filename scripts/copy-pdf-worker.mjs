// Copia o "worker" do pdf.js para /public (leitura de PDF roda no navegador do usuário).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs";
if (existsSync(src)) { mkdirSync("public", { recursive: true }); copyFileSync(src, "public/pdf.worker.min.mjs"); }
else console.warn("pdfjs-dist não instalado: leitura de PDF indisponível.");
