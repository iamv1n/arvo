import { formatMoney, parseMoney, manualQuoteProvider, type QuoteProvider, type QuoteTick } from '@arvo/finance-core';
import { Logger } from '@nestjs/common';
import type { MarketsConfig } from '../config/app-config';

/*
 * The optional HTTP quote driver.
 *
 * Arvo does not ship a market data provider and does not want to become one. What people
 * actually have is a broker API key, or a free quote endpoint, or a script of their own behind
 * a URL — so this driver is deliberately shapeless: a base URL, an API key, and a small JSON
 * map saying which fields of the response hold the price, the previous close and the date.
 *
 * Nothing is constructed unless MARKET_DATA_DRIVER=http, which means there is no code path from
 * a default install, or from any test, to a network call. Failures throw and the service above
 * degrades to the last known price; a wrong answer would be worse than an old one.
 */

/** `a.b.c` into a nested object, tolerating arrays by numeric index. */
function pluck(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

function asMoney(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'number' ? String(value) : String(value).trim();
  if (!text) return null;
  try {
    return formatMoney(parseMoney(text));
  } catch {
    return null;
  }
}

function asDate(value: unknown, fallback: string): string {
  if (typeof value === 'number') return new Date(value > 1e11 ? value : value * 1000).toISOString().slice(0, 10);
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Builds the configured provider, or the manual one that returns nothing.
 *
 * The URL is templated: `{symbol}` and `{exchange}` are substituted, and when the template
 * contains neither, symbols are appended as a repeated `symbols` query parameter so a batch
 * endpoint works too.
 */
export function createQuoteProvider(config: MarketsConfig, fetcher: typeof fetch = fetch): QuoteProvider {
  if (config.quoteDriver !== 'http' || !config.quoteBaseUrl) return manualQuoteProvider;
  const logger = new Logger('markets');
  const map = config.quoteFieldMap;
  const base = config.quoteBaseUrl;
  const perSymbol = base.includes('{symbol}');

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.quoteApiKey) {
    headers.Authorization = `Bearer ${config.quoteApiKey}`;
    headers['X-Api-Key'] = config.quoteApiKey;
  }

  const readTick = (symbol: string, payload: unknown, today: string): QuoteTick | null => {
    const price = asMoney(pluck(payload, map.price ?? 'price'));
    if (!price) return null;
    return {
      symbol,
      price,
      previousClose: asMoney(pluck(payload, map.previousClose ?? 'previousClose')),
      asOf: asDate(pluck(payload, map.asOf ?? 'asOf'), today),
    };
  };

  return {
    driver: 'http',
    quotes: async (instruments) => {
      const today = new Date().toISOString().slice(0, 10);
      const ticks: QuoteTick[] = [];
      const request = async (url: string): Promise<unknown> => {
        const response = await fetcher(url, { headers, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`quote provider returned ${response.status}`);
        return response.json();
      };

      if (perSymbol) {
        // One call per instrument, in sequence: a watchlist is tens of rows, not thousands, and
        // a burst of parallel requests is the fastest way to get rate-limited by a free API.
        for (const instrument of instruments) {
          const url = base.replaceAll('{symbol}', encodeURIComponent(instrument.symbol)).replaceAll('{exchange}', encodeURIComponent(instrument.exchange ?? ''));
          try {
            const payload = await request(url);
            const root = map.root ? pluck(payload, map.root) : payload;
            const scoped = root && typeof root === 'object' && instrument.symbol in (root as Record<string, unknown>) ? (root as Record<string, unknown>)[instrument.symbol] : root;
            const tick = readTick(instrument.symbol, scoped, today);
            if (tick) ticks.push(tick);
          } catch (error) {
            logger.warn({ msg: 'quote fetch failed', symbol: instrument.symbol, error: String(error) });
          }
        }
        if (!ticks.length && instruments.length) throw new Error('the quote provider answered nothing usable');
        return ticks;
      }

      const url = new URL(base);
      for (const instrument of instruments) url.searchParams.append('symbols', instrument.symbol);
      const payload = await request(url.toString());
      const root = map.root ? pluck(payload, map.root) : payload;
      if (Array.isArray(root)) {
        for (const entry of root) {
          const symbol = String(pluck(entry, map.symbol ?? 'symbol') ?? '').toUpperCase();
          const tick = symbol ? readTick(symbol, entry, today) : null;
          if (tick) ticks.push(tick);
        }
      } else if (root && typeof root === 'object') {
        for (const [symbol, entry] of Object.entries(root as Record<string, unknown>)) {
          const tick = readTick(symbol.toUpperCase(), entry, today);
          if (tick) ticks.push(tick);
        }
      }
      return ticks;
    },
  };
}
