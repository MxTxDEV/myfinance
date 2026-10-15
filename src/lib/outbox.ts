// Fila de lançamentos criados sem internet (IndexedDB). Cada item tem um clientId (UUID)
// que o servidor usa para nunca duplicar um lançamento reenviado.
export interface OutboxItem {
  clientId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  error?: string; // preenchido quando o servidor recusou (ex.: categoria arquivada): precisa de decisão do usuário
}

const DB = "finance-os";
const STORE = "outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "clientId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const notify = () => window.dispatchEvent(new Event("outbox-changed"));

export async function enqueue(item: Omit<OutboxItem, "createdAt">): Promise<void> {
  await run("readwrite", (s) => s.put({ ...item, createdAt: Date.now() }));
  notify();
}
export const listOutbox = (): Promise<OutboxItem[]> =>
  run<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>).then((l) => l.sort((a, b) => a.createdAt - b.createdAt));
export async function removeFromOutbox(clientId: string): Promise<void> {
  await run("readwrite", (s) => s.delete(clientId));
  notify();
}
export async function markOutboxError(clientId: string, error: string): Promise<void> {
  const all = await listOutbox();
  const it = all.find((x) => x.clientId === clientId);
  if (it) await run("readwrite", (s) => s.put({ ...it, error }));
  notify();
}
