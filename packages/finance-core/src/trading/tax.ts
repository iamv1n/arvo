import { formatMoney, parseMoney, roundToCents } from '../money';
import { LTCG_EXEMPTION, LTCG_RATE_PERCENT, STCG_RATE_PERCENT, financialYearOf, financialYearRange } from '../portfolio/capital-gains';
import type { TradePosition } from './positions';
import type { TradeRecord } from './types';
import { isOptionSegment, isDerivativeSegment } from './types';

/*
 * Indian tax classification for trading, on the income-tax view rather than the broker's.
 *
 * Three buckets, each taxed differently:
 *   speculative business income      intraday equity — losses carry forward 4 years and can
 *                                    only be set off against speculative income
 *   non-speculative business income  futures and options, including currency and commodity —
 *                                    taxed at slab, losses carry forward 8 years
 *   capital gains                    equity taken to the demat account; short or long term by
 *                                    holding period, and handled by the same rules the
 *                                    portfolio module uses
 *
 * Turnover matters because it decides whether a tax audit applies, and it is *not* the value
 * of the trades. For both business buckets it is the "absolute profit" figure: the sum of the
 * positive and negative differences, each taken as a positive number. The 2022 revision of the
 * ICAI guidance note dropped premium received on options sold from the computation, so it is
 * reported separately rather than added in — an assessee whose advisor still adds it can see
 * both numbers.
 *
 * This is a worksheet, not a filing, and not tax advice. Every screen that shows it says so.
 */

/** Audit applies above ₹1 crore of turnover, or ₹10 crore when cash receipts and payments are under 5%. */
export const AUDIT_THRESHOLD = '10000000';
export const AUDIT_THRESHOLD_DIGITAL = '100000000';
/** Presumptive taxation under section 44AD is available up to this turnover. */
export const PRESUMPTIVE_LIMIT = '30000000';

export const TAX_DISCLAIMER =
  'A worksheet built from your own imported trades, to help you or your accountant prepare a return. It is not tax advice, and it does not replace the broker’s P&L statement or Form 26AS.';

export interface TaxBucket {
  label: string;
  trades: number;
  grossPnl: string;
  charges: string;
  netPnl: string;
  /** Absolute-profit turnover for the audit test. */
  turnover: string;
}

export interface CapitalGainsBucket {
  term: 'SHORT' | 'LONG';
  trades: number;
  proceeds: string;
  cost: string;
  charges: string;
  gain: string;
  /** Gain after the LTCG exemption, for long term only. */
  taxable: string;
  ratePercent: string;
  estimatedTax: string;
}

export interface TradingTaxSummary {
  financialYear: string;
  from: string;
  to: string;
  speculative: TaxBucket;
  nonSpeculative: TaxBucket;
  capitalGains: {
    buckets: CapitalGainsBucket[];
    totalGain: string;
    exemptionUsed: string;
    estimatedTax: string;
  };
  /** Premium received on options sold, reported for the older turnover reading. */
  optionSellPremium: string;
  /** Business turnover, the figure the audit thresholds are tested against. */
  businessTurnover: string;
  audit: {
    threshold: string;
    thresholdDigital: string;
    aboveThreshold: boolean;
    aboveDigitalThreshold: boolean;
    presumptiveAvailable: boolean;
    note: string;
  };
  chargesSummary: {
    brokerage: string;
    stt: string;
    exchangeCharges: string;
    sebiCharges: string;
    stampDuty: string;
    gst: string;
    dpCharges: string;
    otherCharges: string;
    total: string;
    /** STT on delivery trades is not deductible from capital gains; it is shown separately. */
    deductibleAgainstBusiness: string;
  };
  disclaimer: string;
}

export interface TaxInput {
  positions: TradePosition[];
  trades: TradeRecord[];
  financialYear: string;
}

/** Financial years with any closed position, newest first. */
export function tradingFinancialYears(positions: TradePosition[]): string[] {
  const years = new Set<string>();
  for (const position of positions) {
    if (position.status === 'CLOSED' && position.closedAt) years.add(financialYearOf(position.closedAt));
  }
  return [...years].sort().reverse();
}

