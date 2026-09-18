import type { AIProvider } from '@arvo/ai';
import { FinanceCore, type NewsDigestItem, type NewsHeadline } from '@arvo/finance-core';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../common/api-exception.filter';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AdvisorProviders } from '../advisor/advisor-providers';

/*
 * The news digest. Optional, AI-gated, and off unless the user turns it on.
 *
 * Three constraints shape it. It only ever looks at instruments the user holds or watches, so
 * it cannot become a discovery feed. It fetches only feed URLs the user supplied, through an
 * injectable fetcher that is absent in tests and refuses to run unless NEWS_DIGEST_ENABLED is
 * set. And the AI is told, in the prompt and again in the stored output, that it summarises
 * headlines and states no view on direction: with AI_PROVIDER=none the headlines are stored
 * with no summary at all rather than the feature quietly disappearing.
 */

export const NEWS_FETCHER = Symbol('NEWS_FETCHER');

/** Fetches one feed's raw XML. Injectable so tests never reach a network. */
export interface FeedFetcher {
  fetch(url: string): Promise<string>;
}

export const disabledFeedFetcher: FeedFetcher = {
  fetch: async () => {
    throw new Error('News fetching is turned off on this server (NEWS_DIGEST_ENABLED)');
  },
};

export function createFeedFetcher(enabled: boolean, fetcher: typeof fetch = fetch): FeedFetcher {
  if (!enabled) return disabledFeedFetcher;
  return {
    fetch: async (url) => {
      const response = await fetcher(url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`feed returned ${response.status}`);
      return response.text();
    },
  };
}

const NEWS_PROMPT = `You summarise financial news headlines for one instrument.

Rules, without exception:
- Summarise only what the supplied headlines say. Add nothing from memory.
- Never state or imply a view on direction, valuation, or whether to buy, sell or hold.
- Never give a target, a rating, or a recommendation.
- Two or three sentences, plain language, no adjectives of enthusiasm.
- If the headlines say nothing substantive, say so in one sentence.`;

const MAX_HEADLINES_PER_INSTRUMENT = 8;

@Injectable()
export class NewsService {
  private readonly logger = new Logger('markets');

  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(NEWS_FETCHER) private readonly fetcher: FeedFetcher,
    @Inject(AdvisorProviders) private readonly providers: AdvisorProviders,
  ) {}

  /** True when a digest could be produced at all: feeds configured and fetching allowed. */
  async status(userId: string) {
    const feeds = await this.core.markets.listFeeds(userId);
    const settings = await this.core.markets.settings(userId);
    return {
      fetchingEnabled: this.config.markets.newsEnabled,
      aiEnabled: this.config.ai.provider !== 'none',
      feeds: feeds.length,
      enabledFeeds: feeds.filter((feed) => feed.isEnabled).length,
      frequency: settings.newsDigestFrequency,
    };
  }

  /**
   * Builds one digest: fetch the user's feeds, keep only headlines that name something they
   * hold or watch, and summarise each instrument's headlines neutrally.
   */
  async build(userId: string, input: { periodStart: string; periodEnd: string }) {
    if (!this.config.markets.newsEnabled) {
      throw new ApiError(HttpStatus.CONFLICT, 'NEWS_DISABLED', 'News fetching is turned off on this server. Set NEWS_DIGEST_ENABLED=true to allow it.');
    }
    const feeds = (await this.core.markets.listFeeds(userId)).filter((feed) => feed.isEnabled);
    if (!feeds.length) throw new ApiError(HttpStatus.CONFLICT, 'NO_FEEDS', 'Add at least one RSS or Atom feed first');

    const followed = await this.core.markets.followedInstruments(userId);
    if (!followed.length) throw new ApiError(HttpStatus.CONFLICT, 'NOTHING_FOLLOWED', 'Add something to a watchlist or your portfolio first');

    const headlines: NewsHeadline[] = [];
    for (const feed of feeds) {
      try {
        const xml = await this.fetcher.fetch(feed.url);
        headlines.push(...parseFeed(xml, feed.title ?? feed.url));
        await this.core.markets.recordFeedFetch(userId, feed.id, { at: new Date(), error: null });
      } catch (error) {
        this.logger.warn({ msg: 'feed fetch failed', feed_id: feed.id, error: String(error) });
        await this.core.markets.recordFeedFetch(userId, feed.id, { at: new Date(), error: String(error).slice(0, 300) });
      }
    }

    const provider = await this.aiProvider(userId);

    const digestItems: NewsDigestItem[] = [];
    for (const instrument of followed) {
      const matches = headlines
        .filter((headline) => mentions(headline.title, instrument.symbol))
        .slice(0, MAX_HEADLINES_PER_INSTRUMENT);
      if (!matches.length) continue;
      digestItems.push({
        symbol: instrument.symbol,
        name: null,
        summary: provider ? await this.summarise(provider, instrument.symbol, matches) : 'AI is off, so the headlines below are listed without a summary.',
        headlines: matches,
      });
    }

    return this.core.markets.saveDigest(userId, {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      items: digestItems,
      provider: provider?.name ?? 'none',
    });
  }

  /** The user's AI provider, or null when AI is off — in which case nothing is summarised. */
  private async aiProvider(userId: string): Promise<AIProvider | null> {
    if (this.config.ai.provider === 'none') return null;
    const user = await this.providers.user(userId);
    return this.providers.choiceFor(user) ? this.providers.providerFor(user) : null;
  }

  private async summarise(provider: AIProvider, symbol: string, headlines: NewsHeadline[]) {
    let text = '';
    try {
      for await (const event of provider.chat({
        system: NEWS_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify({ symbol, headlines: headlines.map((h) => ({ title: h.title, source: h.source, publishedAt: h.publishedAt })) }) }],
        maxTokens: 250,
        signal: AbortSignal.timeout(30_000),
      })) {
        if (event.type === 'text') text += event.delta;
      }
    } catch (error) {
      this.logger.warn({ msg: 'news summary failed', symbol, error: String(error) });
    }
    return text.trim() || 'No summary was produced; the headlines are linked below.';
  }
}

/** A headline mentions an instrument when its symbol appears as a whole word. */
function mentions(title: string, symbol: string): boolean {
  return new RegExp(`(^|[^A-Z0-9])${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`, 'i').test(title);
}

/**
 * A deliberately small RSS/Atom reader.
 *
 * Feeds are XML in name only — half of them are hand-assembled strings with unescaped
 * ampersands — and pulling in a full parser to read four fields would be a dependency that
 * earns nothing. This takes title, link and date out of <item> and <entry> elements and stops
 * there; anything it cannot read is simply not a headline.
 */
export function parseFeed(xml: string, source: string): NewsHeadline[] {
  const headlines: NewsHeadline[] = [];
  const entries = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const entry of entries) {
    const title = text(entry, 'title');
    if (!title) continue;
    const link = text(entry, 'link') || /<link[^>]*href="([^"]+)"/i.exec(entry)?.[1] || '';
    const published = text(entry, 'pubDate') || text(entry, 'published') || text(entry, 'updated');
    const parsed = published ? Date.parse(published) : NaN;
    headlines.push({
      title,
      url: link,
      source,
      publishedAt: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
    });
  }
  return headlines;
}

function text(entry: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(entry);
  if (!match) return '';
  return match[1]!
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
