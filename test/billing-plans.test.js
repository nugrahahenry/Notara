const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BILLING_PLANS,
  formatMidtransGrossAmount,
  getBillingPlan,
  getBillingPlanByAmount,
} = require('../build/lib/billing/plans.js');

test('billable plans expose one canonical display price and charge amount', () => {
  assert.deepEqual(
    {
      pro: {
        amount: BILLING_PLANS.pro.amount,
        displayPrice: BILLING_PLANS.pro.displayPrice,
      },
      max: {
        amount: BILLING_PLANS.max.amount,
        displayPrice: BILLING_PLANS.max.displayPrice,
      },
    },
    {
      pro: { amount: 49000, displayPrice: 'Rp 49.000' },
      max: { amount: 99000, displayPrice: 'Rp 99.000' },
    },
  );
});

test('checkout tier lookup returns the canonical plan object', () => {
  assert.equal(getBillingPlan('pro'), BILLING_PLANS.pro);
  assert.equal(getBillingPlan('max'), BILLING_PLANS.max);
});

test('billing callbacks derive Midtrans amounts and tier identity from the catalog', () => {
  assert.equal(formatMidtransGrossAmount('pro'), '49000.00');
  assert.equal(formatMidtransGrossAmount('max'), '99000.00');
  assert.equal(getBillingPlanByAmount(49000), BILLING_PLANS.pro);
  assert.equal(getBillingPlanByAmount(99000), BILLING_PLANS.max);
  assert.equal(getBillingPlanByAmount(1000), null);
});
