import { absMoney, formatMoney, parseMoney } from '../money';
import { daysUntil, weekStart } from './expiries';
import {
  MARKET_DEPENDENT_KINDS,
  type AlertEvaluation,
  type AlertRecord,
  type AlertStatus,
  type CorporateActionRecord,
  type ExpiryEvent,
} from './types';

/*
 * The alert engine.
 *
 * Every rule is answered from a snapshot the caller assembled, not from storage, so the whole
 * thing is one pure function per alert kind and the tests are fixtures rather than fixtures plus
 * a database. It also means the evidence written into the trigger history is exactly the data
 * the decision was made from: six months later, "why did this fire?" has an answer that does not
 * depend on re-running anything.
 *
 * Three rules hold for every kind:
 *
 *   1. An alert is a question, never a recommendation. The message says what is true, not what
 *      to do about it.
 *   2. A market-dependent alert never fires on data older than the user's staleness threshold.
 *      It records "skipped, stale data" instead, because a price alert answered from last
 *      Tuesday's close is worse than silence.
 *   3. Cooldown is evaluated here, not at the delivery edge, so a re-run of the scheduler over
 *      the same window is idempotent.
 */

/** A price the engine may use, with the age that decides whether it may use it. */
export interface QuoteSnapshot {
  symbol: string;
  price: string;
  previousClose: string | null;
  asOf: string;
  /** Minutes since this quote was written. */
  ageMinutes: number;
}

export interface HoldingSnapshot {
  id: string;
  name: string;
  value: string;
  costBasis: string;
  unrealisedGain: string;
  /** Gain as a percentage of cost; null when nothing was invested. */
  gainPercent: string | null;
  /** True when the value rests on a price older than the staleness threshold. */
  isStale: boolean;
}

export interface RecurringSnapshot {
  id: string;
  label: string;
  /** When the next debit was expected, YYYY-MM-DD. */
  expectedOn: string;
  lastSeenOn: string | null;
}

export interface OptionPositionSnapshot {
  id: string;
  label: string;
  /** Net delta in units of the underlying, signed. */
  delta: string;
  expiry: string | null;
  underlying: string;
}

/** Everything the engine is allowed to look at, assembled once per evaluation run. */
export interface AlertContext {
  now: Date;
  today: string;
  currency: string;
  staleQuoteMinutes: number;
  quotes: Map<string, QuoteSnapshot>;
  /** Portfolio value now and the highest it has been, for drawdown. */
  portfolio: { value: string; peak: string; peakOn: string | null; isStale: boolean } | null;
  holdings: Map<string, HoldingSnapshot>;
  recurring: RecurringSnapshot[];
  optionPositions: OptionPositionSnapshot[];
  /** Realised net P&L per day, from the trading journal. */
  realisedByDay: Map<string, string>;
  /** Number of trades closed or opened per day. */
  tradeCountByDay: Map<string, number>;
  /** Expiries of contracts the user actually has open. */
  openExpiries: { underlying: string; expiry: string; label: string }[];
  /** Computed index expiries, for the calendar-driven alert. */
  expiries: ExpiryEvent[];
  corporateActions: CorporateActionRecord[];
  /** Symbols the user holds or watches, upper-cased. */
  followed: Set<string>;
}

const quoteKey = (symbol: string): string => symbol.trim().toUpperCase();

const percent = (numerator: bigint, denominator: bigint): string => {
  if (denominator === 0n) return '0';
  return formatMoney((numerator * 1_000_000n) / denominator);
};

const skip = (alert: AlertRecord, message: string, status: AlertStatus, evidence: Record<string, unknown> = {}): AlertEvaluation => ({
  alertId: alert.id,
  name: alert.name,
  kind: alert.kind,
  status,
  fired: false,
  message,
  evidence,
});

const fire = (alert: AlertRecord, message: string, evidence: Record<string, unknown>): AlertEvaluation => ({
  alertId: alert.id,
  name: alert.name,
  kind: alert.kind,
  status: 'TRIGGERED',
  fired: true,
  message,
  evidence,
});

