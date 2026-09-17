import { TransactionType } from '@arvo/types';
import { absMoney, formatMoney, parseMoney, scaleToCents, type MoneyUnits } from '../money';
import type { FinanceStore } from '../ports';
import { AnalyticsService } from '../services/analytics.service';
import { requireCurrency, requireDate } from '../services/validation';
import { InsightsService, monthRange, shiftMonth } from './insights.service';

/*
 * Spending patterns for the Insights page: daily totals, month burn-up, weekday rhythm, purchase
 * size bands, a month waterfall and upcoming recurring charges. All sums are exact.
 * "Spending" here means EXPENSE and FEE outflows (refunds and transfers are excluded).
 */

export interface DailySpend {
  date: string;
  spent: string;
  count: number;
}

export interface BurnUpPoint {
  day: number;
  /** Cumulative spend this month up to this day; null for days not reached yet. */
  thisMonth: string | null;
  lastMonth: string | null;
  /** Average cumulative spend of the previous three full months at this day. */
  average: string;
}

export interface WeekdaySpend {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  total: string;
  /** Average spend per occurrence of this weekday in the window. */
  average: string;
  count: number;
}

export interface SizeBand {
  label: string;
  /** Inclusive lower bound, exclusive upper bound (null = no upper bound). */
  min: string;
  max: string | null;
  count: number;
  total: string;
}

export interface WaterfallStep {
  label: string;
  kind: 'income' | 'category' | 'other' | 'remaining';
  amount: string;
}

export interface UpcomingCharge {
  label: string;
  amount: string;
  date: string;
  frequency: string;
  priceIncreased: boolean;
}

export interface SpendingPatterns {
  currency: string;
  asOf: string;
  month: string;
  daily: DailySpend[];
  burnUp: BurnUpPoint[];
  weekdays: WeekdaySpend[];
  sizeBands: SizeBand[];
  waterfall: WaterfallStep[];
  upcoming: UpcomingCharge[];
  totals: { windowDays: number; spent: string; transactions: number; averagePerDay: string; busiestDay: DailySpend | null };
}

const SPENDING = [TransactionType.EXPENSE, TransactionType.FEE];
const WINDOW_DAYS = 84;
const BANDS: [string, string | null][] = [
  ['0', '100'],
  ['100', '500'],
  ['500', '2000'],
  ['2000', '10000'],
  ['10000', null],
];
const DAY_MS = 86_400_000;
const toDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const addDays = (date: string, days: number) => new Date((toDay(date) + days) * DAY_MS).toISOString().slice(0, 10);

export class PatternsService {
  private readonly analytics: AnalyticsService;
  private readonly insights: InsightsService;

  constructor(private readonly store: FinanceStore) {
    this.analytics = new AnalyticsService(store);
    this.insights = new InsightsService(store);
  }

  async patterns(userId: string, input: { currency: string; asOf: string }): Promise<SpendingPatterns> {
    const currency = requireCurrency(input.currency);
    const asOf = requireDate('asOf', input.asOf);
    const month = asOf.slice(0, 7);
    const windowFrom = addDays(asOf, -(WINDOW_DAYS - 1));
    const historyFrom = monthRange(shiftMonth(month, -3)).from;
    const earliest = windowFrom < historyFrom ? windowFrom : historyFrom;

    const [transactions, summary, recurring] = await Promise.all([
      this.store.transactions.findInPeriod(userId, { from: earliest, to: asOf, currency, types: SPENDING }),
      this.analytics.summary(userId, { from: monthRange(month).from, to: asOf, currency }),
      this.insights.recurring(userId, { currency, asOf }),
    ]);

    // Daily totals across everything fetched; outflows only.
    const perDay = new Map<string, { spent: MoneyUnits; count: number }>();
    for (const t of transactions) {
      const amount = parseMoney(t.amount);
      if (amount >= 0n) continue;
      const entry = perDay.get(t.date) ?? { spent: 0n, count: 0 };
      entry.spent += -amount;
      entry.count += 1;
      perDay.set(t.date, entry);
    }
    const dayValue = (date: string) => perDay.get(date) ?? { spent: 0n, count: 0 };

    // 1. Daily series for the heatmap window (every day, zeros included).
    const daily: DailySpend[] = [];
    let windowSpent = 0n;
    let windowCount = 0;
    let busiest: DailySpend | null = null;
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const date = addDays(windowFrom, i);
      const v = dayValue(date);
      const point = { date, spent: formatMoney(v.spent), count: v.count };
      daily.push(point);
      windowSpent += v.spent;
      windowCount += v.count;
      if (v.spent > 0n && (!busiest || v.spent > parseMoney(busiest.spent))) busiest = point;
    }

