export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-bold">Sem conexão</h1>
      <p className="text-muted">Seus dados ficam seguros no servidor. Reconecte para continuar registrando movimentações.</p>
    </main>
  );
}
