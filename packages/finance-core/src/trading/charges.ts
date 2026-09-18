import { formatMoney, parseMoney, roundToCents } from '../money';
import type { BrokerConfig, BrokeragePlan, ChargeBreakdown, ChargesSource, TradeExchange, TradeRecord, TradeSegment, TradingSettingsRecord } from './types';
import { isOptionSegment } from './types';

/*
 * The Indian charges engine.
 *
 * Statutory rates are published as percentages of turnover, so they are held here as integer
 * parts-per-billion (0.1% = 1_000_000 ppb) and applied to exact money units. Every component
 * is rounded to the paisa, half away from zero, the way a contract note does it — rounding at
 * the end instead would put us a few paise off every real note we tested against.
 *
 * Rates change by notification, so they are versioned by the date they took effect and a fill
 * is charged at the rates in force on its own trade date. The most recent change folded in
 * here is 1 October 2024, when STT on futures went to 0.02% and on option premium to 0.1%,
 * and NSE cut the F&O transaction charges.
 *
 * Two charges are not per-fill: brokerage is per order and DP charges are per scrip per day.
 * `estimateCharges` therefore works on a whole trade list, groups fills accordingly, and
 * allocates the grouped charge back pro rata by turnover.
 *
 * Not modelled: the NSE investor protection fund levy (₹10–₹50 per crore) and any broker's
 * call-and-trade or auction fees. They are well under a rupee on a typical order; where the
 * imported file states the real total we keep the broker's figure instead of ours.
 */

/** Statutory percentages as integer parts-per-billion. 0.1% = 1_000_000. */
export interface SegmentRates {
  /** Securities/commodities transaction tax on the buy leg. */
  sttBuyPpb: bigint;
  /** …and on the sell leg. Most segments charge the seller only. */
  sttSellPpb: bigint;
  /** Exchange transaction charges, per exchange. */
  exchangePpb: Partial<Record<TradeExchange, bigint>>;
  /** Stamp duty, charged to the buyer only. */
  stampBuyPpb: bigint;
}

export interface RateSet {
  effectiveFrom: string;
  label: string;
  segments: Record<TradeSegment, SegmentRates>;
}

/** SEBI turnover fee: ₹10 per crore, on every segment. */
export const SEBI_TURNOVER_PPB = 1_000n;
/** GST on brokerage, exchange charges and the SEBI fee. */
export const GST_PERCENT = 18n;
/** STT on an option exercised in the money, charged on intrinsic value to the buyer. */
export const EXERCISED_OPTION_STT_PPB = 1_250_000n;

const pct = (percent: number): bigint => BigInt(Math.round(percent * 10_000_000));

/** Rates in force before the 1 October 2024 notification. */
const RATES_2023: RateSet = {
  effectiveFrom: '2000-01-01',
  label: 'Before 1 Oct 2024',
  segments: {
    EQUITY_DELIVERY: { sttBuyPpb: pct(0.1), sttSellPpb: pct(0.1), exchangePpb: { NSE: pct(0.00325), BSE: pct(0.00375) }, stampBuyPpb: pct(0.015) },
    EQUITY_INTRADAY: { sttBuyPpb: 0n, sttSellPpb: pct(0.025), exchangePpb: { NSE: pct(0.00325), BSE: pct(0.00375) }, stampBuyPpb: pct(0.003) },
    EQUITY_FUTURES: { sttBuyPpb: 0n, sttSellPpb: pct(0.0125), exchangePpb: { NFO: pct(0.002), BFO: pct(0.002) }, stampBuyPpb: pct(0.002) },
    INDEX_FUTURES: { sttBuyPpb: 0n, sttSellPpb: pct(0.0125), exchangePpb: { NFO: pct(0.002), BFO: pct(0.002) }, stampBuyPpb: pct(0.002) },
    EQUITY_OPTIONS: { sttBuyPpb: 0n, sttSellPpb: pct(0.0625), exchangePpb: { NFO: pct(0.05), BFO: pct(0.05) }, stampBuyPpb: pct(0.003) },
    INDEX_OPTIONS: { sttBuyPpb: 0n, sttSellPpb: pct(0.0625), exchangePpb: { NFO: pct(0.05), BFO: pct(0.05) }, stampBuyPpb: pct(0.003) },
    CURRENCY_FUTURES: { sttBuyPpb: 0n, sttSellPpb: 0n, exchangePpb: { CDS: pct(0.00035), BCD: pct(0.00035) }, stampBuyPpb: pct(0.0001) },
    CURRENCY_OPTIONS: { sttBuyPpb: 0n, sttSellPpb: 0n, exchangePpb: { CDS: pct(0.0311), BCD: pct(0.001) }, stampBuyPpb: pct(0.0001) },
    COMMODITY_FUTURES: { sttBuyPpb: 0n, sttSellPpb: pct(0.01), exchangePpb: { MCX: pct(0.0026) }, stampBuyPpb: pct(0.002) },
    COMMODITY_OPTIONS: { sttBuyPpb: 0n, sttSellPpb: pct(0.05), exchangePpb: { MCX: pct(0.05) }, stampBuyPpb: pct(0.003) },
  },
};