export function tradingTaxSummary(input: TaxInput): TradingTaxSummary {
  const { from, to } = financialYearRange(input.financialYear);
  const closed = input.positions.filter((p) => p.status === 'CLOSED' && p.closedAt && p.closedAt >= from && p.closedAt <= to);
  const trades = input.trades.filter((t) => t.date >= from && t.date <= to);

  const speculative = bucket('Speculative business income (intraday equity)', closed.filter((p) => p.segment === 'EQUITY_INTRADAY'));
  const nonSpeculative = bucket('Non-speculative business income (F&O)', closed.filter((p) => isDerivativeSegment(p.segment)));
  const delivery = closed.filter((p) => p.segment === 'EQUITY_DELIVERY');

  const capitalGains = capitalGainsFor(delivery);
  const optionSellPremium = trades.filter((t) => isOptionSegment(t.segment) && t.side === 'SELL').reduce((sum, t) => sum + parseMoney(t.amount), 0n);
  const businessTurnover = parseMoney(speculative.turnover) + parseMoney(nonSpeculative.turnover);
  const charges = chargesSummary(closed);

  return {
    financialYear: input.financialYear,
    from,
    to,
    speculative,
    nonSpeculative,
    capitalGains,
    optionSellPremium: formatMoney(optionSellPremium),
    businessTurnover: formatMoney(businessTurnover),
    audit: {
      threshold: AUDIT_THRESHOLD,
      thresholdDigital: AUDIT_THRESHOLD_DIGITAL,
      aboveThreshold: businessTurnover > parseMoney(AUDIT_THRESHOLD),
      aboveDigitalThreshold: businessTurnover > parseMoney(AUDIT_THRESHOLD_DIGITAL),
      presumptiveAvailable: businessTurnover <= parseMoney(PRESUMPTIVE_LIMIT),
      note: 'Turnover is the absolute-profit figure, the sum of each round trip’s gain or loss taken as a positive number. The ₹10 crore limit applies when cash receipts and payments are each under 5% of the total, which trading through a bank account normally is.',
    },
    chargesSummary: charges,
    disclaimer: TAX_DISCLAIMER,
  };
}

function bucket(label: string, positions: TradePosition[]): TaxBucket {
  const gross = positions.reduce((sum, p) => sum + parseMoney(p.grossPnl), 0n);
  const charges = positions.reduce((sum, p) => sum + parseMoney(p.charges.total), 0n);
  const net = positions.reduce((sum, p) => sum + parseMoney(p.netPnl), 0n);
  const turnover = positions.reduce((sum, p) => sum + abs(parseMoney(p.netPnl)), 0n);
  return {
    label,
    trades: positions.length,
    grossPnl: formatMoney(gross),
    charges: formatMoney(charges),
    netPnl: formatMoney(net),
    turnover: formatMoney(turnover),
  };
}

/**
 * Capital gains on delivery trades. Equity listed on a recognised exchange is long term after
 * twelve months; the rates are the ones the portfolio module already uses, so the two views of
 * the same sale agree.
 */
function capitalGainsFor(positions: TradePosition[]): TradingTaxSummary['capitalGains'] {
  const short: TradePosition[] = [];
  const long: TradePosition[] = [];
  for (const position of positions) {
    const days = daysBetween(position.openedAt, position.closedAt ?? position.openedAt);
    (days > 365 ? long : short).push(position);
  }

  const buckets: CapitalGainsBucket[] = [];
  let exemptionUsed = 0n;
  let estimatedTax = 0n;

  for (const [term, rows, rate] of [
    ['SHORT', short, STCG_RATE_PERCENT],
    ['LONG', long, LTCG_RATE_PERCENT],
  ] as const) {
    const proceeds = rows.reduce((sum, p) => sum + parseMoney(p.exitValue), 0n);
    const cost = rows.reduce((sum, p) => sum + parseMoney(p.entryValue), 0n);
    const charges = rows.reduce((sum, p) => sum + parseMoney(p.charges.total), 0n);
    const gain = rows.reduce((sum, p) => sum + parseMoney(p.netPnl), 0n);
    let taxable = gain;
    if (term === 'LONG' && gain > 0n) {
      const exemption = parseMoney(LTCG_EXEMPTION);
      exemptionUsed = gain < exemption ? gain : exemption;
      taxable = gain - exemptionUsed;
    }
    const tax = taxable > 0n ? percentOf(taxable, rate) : 0n;
    estimatedTax += tax;
    buckets.push({
      term,
      trades: rows.length,
      proceeds: formatMoney(proceeds),
      cost: formatMoney(cost),
      charges: formatMoney(charges),
      gain: formatMoney(gain),
      taxable: formatMoney(taxable),
      ratePercent: rate,
      estimatedTax: formatMoney(tax),
    });
  }

  return {
    buckets,
    totalGain: formatMoney(buckets.reduce((sum, b) => sum + parseMoney(b.gain), 0n)),
    exemptionUsed: formatMoney(exemptionUsed),
    estimatedTax: formatMoney(estimatedTax),
  };
}