/** True when the alert fired recently enough that firing again would be noise. */
export function inCooldown(alert: AlertRecord, now: Date): boolean {
  if (!alert.lastTriggeredAt) return false;
  return now.getTime() - alert.lastTriggeredAt.getTime() < alert.cooldownMinutes * 60_000;
}

/**
 * Answers one alert. Never throws for data reasons: a rule pointing at a holding that has since
 * been deleted records "skipped" rather than failing the whole run.
 */
export function evaluateAlert(alert: AlertRecord, ctx: AlertContext): AlertEvaluation {
  if (!alert.isEnabled) return skip(alert, 'Alert is off', 'OK');
  if (inCooldown(alert, ctx.now)) return skip(alert, 'Still inside its cooldown window', 'COOLING_DOWN');

  const params = alert.params;
  switch (params.kind) {
    case 'PRICE_LEVEL': {
      const quote = ctx.quotes.get(quoteKey(params.symbol));
      if (!quote) return skip(alert, `No price known for ${params.symbol}`, 'SKIPPED_STALE', { symbol: params.symbol });
      if (quote.ageMinutes > ctx.staleQuoteMinutes) {
        return skip(alert, `Skipped: the price for ${params.symbol} is stale (as of ${quote.asOf})`, 'SKIPPED_STALE', {
          symbol: params.symbol,
          asOf: quote.asOf,
          ageMinutes: quote.ageMinutes,
          staleAfterMinutes: ctx.staleQuoteMinutes,
        });
      }
      const price = parseMoney(quote.price);
      const level = parseMoney(params.level);
      const crossed = params.direction === 'ABOVE' ? price >= level : price <= level;
      const evidence = { symbol: params.symbol, price: quote.price, level: params.level, direction: params.direction, asOf: quote.asOf };
      if (!crossed) return skip(alert, `${params.symbol} is ${quote.price}, ${params.direction === 'ABOVE' ? 'below' : 'above'} ${params.level}`, 'OK', evidence);
      return fire(alert, `${params.symbol} is ${quote.price}, ${params.direction === 'ABOVE' ? 'at or above' : 'at or below'} ${params.level} (as of ${quote.asOf})`, evidence);
    }

    case 'PORTFOLIO_DRAWDOWN': {
      const snapshot = ctx.portfolio;
      if (!snapshot) return skip(alert, 'No portfolio value yet', 'OK');
      if (snapshot.isStale) {
        return skip(alert, 'Skipped: the portfolio is valued on stale prices', 'SKIPPED_STALE', { staleAfterMinutes: ctx.staleQuoteMinutes });
      }
      const peak = parseMoney(snapshot.peak);
      const value = parseMoney(snapshot.value);
      if (peak <= 0n) return skip(alert, 'No peak value to measure against', 'OK');
      const drop = peak - value;
      const dropPercent = percent(drop, peak);
      const evidence = { value: snapshot.value, peak: snapshot.peak, peakOn: snapshot.peakOn, drawdownPercent: dropPercent, limitPercent: params.percent };
      if (drop <= 0n || parseMoney(dropPercent) < parseMoney(params.percent)) {
        return skip(alert, `Portfolio is ${dropPercent}% below its peak, inside the ${params.percent}% limit`, 'OK', evidence);
      }
      return fire(alert, `Portfolio is ${dropPercent}% below its peak of ${snapshot.peak}, beyond the ${params.percent}% you set`, evidence);
    }

    case 'HOLDING_PNL': {
      const holding = ctx.holdings.get(params.holdingId);
      if (!holding) return skip(alert, 'That holding no longer exists', 'OK', { holdingId: params.holdingId });
      if (holding.isStale) {
        return skip(alert, `Skipped: ${holding.name} is valued on a stale price`, 'SKIPPED_STALE', { holdingId: holding.id });
      }
      const actual = params.mode === 'PERCENT' ? holding.gainPercent : holding.unrealisedGain;
      if (actual === null) return skip(alert, `${holding.name} has no cost basis to measure against`, 'OK', { holdingId: holding.id });
      const value = parseMoney(actual);
      const threshold = parseMoney(params.value);
      const crossed = params.direction === 'ABOVE' ? value >= threshold : value <= threshold;
      const unit = params.mode === 'PERCENT' ? '%' : ` ${ctx.currency}`;
      const evidence = {
        holdingId: holding.id,
        name: holding.name,
        mode: params.mode,
        actual,
        threshold: params.value,
        unrealisedGain: holding.unrealisedGain,
        gainPercent: holding.gainPercent,
      };
      if (!crossed) return skip(alert, `${holding.name} is at ${actual}${unit}`, 'OK', evidence);
      return fire(alert, `${holding.name} is at ${actual}${unit}, ${params.direction === 'ABOVE' ? 'at or above' : 'at or below'} ${params.value}${unit}`, evidence);
    }

    case 'SIP_MISSED': {
      const candidates = params.seriesId ? ctx.recurring.filter((series) => series.id === params.seriesId) : ctx.recurring;
      const overdue = candidates.filter((series) => daysUntil(series.expectedOn, ctx.today) > params.graceDays);
      if (!overdue.length) return skip(alert, 'Every expected debit has been seen', 'OK', { watched: candidates.length });
      const worst = overdue.reduce((a, b) => (daysUntil(a.expectedOn, ctx.today) >= daysUntil(b.expectedOn, ctx.today) ? a : b));
      const late = daysUntil(worst.expectedOn, ctx.today);
      return fire(alert, `${worst.label} was expected on ${worst.expectedOn} and has not been seen for ${late} days`, {
        series: overdue.map((s) => ({ id: s.id, label: s.label, expectedOn: s.expectedOn, lastSeenOn: s.lastSeenOn })),
        graceDays: params.graceDays,
      });
    }

    case 'OPTION_DELTA': {
      const positions = params.positionId ? ctx.optionPositions.filter((p) => p.id === params.positionId) : ctx.optionPositions;
      if (!positions.length) return skip(alert, 'No open option positions', 'OK');
      const limit = parseMoney(params.maxAbsDelta);
      const breached = positions.filter((p) => absMoney(parseMoney(p.delta)) > limit);
      const evidence = {
        limit: params.maxAbsDelta,
        spot: params.spot,
        impliedVolatilityPercent: params.impliedVolatilityPercent,
        positions: positions.map((p) => ({ id: p.id, label: p.label, delta: p.delta })),
      };
      if (!breached.length) return skip(alert, `Every open option position is inside ±${params.maxAbsDelta} delta`, 'OK', evidence);
      const worst = breached.reduce((a, b) => (absMoney(parseMoney(a.delta)) >= absMoney(parseMoney(b.delta)) ? a : b));
      return fire(alert, `${worst.label} has a delta of ${worst.delta}, beyond the ±${params.maxAbsDelta} you set`, evidence);
    }

    case 'REALISED_LOSS_LIMIT': {
      const from = params.window === 'DAY' ? ctx.today : weekStart(ctx.today);
      let total = 0n;
      const days: { date: string; net: string }[] = [];
      for (const [date, net] of ctx.realisedByDay) {
        if (date < from || date > ctx.today) continue;
        total += parseMoney(net);
        days.push({ date, net });
      }
      const limit = parseMoney(params.amount);
      const loss = total < 0n ? -total : 0n;
      const evidence = { window: params.window, from, to: ctx.today, realised: formatMoney(total), limit: params.amount, days };
      if (loss < limit) return skip(alert, `Realised ${formatMoney(total)} so far this ${params.window.toLowerCase()}`, 'OK', evidence);
      return fire(alert, `Realised losses this ${params.window.toLowerCase()} are ${formatMoney(loss)}, at or beyond your ${params.amount} limit`, evidence);
    }

    case 'TRADE_COUNT': {
      const count = ctx.tradeCountByDay.get(ctx.today) ?? 0;
      const evidence = { date: ctx.today, count, limit: params.count };
      if (count <= params.count) return skip(alert, `${count} trades so far today`, 'OK', evidence);
      return fire(alert, `${count} trades today, above the ${params.count} you set`, evidence);
    }

    case 'EXPIRY_UPCOMING': {
      const due = ctx.openExpiries.filter((p) => {
        const days = daysUntil(ctx.today, p.expiry);
        return days >= 0 && days <= params.daysBefore;
      });
      if (!due.length) return skip(alert, `No open F&O position expires within ${params.daysBefore} days`, 'OK');
      const soonest = due.reduce((a, b) => (a.expiry <= b.expiry ? a : b));
      return fire(alert, `${soonest.label} expires on ${soonest.expiry}, in ${daysUntil(ctx.today, soonest.expiry)} days`, {
        daysBefore: params.daysBefore,
        positions: due,
      });
    }

    case 'CORPORATE_ACTION': {
      const due = ctx.corporateActions.filter((action) => {
        if (!ctx.followed.has(action.symbol.toUpperCase())) return false;
        const days = daysUntil(ctx.today, action.exDate);
        return days >= 0 && days <= params.daysBefore;
      });
      if (!due.length) return skip(alert, `No corporate action within ${params.daysBefore} days`, 'OK');
      const soonest = due.reduce((a, b) => (a.exDate <= b.exDate ? a : b));
      return fire(alert, `${soonest.symbol} goes ex-${soonest.kind.toLowerCase()} on ${soonest.exDate}`, {
        daysBefore: params.daysBefore,
        actions: due.map((a) => ({ symbol: a.symbol, kind: a.kind, exDate: a.exDate, amount: a.amount, ratio: a.ratio })),
      });
    }
  }
}

