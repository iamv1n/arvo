import type { TransactionType } from '@arvo/types';
import type { CategorizationSource } from '../imports/types';
import { absMoney, parseMoney } from '../money';
import { normalizeText } from '../normalize';
import type { MerchantRecord } from '../records';
import type { RuleActions, RuleCondition, RuleRecord } from './types';

/** Letters-only pattern key used for historical matching. Mirrored in SQL by the database layer. */
export function descriptionPatternKey(description: string): string {
  return description.toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
}

/** Deterministic evaluation order: priority, then creation time, then id. */
export function sortRules(rules: RuleRecord[]): RuleRecord[] {
  return [...rules].sort(
    (a, b) =>
      a.priority - b.priority ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface RuleSubject {
  description: string;
  merchantName: string | null;
  amount: string;
}

export function ruleMatches(conditions: RuleCondition[], subject: RuleSubject): boolean {
  if (conditions.length === 0) return false;
  return conditions.every((condition) => conditionMatches(condition, subject));
}

function conditionMatches(condition: RuleCondition, subject: RuleSubject): boolean {
  switch (condition.field) {
    case 'description':
    case 'merchant': {
      const haystack = normalizeText(condition.field === 'description' ? subject.description : (subject.merchantName ?? ''));
      const needle = normalizeText(condition.value);
      if (!needle || !haystack) return false;
      if (condition.operator === 'contains') return haystack.includes(needle);
      if (condition.operator === 'equals') return haystack === needle;
      if (condition.operator === 'starts_with') return haystack.startsWith(needle);
      return false;
    }
    case 'amount': {
      const amount = absMoney(parseMoney(subject.amount));
      const limit = parseMoney(condition.value);
      if (condition.operator === 'gte') return amount >= limit;
      if (condition.operator === 'lte') return amount <= limit;
      if (condition.operator === 'equals') return amount === limit;
      return false;
    }
    case 'direction': {
      const direction = parseMoney(subject.amount) >= 0n ? 'IN' : 'OUT';
      return condition.operator === 'equals' && condition.value.toUpperCase() === direction;
    }
  }
}

export interface CategorizationContext {
  /** Active rules; sorted by the categorizer. */
  rules: RuleRecord[];
  merchants: MerchantRecord[];
  /** merchantId → most used categoryId. */
  merchantCategory: Map<string, string>;
  /** description pattern key → most used categoryId. */
  historyCategory: Map<string, string>;
}

export interface CategorizationResult {
  categoryId: string | null;
  merchantName: string | null;
  type: TransactionType | null;
  source: CategorizationSource | null;
  ruleId: string | null;
}

/**
 * Categorization priority: user rule → known merchant → historical pattern → uncategorized.
 * (AI classification slots in after history.) Merchant detection finds the longest known
 * merchant name appearing as whole words in the description.
 */
export function categorize(subject: Omit<RuleSubject, 'merchantName'>, ctx: CategorizationContext): CategorizationResult {
  const merchant = detectMerchant(subject.description, ctx.merchants);
  let merchantName = merchant?.name ?? null;
  const result: CategorizationResult = { categoryId: null, merchantName, type: null, source: null, ruleId: null };

  for (const rule of sortRules(ctx.rules.filter((r) => r.isActive))) {
    if (!ruleMatches(rule.conditions, { ...subject, merchantName })) continue;
    const actions: RuleActions = rule.actions;
    if (actions.merchantName) merchantName = actions.merchantName;
    return {
      categoryId: actions.categoryId ?? null,
      merchantName,
      type: actions.type ?? null,
      source: 'RULE',
      ruleId: rule.id,
    };
  }

  const merchantCategory = merchant ? ctx.merchantCategory.get(merchant.id) : undefined;
  if (merchantCategory) return { ...result, categoryId: merchantCategory, source: 'MERCHANT' };

  const historyCategory = ctx.historyCategory.get(descriptionPatternKey(subject.description));
  if (historyCategory) return { ...result, categoryId: historyCategory, source: 'HISTORY' };

  return result;
}

export function detectMerchant(description: string, merchants: MerchantRecord[]): MerchantRecord | null {
  const text = ` ${normalizeText(description)} `;
  let best: MerchantRecord | null = null;
  for (const merchant of merchants) {
    if (!merchant.normalizedName) continue;
    if (!text.includes(` ${merchant.normalizedName} `)) continue;
    if (
      !best ||
      merchant.normalizedName.length > best.normalizedName.length ||
      (merchant.normalizedName.length === best.normalizedName.length && merchant.normalizedName < best.normalizedName)
    ) {
      best = merchant;
    }
  }
  return best;
}

/** Most frequent category per key; ties resolve to the smallest categoryId. */
export function mostFrequent<K>(stats: { key: K; categoryId: string; count: number }[]): Map<K, string> {
  const best = new Map<K, { categoryId: string; count: number }>();
  for (const s of stats) {
    const current = best.get(s.key);
    if (!current || s.count > current.count || (s.count === current.count && s.categoryId < current.categoryId)) {
      best.set(s.key, { categoryId: s.categoryId, count: s.count });
    }
  }
  return new Map([...best].map(([k, v]) => [k, v.categoryId]));
}
