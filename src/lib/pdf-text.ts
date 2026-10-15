// Leitura de PDF NO APARELHO (pdf.js): o arquivo nunca é enviado ao servidor, só o texto extraído.
import { itemsToLines, PDF_MARKER, type TextItem } from "@/domain/statement-pdf";

export class PdfPasswordError extends Error {
  constructor(public wrong: boolean) { super(wrong ? "Senha do PDF incorreta." : "Este PDF é protegido por senha."); }
}
export class PdfNoTextError extends Error {
  constructor() { super("Este PDF não tem texto selecionável (parece uma imagem digitalizada). Baixe o OFX/CSV no app do banco ou um PDF original."); }
}

const MAX_PAGES = 60;

export async function extractPdfText(file: File, password?: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err.name === "PasswordException") throw new PdfPasswordError(err.code === 2);
    throw e;
  }
  const lines: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items) if ("str" in it) items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
    lines.push(...itemsToLines(items));
  }
  if (lines.join("").trim().length < 20) throw new PdfNoTextError();
  return `${PDF_MARKER}\n${lines.join("\n")}`;
}
