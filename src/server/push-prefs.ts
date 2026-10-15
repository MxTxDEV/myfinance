import { z } from "zod";
import { parseHHMM } from "@/domain/schedule";

const hhmm = z.string().refine((s) => parseHHMM(s) !== null, "Horário inválido (use HH:MM)");

export const pushPrefsSchema = z
  .object({
    enabled: z.boolean(), // liga/desliga todas as notificações push
    morning: z.boolean(), // mensagem fixa no início da janela (06:00)
    perDay: z.number().int().min(0).max(10), // mensagens sorteadas ao longo do dia (além da manhã)
    windowStart: hhmm,
    windowEnd: hhmm,
    minGapMinutes: z.number().int().min(15).max(240),
    spend: z.boolean(), // "pense antes de gastar"
    invest: z.boolean(), // "invista em vez de gastar"
    motivation: z.boolean(), // "não desista" (o que você perde se parar)
    emojis: z.boolean(),
    alerts: z.object({
      bills: z.boolean(), invoices: z.boolean(), debts: z.boolean(), budget: z.boolean(), goals: z.boolean(), monthlySummary: z.boolean(), wins: z.boolean(),
    }),
    stages: z.array(z.number().int().min(0).max(14)).min(1).max(5), // avisos: quantos dias antes
  })
  .refine((v) => (parseHHMM(v.windowStart) ?? 0) < (parseHHMM(v.windowEnd) ?? 0), { message: "O horário final deve ser depois do inicial", path: ["windowEnd"] });
export type PushPrefs = z.infer<typeof pushPrefsSchema>;

export const DEFAULT_PREFS: PushPrefs = {
  enabled: true, morning: true, perDay: 4, windowStart: "06:00", windowEnd: "22:00", minGapMinutes: 60,
  spend: true, invest: true, motivation: true, emojis: true,
  alerts: { bills: true, invoices: true, debts: true, budget: false, goals: false, monthlySummary: true, wins: true },
  stages: [3, 1, 0],
};

/** Lê as preferências salvas no perfil (Profile.notifyPrefs.menu), completando o que faltar com o padrão. */
export function readPrefs(raw: unknown): PushPrefs {
  const menu = (raw && typeof raw === "object" ? (raw as { menu?: Partial<PushPrefs> }).menu : undefined) ?? {};
  const merged = { ...DEFAULT_PREFS, ...menu, alerts: { ...DEFAULT_PREFS.alerts, ...(menu.alerts ?? {}) } };
  const r = pushPrefsSchema.safeParse(merged);
  return r.success ? r.data : DEFAULT_PREFS;
}

/** Só o que muda os horários/mensagens sorteados: se mudar, os horários ainda não enviados são sorteados de novo. */
export function prefsKey(p: PushPrefs): string {
  return JSON.stringify([p.morning, p.perDay, p.windowStart, p.windowEnd, p.minGapMinutes, p.spend, p.invest, p.motivation]);
}
