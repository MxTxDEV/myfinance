"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { Money } from "./privacy";
import { field } from "./form-kit";
import { commitStatement, previewStatement } from "@/app/(app)/actions";

interface Row {
  key: string; date: string; description: string; amount: number; type: "INCOME" | "EXPENSE"; categoryId: string | null;
  duplicate: "exact" | "maybe" | null; skip: boolean; note: string | null; include: boolean;
}
interface Cat { id: string; name: string; type: "INCOME" | "EXPENSE" }

/** Importa o extrato (OFX/CSV) da conta ou a fatura (CSV/OFX) do cartão, com revisão antes de gravar. */
export function ImportStatement({ accounts, cards, categories }: { accounts: { id: string; name: string }[]; cards: { id: string; name: string }[]; categories: Cat[] }) {
  const router = useRouter();
  const [target, setTarget] = useState(accounts[0] ? `account:${accounts[0].id}` : cards[0] ? `card:${cards[0].id}` : "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [kind, id] = target.split(":") as ["account" | "card", string];

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMsg(null); setRows(null);
    if (file.size > 2_000_000) return setMsg({ ok: false, text: "Arquivo grande demais (máx. 2 MB)." });
    setBusy(true);
    try {
      const r = await previewStatement({ text: await file.text(), kind, targetId: id });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      const d = r.data!;
      setWarnings(d.warnings);
      if (d.rows.length === 0) return setMsg({ ok: false, text: d.warnings[0] ?? "Nenhuma transação encontrada." });
      setRows(d.rows.map((x) => ({ ...x, include: !x.skip })));
    } catch { setMsg({ ok: false, text: "Não foi possível ler o arquivo. Tente de novo." }); } finally { setBusy(false); }
  }

  const sel = useMemo(() => (rows ?? []).filter((r) => r.include), [rows]);
  const totals = useMemo(() => ({
    inc: sel.filter((r) => r.type === "INCOME").reduce((s, r) => s + r.amount, 0),
    exp: sel.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + r.amount, 0),
  }), [sel]);
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function confirm() {
    setBusy(true); setMsg(null);
    try {
      const r = await commitStatement({ kind, targetId: id, rows: sel.map(({ key, date, description, amount, type, categoryId }) => ({ key, date, description, amount, type, categoryId })) });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      const d = r.data!;
      setMsg({ ok: d.errors.length === 0, text: `${d.created} importado(s)${d.skipped ? `, ${d.skipped} já existiam` : ""}.${d.errors.length ? ` Problemas: ${d.errors.join("; ")}` : ""}` });
      setRows(null); router.refresh();
    } catch { setMsg({ ok: false, text: "Não foi possível importar agora. Nada foi duplicado; tente de novo." }); } finally { setBusy(false); }
  }

  if (!target) return <p className="text-sm text-muted">Cadastre uma conta ou cartão antes de importar.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Baixe o extrato (OFX ou CSV) no app do seu banco e importe aqui. Você revisa antes de gravar, e importar o mesmo arquivo de novo não duplica.</p>
      <select value={target} onChange={(e) => { setTarget(e.target.value); setRows(null); }} aria-label="Importar para" className={field}>
        {accounts.length > 0 && <optgroup label="Extrato de conta">{accounts.map((a) => <option key={a.id} value={`account:${a.id}`}>{a.name}</option>)}</optgroup>}
        {cards.length > 0 && <optgroup label="Fatura de cartão">{cards.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}</optgroup>}
      </select>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md bg-accent py-3.5 font-bold text-on-accent">
        <FileUp className="size-5" aria-hidden />{busy && !rows ? "Lendo…" : "Escolher arquivo (.ofx, .csv)"}
        <input type="file" accept=".ofx,.csv,.txt,text/csv" className="sr-only" aria-label="Arquivo do extrato" disabled={busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {warnings.length > 0 && rows && <p className="text-xs text-muted">{warnings.length} linha(s) do arquivo foram ignoradas por não serem legíveis.</p>}

      {rows && (
        <>
          <p role="status" className="text-sm font-medium">{sel.length} de {rows.length} selecionados · entradas <Money cents={totals.inc} className="text-income" /> · saídas <Money cents={totals.exp} className="text-expense" /></p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((r) => (
              <li key={r.key} className={`flex flex-col gap-2 p-3 ${r.include ? "" : "bg-surface-2"}`}>
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={r.include} onChange={(e) => patch(r.key, { include: e.target.checked })} aria-label={`Importar ${r.description}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.description}</span>
                    <span className="block text-xs text-muted">{r.date.split("-").reverse().join("/")}{r.note ? ` · ${r.note}` : ""}</span>
                  </span>
                  <Money cents={r.type === "INCOME" ? r.amount : -r.amount} sign className={`shrink-0 font-bold ${r.type === "INCOME" ? "text-income" : "text-expense"}`} />
                </label>
                {r.include && (
                  <select value={r.categoryId ?? ""} onChange={(e) => patch(r.key, { categoryId: e.target.value || null })} aria-label={`Categoria de ${r.description}`} className={field}>
                    <option value="">{r.type === "INCOME" ? "Outras receitas (padrão)" : "Outras despesas (padrão)"}</option>
                    {categories.filter((c) => c.type === r.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
          <button disabled={busy || sel.length === 0} onClick={confirm} className="rounded-md bg-accent py-3.5 font-bold text-on-accent disabled:opacity-60">{busy ? "Importando…" : `Importar ${sel.length} lançamento(s)`}</button>
        </>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-medium ${msg.ok ? "text-income" : "text-expense"}`}>{msg.text}</p>}
    </div>
  );
}