function chargesSummary(positions: TradePosition[]): TradingTaxSummary['chargesSummary'] {
  const keys = ['brokerage', 'stt', 'exchangeCharges', 'sebiCharges', 'stampDuty', 'gst', 'dpCharges', 'otherCharges'] as const;
  const totals: Record<string, bigint> = {};
  for (const key of keys) totals[key] = positions.reduce((sum, p) => sum + parseMoney(p.charges[key]), 0n);
  const total = keys.reduce((sum, key) => sum + totals[key], 0n);
  // Charges on delivery trades belong to the capital-gains computation, not to business income.
  const deliveryOnly = positions.filter((p) => p.segment === 'EQUITY_DELIVERY').reduce((sum, p) => sum + parseMoney(p.charges.total), 0n);
  return {
    brokerage: formatMoney(totals.brokerage),
    stt: formatMoney(totals.stt),
    exchangeCharges: formatMoney(totals.exchangeCharges),
    sebiCharges: formatMoney(totals.sebiCharges),
    stampDuty: formatMoney(totals.stampDuty),
    gst: formatMoney(totals.gst),
    dpCharges: formatMoney(totals.dpCharges),
    otherCharges: formatMoney(totals.otherCharges),
    total: formatMoney(total),
    deductibleAgainstBusiness: formatMoney(total - deliveryOnly),
  };
}

/** One row per bucket, ready for the ITR-3 helper export. */
export interface Itr3Row {
  section: string;
  item: string;
  amount: string;
  note: string;
}

export function itr3Rows(summary: TradingTaxSummary): Itr3Row[] {
  const rows: Itr3Row[] = [
    { section: 'Schedule BP', item: 'Speculative business — turnover', amount: summary.speculative.turnover, note: 'Absolute profit on intraday equity' },
    { section: 'Schedule BP', item: 'Speculative business — net profit or loss', amount: summary.speculative.netPnl, note: 'After all charges' },
    { section: 'Schedule BP', item: 'Non-speculative business — turnover', amount: summary.nonSpeculative.turnover, note: 'Absolute profit on F&O' },
    { section: 'Schedule BP', item: 'Non-speculative business — net profit or loss', amount: summary.nonSpeculative.netPnl, note: 'After all charges' },
    { section: 'Schedule BP', item: 'Charges claimed as expenses', amount: summary.chargesSummary.total, note: 'Brokerage, exchange, SEBI, stamp duty and GST' },
    { section: 'Schedule BP', item: 'Option premium received on sales', amount: summary.optionSellPremium, note: 'Reported separately; the 2022 ICAI guidance excludes it from turnover' },
  ];
  for (const bucket of summary.capitalGains.buckets) {
    const label = bucket.term === 'SHORT' ? 'Short-term capital gains (section 111A)' : 'Long-term capital gains (section 112A)';
    rows.push(
      { section: 'Schedule CG', item: `${label} — full value of consideration`, amount: bucket.proceeds, note: 'Delivery sales' },
      { section: 'Schedule CG', item: `${label} — cost of acquisition`, amount: bucket.cost, note: 'FIFO' },
      { section: 'Schedule CG', item: `${label} — gain`, amount: bucket.gain, note: `Estimated tax at ${bucket.ratePercent}%: ${bucket.estimatedTax}` },
    );
  }
  rows.push({
    section: 'Audit',
    item: 'Business turnover tested against the audit threshold',
    amount: summary.businessTurnover,
    note: summary.audit.aboveDigitalThreshold
      ? 'Above ₹10 crore'
      : summary.audit.aboveThreshold
        ? 'Above ₹1 crore; the ₹10 crore limit usually applies to bank-settled trading'
        : 'Below ₹1 crore',
  });
  return rows;
}

const abs = (value: bigint) => (value < 0n ? -value : value);

function percentOf(amount: bigint, percent: string): bigint {
  return roundToCents((amount * parseMoney(percent)) / (100n * 10_000n));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
