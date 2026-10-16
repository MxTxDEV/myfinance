import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const money = z.number().int("Valor em centavos").positive("O valor deve ser maior que zero").max(99_999_999_999);
const id = z.string().min(1);

export const transactionInput = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"]),
    amount: money, // centavos
    description: z.string().trim().min(1, "Informe uma descrição").max(120),
    date: isoDate,
    categoryId: id,
    status: z.enum(["PLANNED", "SETTLED"]).default("SETTLED"),
    accountId: id.optional(),
    cardId: id.optional(),
    installments: z.number().int().min(1).max(120).default(1),
    dueDate: isoDate.optional(),
    payerSource: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    attachmentUrl: z.string().url().optional(),
    // UUID gerado no aparelho: torna o reenvio da fila offline idempotente.
    clientId: z.string().uuid().optional(),
    importKey: z.string().min(3).max(300).optional(), // extrato importado: impede importar a mesma linha duas vezes
    // Cria também um compromisso recorrente a partir desta movimentação (despesa/receita fixa).
    repeat: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.repeat && v.installments > 1) ctx.addIssue({ code: "custom", message: "Parcelamento não pode ser recorrente", path: ["repeat"] });
    if (v.cardId && v.accountId) ctx.addIssue({ code: "custom", message: "Escolha conta ou cartão, não ambos", path: ["cardId"] });
    if (!v.cardId && !v.accountId) ctx.addIssue({ code: "custom", message: "Escolha a conta ou o cartão", path: ["accountId"] });
    if (v.cardId && v.type === "INCOME") ctx.addIssue({ code: "custom", message: "Receitas não podem ir para cartão", path: ["cardId"] });
    if (v.installments > 1 && !v.cardId) ctx.addIssue({ code: "custom", message: "Parcelamento exige cartão de crédito", path: ["installments"] });
    if (v.cardId && v.status === "PLANNED") ctx.addIssue({ code: "custom", message: "Compra no cartão não pode ser prevista", path: ["status"] });
  });
export type TransactionInput = z.infer<typeof transactionInput>;

export const transactionUpdate = z.object({
  amount: money.optional(),
  description: z.string().trim().min(1).max(120).optional(),
  date: isoDate.optional(),
  categoryId: id.optional(),
  accountId: id.optional(),
  dueDate: isoDate.nullable().optional(),
  payerSource: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type TransactionUpdate = z.infer<typeof transactionUpdate>;

export const transferInput = z
  .object({
    fromAccountId: id,
    toAccountId: id,
    amount: money,
    date: isoDate,
    description: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, { message: "Escolha contas diferentes", path: ["toAccountId"] });
export type TransferInput = z.infer<typeof transferInput>;

export const accountInput = z.object({
  name: z.string().trim().min(1).max(60),
  institution: z.string().trim().max(60).optional(),
  type: z.enum(["CHECKING", "DIGITAL", "CASH", "SAVINGS", "INVESTMENT", "OTHER"]),
  initialBalance: z.number().int().max(99_999_999_999).default(0),
  initialBalanceDate: isoDate,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4338CA"),
  icon: z.string().max(30).default("wallet"),
});
export type AccountInput = z.infer<typeof accountInput>;

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(["INCOME", "EXPENSE"]),
  icon: z.string().max(30).default("tag"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748B"),
  favorite: z.boolean().default(false),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export const cardInput = z.object({
  name: z.string().trim().min(1).max(60),
  issuer: z.string().trim().max(60).optional(),
  limit: z.number().int().min(0).max(99_999_999_999),
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  payAccountId: id,
  monthlyRate: z.number().min(0).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7C3AED"),
});
export type CardInput = z.infer<typeof cardInput>;

export const invoicePaymentInput = z.object({
  invoiceId: id,
  amount: money,
  date: isoDate,
  accountId: id.optional(),
});
export type InvoicePaymentInput = z.infer<typeof invoicePaymentInput>;

export const recurringInput = z.object({
  description: z.string().trim().min(1).max(120),
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: money,
  categoryId: id,
  accountId: id.optional(),
  cardId: id.optional(),
  recurrence: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY", "CUSTOM"]),
  intervalDays: z.number().int().min(1).max(3650).optional(),
  startDate: isoDate,
  endDate: isoDate.optional(),
});
export type RecurringInput = z.infer<typeof recurringInput>;

export const budgetInput = z.object({
  categoryId: id,
  limit: money,
  alertAt: z.array(z.number().int().min(1).max(200)).max(6).default([50, 80, 100]),
});
export const goalInput = z.object({
  name: z.string().trim().min(1).max(80),
  targetAmount: money,
  targetDate: isoDate.optional(),
  priority: z.number().int().min(1).max(3).default(2),
  description: z.string().trim().max(300).optional(),
  accountId: id.optional(),
});
export const goalEntryInput = z.object({
  goalId: id,
  amount: z.number().int().refine((n) => n !== 0, "Valor não pode ser zero"),
  date: isoDate,
  note: z.string().trim().max(200).optional(),
});
export const debtInput = z.object({
  name: z.string().trim().min(1).max(80),
  creditor: z.string().trim().max(80).optional(),
  originalAmount: money,
  balance: z.number().int().min(0),
  monthlyRate: z.number().min(0).max(100).optional(),
  installmentAmount: money.optional(),
  installmentsTotal: z.number().int().min(1).max(600).optional(),
  nextDueDate: isoDate.optional(),
  kind: z.enum(["CARTAO", "VEICULO", "FINANCIAMENTO", "EMPRESTIMO", "OUTRO"]).optional(),
});
export const debtUpdateInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  balance: z.number().int().min(0).optional(),
  monthlyRate: z.number().min(0).max(100).nullable().optional(),
  installmentAmount: money.nullable().optional(),
  kind: z.enum(["CARTAO", "VEICULO", "FINANCIAMENTO", "EMPRESTIMO", "OUTRO"]).optional(),
});
export const debtPaymentInput = z.object({
  debtId: id,
  amount: money,
  date: isoDate,
  accountId: id,
});
export const assetInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["INVESTMENT", "PROPERTY", "VEHICLE", "EQUIPMENT", "OTHER"]),
  value: z.number().int().min(0),
  valueUpdatedAt: isoDate,
  notes: z.string().trim().max(300).optional(),
});

export const recurringUpdate = z.object({
  description: z.string().trim().min(1).max(120).optional(),
  amount: money.optional(),
  categoryId: id.optional(),
  accountId: id.optional(),
  endDate: isoDate.nullable().optional(),
});
export type RecurringUpdate = z.infer<typeof recurringUpdate>;

export const investmentInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["FIXED_INCOME", "TREASURY", "STOCKS", "REAL_ESTATE_FUND", "FUNDS", "CRYPTO", "PENSION", "OTHER"]),
  institution: z.string().trim().max(60).optional(),
  initialValue: z.number().int().min(0).max(99_999_999_999).default(0), // posição que você já tem (sem mexer em conta)
  date: isoDate,
});
export type InvestmentInput = z.infer<typeof investmentInput>;
export const investmentMoveInput = z.object({
  investmentId: id,
  amount: money,
  date: isoDate,
  accountId: id.optional(), // com conta: o dinheiro sai/entra nela; sem conta: só registra a posição
  note: z.string().trim().max(200).optional(),
});
export type InvestmentMoveInput = z.infer<typeof investmentMoveInput>;
export const investmentValueInput = z.object({
  investmentId: id,
  value: z.number().int().min(0).max(99_999_999_999),
  date: isoDate,
});