    // 2. Burn-up: cumulative spend by day of month.
    const cumulative = (monthKey: string, uptoDay: number): (MoneyUnits | null)[] => {
      const days = Number(monthRange(monthKey).to.slice(8, 10));
      const values: (MoneyUnits | null)[] = [];
      let running = 0n;
      for (let d = 1; d <= 31; d++) {
        if (d > days || d > uptoDay) {
          values.push(d > days ? (values.at(-1) ?? 0n) : null);
          continue;
        }
        running += dayValue(`${monthKey}-${String(d).padStart(2, '0')}`).spent;
        values.push(running);
      }
      return values;
    };
    const today = Number(asOf.slice(8, 10));
    const daysThisMonth = Number(monthRange(month).to.slice(8, 10));
    const current = cumulative(month, today);
    const previous = cumulative(shiftMonth(month, -1), 31);
    const history = [1, 2, 3].map((i) => cumulative(shiftMonth(month, -i), 31));
    const burnUp: BurnUpPoint[] = [];
    for (let d = 1; d <= daysThisMonth; d++) {
      const avg = scaleToCents(history.reduce((sum, series) => sum + (series[d - 1] ?? 0n), 0n), 1n, 3n);
      burnUp.push({
        day: d,
        thisMonth: current[d - 1] === null ? null : formatMoney(current[d - 1]!),
        lastMonth: formatMoney(previous[d - 1] ?? 0n),
        average: formatMoney(avg),
      });
    }

    // 3. Weekday rhythm over the heatmap window.
    const weekdayTotals = Array.from({ length: 7 }, () => ({ total: 0n, count: 0, occurrences: 0 }));
    for (const point of daily) {
      const weekday = new Date(`${point.date}T00:00:00Z`).getUTCDay();
      weekdayTotals[weekday].total += parseMoney(point.spent);
      weekdayTotals[weekday].count += point.count;
      weekdayTotals[weekday].occurrences += 1;
    }
    const weekdays: WeekdaySpend[] = weekdayTotals.map((w, weekday) => ({
      weekday,
      total: formatMoney(w.total),
      average: formatMoney(scaleToCents(w.total, 1n, BigInt(Math.max(1, w.occurrences)))),
      count: w.count,
    }));

    // 4. Purchase size bands over the window.
    const bands = BANDS.map(([min, max]) => ({ min: parseMoney(min), max: max === null ? null : parseMoney(max), count: 0, total: 0n }));
    for (const t of transactions) {
      if (t.date < windowFrom || t.type !== TransactionType.EXPENSE) continue;
      const amount = absMoney(parseMoney(t.amount));
      if (parseMoney(t.amount) >= 0n) continue;
      const band = bands.find((b) => amount >= b.min && (b.max === null || amount < b.max));
      if (band) {
        band.count += 1;
        band.total += amount;
      }
    }
    const sizeBands: SizeBand[] = bands.map((b, i) => ({
      label: BANDS[i][1] === null ? `${BANDS[i][0]}+` : `${BANDS[i][0]}–${BANDS[i][1]}`,
      min: formatMoney(b.min),
      max: b.max === null ? null : formatMoney(b.max),
      count: b.count,
      total: formatMoney(b.total),
    }));

    // 5. Waterfall for the month so far: income → top categories → other → remaining.
    const income = parseMoney(summary.income);
    const categories = summary.spendingByTopCategory.filter((c) => parseMoney(c.amount) > 0n);
    const top = categories.slice(0, 5);
    const other = categories.slice(5).reduce((sum, c) => sum + parseMoney(c.amount), 0n);
    const waterfall: WaterfallStep[] = [
      { label: 'Income', kind: 'income', amount: formatMoney(income) },
      ...top.map((c) => ({ label: c.name, kind: 'category' as const, amount: c.amount })),
      ...(other > 0n ? [{ label: 'Everything else', kind: 'other' as const, amount: formatMoney(other) }] : []),
      { label: 'Left over', kind: 'remaining', amount: summary.netCashflow },
    ];

    // 6. Recurring charges expected in the next 30 days.
    const horizon = addDays(asOf, 30);
    const upcoming: UpcomingCharge[] = recurring.series
      .filter((s) => s.status === 'ACTIVE' && !s.isDismissed && s.nextExpected > asOf && s.nextExpected <= horizon)
      .sort((a, b) => a.nextExpected.localeCompare(b.nextExpected) || a.label.localeCompare(b.label, 'en'))
      .map((s) => ({ label: s.label, amount: s.expectedAmount, date: s.nextExpected, frequency: s.frequency, priceIncreased: s.priceIncreased }));

    return {
      currency,
      asOf,
      month,
      daily,
      burnUp,
      weekdays,
      sizeBands,
      waterfall,
      upcoming,
      totals: {
        windowDays: WINDOW_DAYS,
        spent: formatMoney(windowSpent),
        transactions: windowCount,
        averagePerDay: formatMoney(scaleToCents(windowSpent, 1n, BigInt(WINDOW_DAYS))),
        busiestDay: busiest,
      },
    };
  }
}
