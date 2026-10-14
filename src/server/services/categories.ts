import { prisma } from "../db";
import { DomainError } from "../errors";
import { categoryInput, type CategoryInput } from "../schemas";

const DEFAULTS: Array<[string, "INCOME" | "EXPENSE", string]> = [
  ["Salário", "INCOME", "briefcase"], ["Renda extra", "INCOME", "plus-circle"], ["Serviços prestados", "INCOME", "hammer"],
  ["Vendas", "INCOME", "shopping-bag"], ["Comissões", "INCOME", "percent"], ["Rendimentos", "INCOME", "trending-up"],
  ["Reembolsos", "INCOME", "undo-2"], ["Outras receitas", "INCOME", "tag"],
  ["Alimentação", "EXPENSE", "utensils"], ["Mercado", "EXPENSE", "shopping-cart"], ["Transporte", "EXPENSE", "bus"],
  ["Combustível", "EXPENSE", "fuel"], ["Moradia", "EXPENSE", "home"], ["Saúde", "EXPENSE", "heart-pulse"],
  ["Academia", "EXPENSE", "dumbbell"], ["Lazer", "EXPENSE", "popcorn"], ["Assinaturas", "EXPENSE", "repeat"],
  ["Compras pessoais", "EXPENSE", "shopping-bag"], ["Tecnologia", "EXPENSE", "laptop"], ["Educação", "EXPENSE", "graduation-cap"],
  ["Dívidas", "EXPENSE", "landmark"], ["Veículos", "EXPENSE", "car"], ["Juros e taxas", "EXPENSE", "receipt"], ["Outras despesas", "EXPENSE", "tag"],
];

/** Cria as categorias padrão que ainda não existem (idempotente). */
export async function ensureDefaultCategories(): Promise<number> {
  const r = await prisma.category.createMany({
    data: DEFAULTS.map(([name, type, icon], i) => ({ name, type, icon, favorite: i < 3 || name === "Mercado" || name === "Alimentação" })),
    skipDuplicates: true,
  });
  return r.count;
}

export async function createCategory(raw: CategoryInput) {
  const v = categoryInput.parse(raw);
  try { return await prisma.category.create({ data: v }); }
  catch { throw new DomainError("Já existe uma categoria com esse nome"); }
}
export const archiveCategory = (id: string) => prisma.category.update({ where: { id }, data: { archivedAt: new Date() } });
export const toggleFavorite = async (id: string) => {
  const c = await prisma.category.findUniqueOrThrow({ where: { id } });
  return prisma.category.update({ where: { id }, data: { favorite: !c.favorite } });
};
