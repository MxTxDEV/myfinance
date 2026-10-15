import { requireOwner } from "@/server/auth";
import { prisma } from "@/server/db";
import { todayBR } from "@/domain/dates";
import { PrivacyProvider } from "@/components/privacy";
import { QuickAddProvider } from "@/components/quick-add";
import { BottomNav, Sidebar } from "@/components/nav";
import { SwRegister } from "@/components/sw-register";
import { OfflineStatus } from "@/components/offline";
import { PushSoundListener } from "@/components/daily-message";
import { ThemeApplier } from "@/components/theme";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  const [categories, accounts, cards] = await Promise.all([
    prisma.category.findMany({ where: { archivedAt: null }, orderBy: [{ favorite: "desc" }, { name: "asc" }] }),
    prisma.account.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.creditCard.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <PrivacyProvider initial={owner.hideValues}>
      <ThemeApplier theme={owner.theme} />
      <QuickAddProvider
        data={{
          today: todayBR().toISOString().slice(0, 10),
          categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type, icon: c.icon, favorite: c.favorite })),
          accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
          cards: cards.map((c) => ({ id: c.id, name: c.name })),
        }}
      >
        <Sidebar name={owner.name} />
        <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] md:max-w-none md:pb-10 md:pl-[17rem] md:pr-8 md:pt-8">
          <div className="mx-auto max-w-4xl"><OfflineStatus />{children}</div>
        </main>
        <BottomNav />
        <SwRegister />
        <PushSoundListener />
      </QuickAddProvider>
    </PrivacyProvider>
  );
}