/** Rates in force from 1 October 2024. */
const RATES_2024: RateSet = {
  effectiveFrom: '2024-10-01',
  label: 'From 1 Oct 2024',
  segments: {
    EQUITY_DELIVERY: { sttBuyPpb: pct(0.1), sttSellPpb: pct(0.1), exchangePpb: { NSE: pct(0.00297), BSE: pct(0.00375) }, stampBuyPpb: pct(0.015) },
    EQUITY_INTRADAY: { sttBuyPpb: 0n, sttSellPpb: pct(0.025), exchangePpb: { NSE: pct(0.00297), BSE: pct(0.00375) }, stampBuyPpb: pct(0.003) },
    EQUITY_FUTURES: { sttBuyPpb: 0n, sttSellPpb: pct(0.02), exchangePpb: { NFO: pct(0.00173), BFO: pct(0.00173) }, stampBuyPpb: pct(0.002) },
    INDEX_FUTURES: { sttBuyPpb: 0n, sttSellPpb: pct(0.02), exchangePpb: { NFO: pct(0.00173), BFO: pct(0.00173) }, stampBuyPpb: pct(0.002) },
    EQUITY_OPTIONS: { sttBuyPpb: 0n, sttSellPpb: pct(0.1), exchangePpb: { NFO: pct(0.03503), BFO: pct(0.0325) }, stampBuyPpb: pct(0.003) },
    INDEX_OPTIONS: { sttBuyPpb: 0n, sttSellPpb: pct(0.1), exchangePpb: { NFO: pct(0.03503), BFO: pct(0.0325) }, stampBuyPpb: pct(0.003) },
    CURRENCY_FUTURES: { sttBuyPpb: 0n, sttSellPpb: 0n, exchangePpb: { CDS: pct(0.00035), BCD: pct(0.00035) }, stampBuyPpb: pct(0.0001) },
    CURRENCY_OPTIONS: { sttBuyPpb: 0n, sttSellPpb: 0n, exchangePpb: { CDS: pct(0.0311), BCD: pct(0.001) }, stampBuyPpb: pct(0.0001) },
    COMMODITY_FUTURES: { sttBuyPpb: 0n, sttSellPpb: pct(0.01), exchangePpb: { MCX: pct(0.0021) }, stampBuyPpb: pct(0.002) },
    COMMODITY_OPTIONS: { sttBuyPpb: 0n, sttSellPpb: pct(0.05), exchangePpb: { MCX: pct(0.0418) }, stampBuyPpb: pct(0.003) },
  },
};

/** Newest first, so the first entry not after the trade date wins. */
export const RATE_SETS: RateSet[] = [RATES_2024, RATES_2023];

export function ratesOn(date: string): RateSet {
  return RATE_SETS.find((set) => set.effectiveFrom <= date) ?? RATES_2023;
}

/** The plan a discount broker charges when the user has configured nothing else. */
export const DEFAULT_BROKERAGE: Record<TradeSegment, BrokeragePlan> = {
  EQUITY_DELIVERY: { percent: '0', cap: null, flat: '0' },
  EQUITY_INTRADAY: { percent: '0.03', cap: '20', flat: '0' },
  EQUITY_FUTURES: { percent: '0.03', cap: '20', flat: '0' },
  INDEX_FUTURES: { percent: '0.03', cap: '20', flat: '0' },
  EQUITY_OPTIONS: { percent: '0', cap: null, flat: '20' },
  INDEX_OPTIONS: { percent: '0', cap: null, flat: '20' },
  CURRENCY_FUTURES: { percent: '0.03', cap: '20', flat: '0' },
  CURRENCY_OPTIONS: { percent: '0', cap: null, flat: '20' },
  COMMODITY_FUTURES: { percent: '0.03', cap: '20', flat: '0' },
  COMMODITY_OPTIONS: { percent: '0', cap: null, flat: '20' },
};

