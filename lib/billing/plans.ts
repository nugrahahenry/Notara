export type BillableTier = 'pro' | 'max';

export interface BillingPlan {
  tier: BillableTier;
  name: 'Pro' | 'Max';
  amount: number;
  displayPrice: string;
  periodLabel: '/bulan';
}

export const BILLING_PLANS: Readonly<Record<BillableTier, BillingPlan>> = Object.freeze({
  pro: Object.freeze({
    tier: 'pro',
    name: 'Pro',
    amount: 49_000,
    displayPrice: 'Rp 49.000',
    periodLabel: '/bulan',
  }),
  max: Object.freeze({
    tier: 'max',
    name: 'Max',
    amount: 99_000,
    displayPrice: 'Rp 99.000',
    periodLabel: '/bulan',
  }),
});

export function getBillingPlan(tier: BillableTier): BillingPlan {
  return BILLING_PLANS[tier];
}

export function getBillingPlanByAmount(amount: number): BillingPlan | null {
  return Object.values(BILLING_PLANS).find((plan) => plan.amount === amount) ?? null;
}

export function formatMidtransGrossAmount(tier: BillableTier): string {
  return getBillingPlan(tier).amount.toFixed(2);
}
