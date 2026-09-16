import { CategoryType, TransactionType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';
import { categorize, detectMerchant, mostFrequent, ruleMatches, sortRules } from './categorizer';
import type { RuleRecord } from './types';

const rule = (overrides: Partial<RuleRecord>): RuleRecord => ({
  id: 'r', userId: USER_A, name: 'r', priority: 10, isActive: true, conditions: [], actions: {},
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...overrides,
});

describe('categorizer', () => {
  it('matches normalized text, amount ranges and direction', () => {
    const subject = { description: 'UPI/Swiggy*Order 88', merchantName: null, amount: '-649.50' };
    expect(ruleMatches([{ field: 'description', operator: 'contains', value: 'swiggy order' }], subject)).toBe(true);
    expect(ruleMatches([{ field: 'description', operator: 'starts_with', value: 'upi' }], subject)).toBe(true);
    expect(ruleMatches([{ field: 'amount', operator: 'gte', value: '500' }, { field: 'amount', operator: 'lte', value: '700' }], subject)).toBe(true);
    expect(ruleMatches([{ field: 'direction', operator: 'equals', value: 'IN' }], subject)).toBe(false);
    expect(ruleMatches([], subject)).toBe(false);
  });

  it('orders rules deterministically by priority, creation time and id', () => {
    const rules = [
      rule({ id: 'c', priority: 20 }),
      rule({ id: 'b', priority: 10, createdAt: new Date('2026-02-01') }),
      rule({ id: 'a2', priority: 10 }),
      rule({ id: 'a1', priority: 10 }),
    ];
    expect(sortRules(rules).map((r) => r.id)).toEqual(['a1', 'a2', 'b', 'c']);
  });

  it('first matching active rule wins', () => {
    const ctx = {
      merchants: [], merchantCategory: new Map(), historyCategory: new Map(),
      rules: [
        rule({ id: 'off', priority: 1, isActive: false, conditions: [{ field: 'description', operator: 'contains', value: 'netflix' }], actions: { categoryId: 'x' } }),
        rule({ id: 'ent', priority: 5, conditions: [{ field: 'description', operator: 'contains', value: 'netflix' }], actions: { categoryId: 'entertainment', type: TransactionType.EXPENSE, markRecurring: true } }),
        rule({ id: 'late', priority: 9, conditions: [{ field: 'description', operator: 'contains', value: 'netflix' }], actions: { categoryId: 'other' } }),
      ],
    };
    expect(categorize({ description: 'NETFLIX.COM', amount: '-649' }, ctx)).toMatchObject({ categoryId: 'entertainment', ruleId: 'ent', source: 'RULE' });
  });

  it('detects the longest whole-word merchant name', () => {
    const m = (id: string, normalizedName: string) => ({ id, userId: USER_A, name: id, normalizedName, createdAt: new Date(), updatedAt: new Date() });
    const merchants = [m('amazon', 'AMAZON'), m('amazon-pay', 'AMAZON PAY'), m('zon', 'ZON')];
    expect(detectMerchant('UPI AMAZON PAY INDIA', merchants)?.id).toBe('amazon-pay');
    expect(detectMerchant('AMAZONPAY', merchants)).toBeNull();
  });

  it('picks the most frequent category with deterministic ties', () => {
    expect(mostFrequent([{ key: 'k', categoryId: 'b', count: 2 }, { key: 'k', categoryId: 'a', count: 2 }, { key: 'k', categoryId: 'c', count: 1 }]))
      .toEqual(new Map([['k', 'a']]));
  });
});

describe('RuleService', () => {
  it('creates rules with increasing default priority and validates them', async () => {
    const { core, store } = setup();
    const food = store.addSystemCategory('Food', CategoryType.EXPENSE);
    const first = await core.rules.create(USER_A, { name: 'Swiggy', conditions: [{ field: 'description', operator: 'contains', value: 'swiggy' }], actions: { categoryId: food.id } });
    const second = await core.rules.create(USER_A, { name: 'Zomato', conditions: [{ field: 'merchant', operator: 'equals', value: 'Zomato' }], actions: { categoryId: food.id } });
    expect([first.priority, second.priority]).toEqual([10, 20]);
    expect((await core.rules.list(USER_B))).toEqual([]);

    await expectDomainError(core.rules.create(USER_A, { name: 'x', conditions: [], actions: { categoryId: food.id } }), 'INVALID_RULE');
    await expectDomainError(core.rules.create(USER_A, { name: 'x', conditions: [{ field: 'amount', operator: 'contains', value: '1' }], actions: { categoryId: food.id } }), 'INVALID_RULE');
    await expectDomainError(core.rules.create(USER_A, { name: 'x', conditions: [{ field: 'description', operator: 'contains', value: 'a' }], actions: {} }), 'INVALID_RULE');
    await expectDomainError(core.rules.create(USER_A, { name: 'x', conditions: [{ field: 'description', operator: 'contains', value: 'a' }], actions: { categoryId: 'missing' } }), 'CATEGORY_NOT_FOUND');

    const updated = await core.rules.update(USER_A, second.id, { priority: 1, isActive: false });
    expect(updated).toMatchObject({ priority: 1, isActive: false });
    await expectDomainError(core.rules.delete(USER_B, second.id), 'RULE_NOT_FOUND');
  });
});