/**
 * The usual CDSL charge a broker passes on for each delivery sell, before GST. ₹13 plus 18%
 * is the ₹15.34 that appears on a Zerodha contract note.
 */
export const DEFAULT_DP_CHARGE = '13.00';

// ---- primitives ----

/** turnover × ppb ÷ 1e9, rounded to the paisa half away from zero. */
export function applyPpb(turnover: bigint, ppb: bigint): bigint {
  if (ppb === 0n || turnover === 0n) return 0n;
  const negative = turnover < 0n;
  const abs = (negative ? -turnover : turnover) * ppb;
  const value = (abs + 500_000_000n) / 1_000_000_000n;
  return roundToCents(negative ? -value : value);
}

function percentOf(amount: bigint, percent: string): bigint {
  return applyPpb(amount, (parseMoney(percent) * 10_000_000n) / 10_000n);
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Brokerage for one order's turnover under a plan. */
export function brokerageFor(turnover: bigint, plan: BrokeragePlan): bigint {
  const flat = parseMoney(plan.flat);
  const percentPart = percentOf(turnover, plan.percent);
  const raw = flat + percentPart;
  const cap = plan.cap === null ? null : parseMoney(plan.cap);
  return cap === null ? roundToCents(raw) : roundToCents(min(raw, cap));
}

export function planFor(settings: TradingSettingsRecord | null, broker: string, segment: TradeSegment): BrokeragePlan {
  const config = settings?.brokers.find((b) => b.broker.toLowerCase() === broker.toLowerCase());
  return config?.plans[segment] ?? DEFAULT_BROKERAGE[segment];
}

export function brokerConfigFor(settings: TradingSettingsRecord | null, broker: string): BrokerConfig | null {
  return settings?.brokers.find((b) => b.broker.toLowerCase() === broker.toLowerCase()) ?? null;
}

// ---- per-fill statutory charges ----

export interface FillInput {
  date: string;
  segment: TradeSegment;
  exchange: TradeExchange;
  side: 'BUY' | 'SELL';
  /** quantity × price, positive. */
  turnover: bigint;
  /** True for the buy leg of an option exercised in the money. */
  exercised?: boolean;
  /** Intrinsic value of an exercised option, when `exercised`. */
  intrinsicValue?: bigint;
}

export interface StatutoryCharges {
  stt: bigint;
  exchangeCharges: bigint;
  sebiCharges: bigint;
  stampDuty: bigint;
}

/** Everything the exchange and the government take on one fill. */
export function statutoryCharges(fill: FillInput): StatutoryCharges {
  const rates = ratesOn(fill.date).segments[fill.segment];
  const exchangePpb = rates.exchangePpb[fill.exchange] ?? Object.values(rates.exchangePpb)[0] ?? 0n;
  const stt = fill.exercised
    ? applyPpb(fill.intrinsicValue ?? 0n, EXERCISED_OPTION_STT_PPB)
    : applyPpb(fill.turnover, fill.side === 'BUY' ? rates.sttBuyPpb : rates.sttSellPpb);
  return {
    stt,
    exchangeCharges: applyPpb(fill.turnover, exchangePpb),
    sebiCharges: applyPpb(fill.turnover, SEBI_TURNOVER_PPB),
    stampDuty: fill.side === 'BUY' ? applyPpb(fill.turnover, rates.stampBuyPpb) : 0n,
  };
}

export function gstOn(brokerage: bigint, exchangeCharges: bigint, sebiCharges: bigint, dpCharges = 0n): bigint {
  return roundToCents(((brokerage + exchangeCharges + sebiCharges + dpCharges) * GST_PERCENT) / 100n);
}

// ---- whole-list estimation ----

/** A trade as the charges engine needs to see it. */
export interface ChargeableTrade {
  id: string;
  date: string;
  broker: string;
  segment: TradeSegment;
  exchange: TradeExchange;
  side: 'BUY' | 'SELL';
  amount: string;
  underlying: string;
  orderId: string | null;
  kind?: string;
}

/**
 * Estimates the full charge breakdown for each trade.
 *
 * Brokerage is worked out per order (fills of one order id on one day share it) and DP
 * charges per scrip per day on delivery sells, then both are allocated back to the fills in
 * proportion to turnover, so each trade carries its share and the totals still reconcile.
 */
export function estimateCharges(trades: ChargeableTrade[], settings: TradingSettingsRecord | null): Map<string, ChargeBreakdown> {
  const brokerageShare = allocateByOrder(trades, settings);
  const dpShare = allocateDpCharges(trades, settings);
  const result = new Map<string, ChargeBreakdown>();

  for (const trade of trades) {
    const turnover = parseMoney(trade.amount);
    const exercised = trade.kind === 'EXERCISE' || trade.kind === 'ASSIGNMENT';
    const statutory = statutoryCharges({
      date: trade.date,
      segment: trade.segment,
      exchange: trade.exchange,
      side: trade.side,
      turnover,
      exercised,
      intrinsicValue: exercised ? turnover : 0n,
    });
    const brokerage = brokerageShare.get(trade.id) ?? 0n;
    const dpCharges = dpShare.get(trade.id) ?? 0n;
    const gst = gstOn(brokerage, statutory.exchangeCharges, statutory.sebiCharges, dpCharges);
    const total = brokerage + statutory.stt + statutory.exchangeCharges + statutory.sebiCharges + statutory.stampDuty + gst + dpCharges;
    result.set(trade.id, {
      brokerage: formatMoney(brokerage),
      stt: formatMoney(statutory.stt),
      exchangeCharges: formatMoney(statutory.exchangeCharges),
      sebiCharges: formatMoney(statutory.sebiCharges),
      stampDuty: formatMoney(statutory.stampDuty),
      gst: formatMoney(gst),
      dpCharges: formatMoney(dpCharges),
      otherCharges: '0',
      total: formatMoney(total),
      source: 'ESTIMATED',
    });
  }
  return result;
}

function allocateByOrder(trades: ChargeableTrade[], settings: TradingSettingsRecord | null): Map<string, bigint> {
  const groups = new Map<string, ChargeableTrade[]>();
  for (const trade of trades) {
    // Without an order id every fill is its own order; that is the conservative reading.
    const key = [trade.date, trade.broker, trade.segment, trade.orderId ?? `fill:${trade.id}`].join('|');
    const group = groups.get(key);
    if (group) group.push(trade);
    else groups.set(key, [trade]);
  }
  const share = new Map<string, bigint>();
  for (const group of groups.values()) {
    const turnover = group.reduce((sum, t) => sum + parseMoney(t.amount), 0n);
    const brokerage = brokerageFor(turnover, planFor(settings, group[0].broker, group[0].segment));
    spread(group, turnover, brokerage, share);
  }
  return share;
}

function allocateDpCharges(trades: ChargeableTrade[], settings: TradingSettingsRecord | null): Map<string, bigint> {
  const groups = new Map<string, ChargeableTrade[]>();
  for (const trade of trades) {
    if (trade.segment !== 'EQUITY_DELIVERY' || trade.side !== 'SELL') continue;
    const key = [trade.date, trade.broker, trade.underlying].join('|');
    const group = groups.get(key);
    if (group) group.push(trade);
    else groups.set(key, [trade]);
  }
  const share = new Map<string, bigint>();
  for (const group of groups.values()) {
    const perScrip = parseMoney(brokerConfigFor(settings, group[0].broker)?.dpChargePerScrip ?? DEFAULT_DP_CHARGE);
    const turnover = group.reduce((sum, t) => sum + parseMoney(t.amount), 0n);
    spread(group, turnover, perScrip, share);
  }
  return share;
}

/** Splits `total` across `group` in proportion to turnover, giving any remainder to the first. */
function spread(group: ChargeableTrade[], turnover: bigint, total: bigint, into: Map<string, bigint>): void {
  if (group.length === 1 || turnover === 0n) {
    into.set(group[0].id, (into.get(group[0].id) ?? 0n) + total);
    for (const trade of group.slice(1)) into.set(trade.id, into.get(trade.id) ?? 0n);
    return;
  }
  let assigned = 0n;
  for (const trade of group.slice(1)) {
    const part = roundToCents((parseMoney(trade.amount) * total) / turnover);
    assigned += part;
    into.set(trade.id, (into.get(trade.id) ?? 0n) + part);
  }
  into.set(group[0].id, (into.get(group[0].id) ?? 0n) + (total - assigned));
}

// ---- reading and merging what the broker reported ----

/** Sums a breakdown's components; used when a file gives parts but not a total. */
export function sumBreakdown(parts: Partial<ChargeBreakdown>): bigint {
  const keys = ['brokerage', 'stt', 'exchangeCharges', 'sebiCharges', 'stampDuty', 'gst', 'dpCharges', 'otherCharges'] as const;
  return keys.reduce((sum, key) => sum + parseMoney(parts[key] ?? '0'), 0n);
}

/**
 * Combines an estimate with whatever the file stated. A component the broker reported wins;
 * the rest stay estimated, and the source says which situation the row is in.
 */
export function mergeCharges(estimated: ChargeBreakdown, reported: Partial<ChargeBreakdown> | null): ChargeBreakdown {
  if (!reported) return estimated;
  const keys = ['brokerage', 'stt', 'exchangeCharges', 'sebiCharges', 'stampDuty', 'gst', 'dpCharges', 'otherCharges'] as const;
  const merged: ChargeBreakdown = { ...estimated };
  let fromBroker = 0;
  for (const key of keys) {
    if (reported[key] !== undefined && reported[key] !== null) {
      merged[key] = formatMoney(parseMoney(reported[key]!));
      fromBroker += 1;
    }
  }
  // A stated grand total is authoritative even when the split is not given: it is the number
  // that actually left the account. Any gap is parked in "other" so the parts still add up.
  if (reported.total !== undefined && reported.total !== null) {
    const stated = parseMoney(reported.total);
    const parts = sumBreakdown({ ...merged, otherCharges: '0' });
    merged.otherCharges = formatMoney(stated - parts);
    merged.total = formatMoney(stated);
    fromBroker += 1;
  } else {
    merged.total = formatMoney(sumBreakdown(merged));
  }
  const source: ChargesSource = fromBroker === 0 ? 'ESTIMATED' : fromBroker >= keys.length + 1 ? 'BROKER' : 'MIXED';
  return { ...merged, source };
}

/** The charge total on a stored trade, whatever its source. */
export function chargesOf(trade: Pick<TradeRecord, 'totalCharges'>): bigint {
  return parseMoney(trade.totalCharges);
}

export function breakdownOf(trade: TradeRecord): ChargeBreakdown {
  return {
    brokerage: trade.brokerage,
    stt: trade.stt,
    exchangeCharges: trade.exchangeCharges,
    sebiCharges: trade.sebiCharges,
    stampDuty: trade.stampDuty,
    gst: trade.gst,
    dpCharges: trade.dpCharges,
    otherCharges: trade.otherCharges,
    total: trade.totalCharges,
    source: trade.chargesSource,
  };
}

/** Adds up breakdowns, keeping the weakest source so an estimate is never dressed up. */
export function addBreakdowns(parts: ChargeBreakdown[]): ChargeBreakdown {
  const keys = ['brokerage', 'stt', 'exchangeCharges', 'sebiCharges', 'stampDuty', 'gst', 'dpCharges', 'otherCharges', 'total'] as const;
  const totals: Record<string, bigint> = {};
  for (const key of keys) totals[key] = parts.reduce((sum, part) => sum + parseMoney(part[key]), 0n);
  const sources = new Set(parts.map((p) => p.source));
  const source: ChargesSource = sources.size === 0 ? 'ESTIMATED' : sources.size === 1 ? [...sources][0] : 'MIXED';
  return {
    brokerage: formatMoney(totals.brokerage),
    stt: formatMoney(totals.stt),
    exchangeCharges: formatMoney(totals.exchangeCharges),
    sebiCharges: formatMoney(totals.sebiCharges),
    stampDuty: formatMoney(totals.stampDuty),
    gst: formatMoney(totals.gst),
    dpCharges: formatMoney(totals.dpCharges),
    otherCharges: formatMoney(totals.otherCharges),
    total: formatMoney(totals.total),
    source,
  };
}

/** Scales a breakdown by fraction numerator/denominator, for allocating to a matched leg. */
export function scaleBreakdown(part: ChargeBreakdown, numerator: bigint, denominator: bigint): ChargeBreakdown {
  if (denominator === 0n) return { ...part, source: part.source };
  const scale = (value: string) => formatMoney(roundToCents((parseMoney(value) * numerator) / denominator));
  return {
    brokerage: scale(part.brokerage),
    stt: scale(part.stt),
    exchangeCharges: scale(part.exchangeCharges),
    sebiCharges: scale(part.sebiCharges),
    stampDuty: scale(part.stampDuty),
    gst: scale(part.gst),
    dpCharges: scale(part.dpCharges),
    otherCharges: scale(part.otherCharges),
    total: scale(part.total),
    source: part.source,
  };
}

/** Option premium paid or received, used for the option turnover figures in the tax view. */
export function optionPremium(trade: Pick<TradeRecord, 'segment' | 'amount'>): bigint {
  return isOptionSegment(trade.segment) ? parseMoney(trade.amount) : 0n;
}