/** True when this kind refuses to answer from old prices. */
export function isMarketDependent(kind: AlertRecord['kind']): boolean {
  return MARKET_DEPENDENT_KINDS.includes(kind);
}

/**
 * The plain-language sentence shown under the alert form, so the user can check the rule
 * without reading the parameters back as a form. Deliberately duplicated on the client for
 * live preview; this copy is the one that goes into emails and the notification centre.
 */
export function describeAlert(name: string, params: AlertRecord['params'], repeats: boolean): string {
  const once = repeats ? 'Notify me whenever' : 'Notify me once if';
  switch (params.kind) {
    case 'PRICE_LEVEL':
      return `${once} ${params.symbol} trades ${params.direction === 'ABOVE' ? 'at or above' : 'at or below'} ${params.level}.`;
    case 'PORTFOLIO_DRAWDOWN':
      return `${once} my portfolio falls more than ${params.percent}% below its peak.`;
    case 'HOLDING_PNL':
      return `${once} this holding's unrealised P&L is ${params.direction === 'ABOVE' ? 'at or above' : 'at or below'} ${params.value}${params.mode === 'PERCENT' ? '%' : ''}.`;
    case 'SIP_MISSED':
      return `${once} ${params.label ?? 'a recurring debit'} has not been seen within ${params.graceDays} days of the date it was expected.`;
    case 'OPTION_DELTA':
      return `${once} an open option position's delta goes beyond ±${params.maxAbsDelta}.`;
    case 'REALISED_LOSS_LIMIT':
      return `${once} my realised losses this ${params.window.toLowerCase()} reach ${params.amount}.`;
    case 'TRADE_COUNT':
      return `${once} I place more than ${params.count} trades in a day.`;
    case 'EXPIRY_UPCOMING':
      return `${once} an open F&O position expires within ${params.daysBefore} days.`;
    case 'CORPORATE_ACTION':
      return `${once} a holding or watched instrument has a corporate action within ${params.daysBefore} days.`;
    default:
      return name;
  }
}
