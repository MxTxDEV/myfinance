"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="rounded-md bg-accent px-4 py-2.5 font-bold text-on-accent print:hidden">Imprimir</button>;
}
