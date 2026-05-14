// Proporção (proration) para mudanças de plano.
// Mesma lógica usada no painel super admin (frontend) e nas edge functions
// (cópia em supabase/functions/_shared/proration.ts).

export type BillingPeriod = "monthly" | "quarterly" | "annual";

export const cycleDays = (p: BillingPeriod) =>
  p === "annual" ? 365 : p === "quarterly" ? 90 : 30;

export const addPeriod = (from: Date, p: BillingPeriod): Date => {
  const d = new Date(from);
  if (p === "annual") d.setFullYear(d.getFullYear() + 1);
  else if (p === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

export interface ProrationInput {
  /** Valor que a empresa pagou no ciclo atual (já com desconto, se houver). */
  currentPaidValue: number;
  currentPeriod: BillingPeriod;
  /** Início do ciclo atual (starts_at da assinatura). */
  cycleStart: Date;
  /** Fim do ciclo atual (next_billing_date). */
  cycleEnd: Date;
  /** Novo valor cheio do plano escolhido (no novo período). */
  newValue: number;
  newPeriod: BillingPeriod;
  /** Saldo de créditos disponíveis (já somado). */
  availableCredits?: number;
  /** Data de referência (default: agora). */
  now?: Date;
}

export interface ProrationResult {
  /** Crédito gerado a favor da empresa (downgrade ou troca de período). 0 se não houver. */
  creditGenerated: number;
  /** Valor a cobrar agora no upgrade (já abatendo créditos). 0 em downgrade. */
  chargeNow: number;
  /** Créditos que serão consumidos imediatamente. */
  creditsConsumed: number;
  /** Próxima data de cobrança após a mudança. */
  nextBillingDate: Date;
  /** "upgrade" | "downgrade" | "same" */
  action: "upgrade" | "downgrade" | "same";
  /** Detalhamento para exibir ao usuário. */
  details: {
    daysRemaining: number;
    cycleDays: number;
    unusedCredit: number;
    newCostForRemainingDays: number;
    rawDiff: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateProration(input: ProrationInput): ProrationResult {
  const now = input.now ?? new Date();
  const totalDays = Math.max(1, Math.round((input.cycleEnd.getTime() - input.cycleStart.getTime()) / 86400000));
  const daysRemaining = Math.max(0, Math.ceil((input.cycleEnd.getTime() - now.getTime()) / 86400000));

  // Crédito não usado do plano atual
  const unusedCredit = round2((input.currentPaidValue * daysRemaining) / totalDays);

  // Valor proporcional do novo plano para os dias restantes (no período atual)
  // Convertemos o novo valor para o "preço diário" do novo período
  const newDaily = input.newValue / cycleDays(input.newPeriod);
  const newCostForRemainingDays = round2(newDaily * daysRemaining);

  const rawDiff = round2(newCostForRemainingDays - unusedCredit);

  let action: ProrationResult["action"] = "same";
  if (rawDiff > 0.5) action = "upgrade";
  else if (rawDiff < -0.5) action = "downgrade";

  let creditGenerated = 0;
  let chargeNow = 0;
  let creditsConsumed = 0;

  if (action === "upgrade") {
    const credits = input.availableCredits ?? 0;
    creditsConsumed = Math.min(credits, rawDiff);
    chargeNow = round2(rawDiff - creditsConsumed);
  } else if (action === "downgrade") {
    creditGenerated = round2(-rawDiff);
  }

  // Próxima cobrança: a partir de agora, conforme novo período.
  // (no upgrade pago, o próximo ciclo começa hoje)
  const nextBillingDate = addPeriod(now, input.newPeriod);

  return {
    creditGenerated,
    chargeNow,
    creditsConsumed,
    nextBillingDate,
    action,
    details: {
      daysRemaining,
      cycleDays: totalDays,
      unusedCredit,
      newCostForRemainingDays,
      rawDiff,
    },
  };
}

export function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function periodLabel(p: BillingPeriod) {
  return p === "annual" ? "Anual" : p === "quarterly" ? "Trimestral" : "Mensal";
}
