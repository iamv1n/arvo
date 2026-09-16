/**
 * Deterministic calculators behind the worked examples on the landing page.
 * Every figure the planning tools section displays is derived here, so numbers stay
 * internally consistent. Illustrative only; not financial advice.
 */

/** Standard reducing-balance EMI: P·r·(1+r)^n / ((1+r)^n − 1), with r the monthly rate. */
export function emi(principal: number, annualRatePct: number, months: number): number {
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export interface AmortizationResult {
  emi: number;
  months: number;
  totalInterest: number;
  totalPaid: number;
  /** Outstanding balance at month 0, 12, 24, … until paid off. */
  yearlyBalances: number[];
}

/**
 * Month-by-month amortization. An optional lump-sum prepayment is applied at the end of
 * every 12th month, reducing principal while the EMI stays the same (so the tenure shrinks).
 */
export function amortize(principal: number, annualRatePct: number, months: number, prepayPerYear = 0): AmortizationResult {
  const r = annualRatePct / 12 / 100;
  const payment = emi(principal, annualRatePct, months);
  let balance = principal;
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;
  const yearlyBalances = [principal];
  while (balance > 0.005 && month < months) {
    month += 1;
    const interest = balance * r;
    const pay = Math.min(payment, balance + interest);
    totalInterest += interest;
    totalPaid += pay;
    balance = balance + interest - pay;
    if (prepayPerYear > 0 && month % 12 === 0 && balance > 0.005) {
      const extra = Math.min(prepayPerYear, balance);
      balance -= extra;
      totalPaid += extra;
    }
    if (month % 12 === 0 || balance <= 0.005) yearlyBalances.push(Math.max(0, balance));
  }
  return { emi: payment, months: month, totalInterest, totalPaid, yearlyBalances };
}

/** Future value of a monthly SIP invested at the start of each month (annuity due), monthly compounding. */
export function sipFutureValue(monthly: number, annualReturnPct: number, years: number): number {
  const r = annualReturnPct / 12 / 100;
  const n = years * 12;
  if (r === 0) return monthly * n;
  return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

/**
 * Prepay vs invest over the original tenure, with identical cash outflows in both options.
 * - Prepay: pay EMI + yearly lump sum; once the loan closes, invest the EMI monthly and the lump sum yearly.
 * - Invest: pay only the EMI and invest the lump sum every year.
 * Returns the investment corpus of each option at the end of the original tenure.
 */
export function prepayVsInvest(
  principal: number,
  annualRatePct: number,
  months: number,
  prepayPerYear: number,
  assumedReturnPct: number,
) {
  const g = assumedReturnPct / 12 / 100;
  const withPrepay = amortize(principal, annualRatePct, months, prepayPerYear);
  const payment = withPrepay.emi;
  let prepayCorpus = 0;
  let investCorpus = 0;
  for (let m = 1; m <= months; m += 1) {
    prepayCorpus *= 1 + g;
    investCorpus *= 1 + g;
    if (m > withPrepay.months) prepayCorpus += payment;
    if (m % 12 === 0) {
      investCorpus += prepayPerYear;
      if (m > withPrepay.months) prepayCorpus += prepayPerYear;
    }
  }
  return { prepayCorpus, investCorpus, assumedReturnPct };
}

export interface Debt {
  name: string;
  balance: number;
  aprPct: number;
  minPayment: number;
}

export interface PayoffResult {
  order: string[];
  months: number;
  totalInterest: number;
  /** Total outstanding debt at the start of each month, ending with 0. */
  monthlyTotals: number[];
  /** Month (1-based) each debt is cleared, by name. */
  clearedAt: Record<string, number>;
}

/**
 * Pays every minimum, then puts the rest of a fixed monthly budget on the target debt.
 * `avalanche` targets the highest APR first; `snowball` targets the smallest balance first.
 * Freed-up minimums roll into the next target.
 */
export function payoff(debts: Debt[], monthlyBudget: number, strategy: 'avalanche' | 'snowball'): PayoffResult {
  const state = debts.map((d) => ({ ...d }));
  const order = [...state]
    .sort((a, b) => (strategy === 'avalanche' ? b.aprPct - a.aprPct : a.balance - b.balance))
    .map((d) => d.name);
  const clearedAt: Record<string, number> = {};
  const monthlyTotals = [state.reduce((s, d) => s + d.balance, 0)];
  let totalInterest = 0;
  let month = 0;
  while (state.some((d) => d.balance > 0.005) && month < 600) {
    month += 1;
    for (const d of state) {
      if (d.balance <= 0.005) continue;
      const interest = (d.balance * d.aprPct) / 12 / 100;
      d.balance += interest;
      totalInterest += interest;
    }
    let budget = monthlyBudget;
    for (const d of state) {
      if (d.balance <= 0.005) continue;
      const pay = Math.min(d.minPayment, d.balance);
      d.balance -= pay;
      budget -= pay;
    }
    for (const name of order) {
      const d = state.find((x) => x.name === name);
      if (!d || d.balance <= 0.005 || budget <= 0) continue;
      const pay = Math.min(budget, d.balance);
      d.balance -= pay;
      budget -= pay;
    }
    for (const d of state) {
      if (d.balance <= 0.005 && clearedAt[d.name] === undefined) {
        d.balance = 0;
        clearedAt[d.name] = month;
      }
    }
    monthlyTotals.push(state.reduce((s, d) => s + d.balance, 0));
  }
  return { order, months: month, totalInterest, monthlyTotals, clearedAt };
}

/** Budget pacing: projects month-end spend linearly from spend so far. */
export function budgetPacing(spent: number, budget: number, dayOfMonth: number, daysInMonth: number) {
  const elapsed = dayOfMonth / daysInMonth;
  const projected = spent / elapsed;
  return { usedPct: spent / budget, elapsedPct: elapsed, projected, overspend: Math.max(0, projected - budget) };
}

/** Required monthly contribution to reach a goal, rounded up to the rupee. */
export function goalMonthly(target: number, months: number, saved = 0): number {
  return Math.ceil((target - saved) / months);
}

/** Affordability check against an emergency buffer, with months to wait at a given monthly surplus. */
export function affordability(cash: number, price: number, buffer: number, monthlySurplus: number) {
  const afterPurchase = cash - price;
  const shortfall = Math.max(0, buffer - afterPurchase);
  const waitMonths = shortfall === 0 ? 0 : Math.ceil(shortfall / monthlySurplus);
  return { afterPurchase, shortfall, waitMonths, afterWaiting: afterPurchase + waitMonths * monthlySurplus };
}

/* ---------------- The concrete worked examples ---------------- */

export const HOME_LOAN = { principal: 40_00_000, ratePct: 8.5, years: 20, prepayPerYear: 1_00_000, assumedReturnPct: 10 };

export function homeLoanExample() {
  const n = HOME_LOAN.years * 12;
  const base = amortize(HOME_LOAN.principal, HOME_LOAN.ratePct, n);
  const prepay = amortize(HOME_LOAN.principal, HOME_LOAN.ratePct, n, HOME_LOAN.prepayPerYear);
  const compare = prepayVsInvest(HOME_LOAN.principal, HOME_LOAN.ratePct, n, HOME_LOAN.prepayPerYear, HOME_LOAN.assumedReturnPct);
  return {
    base,
    prepay,
    monthsSaved: base.months - prepay.months,
    interestSaved: base.totalInterest - prepay.totalInterest,
    compare,
  };
}

export const DEBTS: Debt[] = [
  { name: 'Credit card', balance: 1_80_000, aprPct: 36, minPayment: 9_000 },
  { name: 'Personal loan', balance: 1_50_000, aprPct: 14, minPayment: 5_000 },
  { name: 'Car loan', balance: 4_50_000, aprPct: 9.5, minPayment: 9_500 },
];
export const DEBT_BUDGET = 40_000;

export function debtExample() {
  return { avalanche: payoff(DEBTS, DEBT_BUDGET, 'avalanche'), snowball: payoff(DEBTS, DEBT_BUDGET, 'snowball') };
}

/** Savings opportunities shared by the advisor chat and the spending-reduction example. */
export const OPPORTUNITIES = [
  {
    label: 'Food delivery',
    detail: '₹6,800 this month vs a 3-month average of ₹4,850 (+40%)',
    current: 6_800,
    target: 4_000,
  },
  { label: 'Unused gym membership', detail: 'Charged ₹1,500 every month; flagged as possibly unused for 2 months', current: 1_500, target: 0 },
  { label: 'Card late fee and interest', detail: 'Paid after the due date twice in 3 months', current: 900, target: 0 },
].map((o) => ({ ...o, saving: o.current - o.target }));

export const OPPORTUNITY_TOTAL = OPPORTUNITIES.reduce((s, o) => s + o.saving, 0);

export const SPENDING_BEFORE_AFTER = [
  { name: 'Food delivery', before: 6_800, after: 4_000 },
  { name: 'Shopping', before: 9_200, after: 7_500 },
  { name: 'Subscriptions', before: 2_268, after: 768 },
  { name: 'Fees & interest', before: 900, after: 0 },
  { name: 'Cabs', before: 4_100, after: 3_400 },
];

export function personalFinanceExample() {
  const pacing = budgetPacing(6_200, 8_000, 18, 30);
  const subscriptions = [
    { name: 'Netflix', amount: 649, note: 'Watched this month' },
    { name: 'Spotify', amount: 119, note: 'Active' },
    { name: 'Gym membership', amount: 1_500, note: 'Unused for 2 months' },
  ];
  return {
    pacing,
    subscriptions,
    subscriptionTotal: subscriptions.reduce((s, x) => s + x.amount, 0),
    emergency: { target: 3_00_000, months: 18, monthly: goalMonthly(3_00_000, 18) },
  };
}

export const SIP = { monthly: 15_000, years: 10, assumedReturnPct: 12 };

export const ALLOCATION = [
  { name: 'Equity mutual funds', value: 12_40_000 },
  { name: 'Direct stocks', value: 4_60_000 },
  { name: 'EPF & PPF', value: 5_20_000 },
  { name: 'Fixed deposits', value: 3_00_000 },
  { name: 'Gold', value: 1_40_000 },
];

export function investmentExample() {
  const fv = sipFutureValue(SIP.monthly, SIP.assumedReturnPct, SIP.years);
  const invested = SIP.monthly * SIP.years * 12;
  const yearly = Array.from({ length: SIP.years + 1 }, (_, y) => ({
    year: y,
    invested: SIP.monthly * 12 * y,
    value: sipFutureValue(SIP.monthly, SIP.assumedReturnPct, y),
  }));
  const total = ALLOCATION.reduce((s, a) => s + a.value, 0);
  return { fv, invested, gains: fv - invested, yearly, allocation: ALLOCATION.map((a) => ({ ...a, pct: (a.value / total) * 100 })), total };
}

export const PURCHASE = { price: 70_000, cash: 1_85_000, buffer: 1_50_000, monthlySurplus: 18_000, goalMonthly: 16_667 };

export function purchaseExample() {
  return affordability(PURCHASE.cash, PURCHASE.price, PURCHASE.buffer, PURCHASE.monthlySurplus);
}
