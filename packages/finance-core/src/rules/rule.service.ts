import { TransactionType } from '@arvo/types';
import { DomainError } from '../errors';
import { isMoneyString } from '../money';
import type { FinanceStore } from '../ports';
import { normalizePage, type Page, type PageRequest } from '../records';
import { requireText } from '../services/validation';
import { sortRules } from './categorizer';
import type { RuleActions, RuleCondition, RulePatch, RuleRecord } from './types';

export interface RuleInput {
  name: string;
  priority?: number;
  isActive?: boolean;
  conditions: RuleCondition[];
  actions: RuleActions;
}

const TEXT_OPERATORS = ['contains', 'equals', 'starts_with'];
const AMOUNT_OPERATORS = ['gte', 'lte', 'equals'];

export class RuleService {
  constructor(private readonly store: FinanceStore) {}

  async list(userId: string): Promise<RuleRecord[]> {
    return sortRules(await this.store.rules.findAll(userId));
  }

  /** Rules in evaluation order. */
  async page(userId: string, request: Partial<PageRequest> = {}): Promise<Page<RuleRecord>> {
    const { limit, offset } = normalizePage(request);
    const rules = await this.list(userId);
    return { items: rules.slice(offset, offset + limit), total: rules.length };
  }

  async create(userId: string, input: RuleInput): Promise<RuleRecord> {
    const existing = await this.store.rules.findAll(userId);
    const valid = await this.validate(userId, input);
    return this.store.rules.create({
      userId,
      ...valid,
      priority: input.priority ?? (existing.length ? Math.max(...existing.map((r) => r.priority)) + 10 : 10),
      isActive: input.isActive ?? true,
    });
  }

  async update(userId: string, id: string, input: Partial<RuleInput>): Promise<RuleRecord> {
    const rule = await this.require(userId, id);
    const merged = await this.validate(userId, { ...rule, ...input });
    const patch: RulePatch = { ...merged };
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    return this.store.rules.update(userId, id, patch);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.require(userId, id);
    await this.store.rules.delete(userId, id);
  }

  private async require(userId: string, id: string): Promise<RuleRecord> {
    const rule = await this.store.rules.findById(userId, id);
    if (!rule) throw DomainError.notFound('RULE_NOT_FOUND', 'Rule not found');
    return rule;
  }

  private async validate(userId: string, input: RuleInput): Promise<Pick<RuleRecord, 'name' | 'conditions' | 'actions'>> {
    const name = requireText('name', input.name, 120);
    if (!Number.isInteger(input.priority ?? 0)) {
      throw DomainError.validation('INVALID_RULE', 'priority must be an integer');
    }
    if (input.conditions.length === 0 || input.conditions.length > 10) {
      throw DomainError.validation('INVALID_RULE', 'A rule needs between 1 and 10 conditions');
    }
    const conditions = input.conditions.map((c) => {
      const value = c.value.trim();
      const textField = c.field === 'description' || c.field === 'merchant';
      if (textField && (!TEXT_OPERATORS.includes(c.operator) || !value)) {
        throw DomainError.validation('INVALID_RULE', `${c.field} conditions need contains, equals or starts_with and a value`);
      }
      if (c.field === 'amount' && (!AMOUNT_OPERATORS.includes(c.operator) || !isMoneyString(value) || value.startsWith('-'))) {
        throw DomainError.validation('INVALID_RULE', 'amount conditions need gte, lte or equals and a positive amount');
      }
      if (c.field === 'direction' && (c.operator !== 'equals' || !['IN', 'OUT'].includes(value.toUpperCase()))) {
        throw DomainError.validation('INVALID_RULE', 'direction conditions must equal IN or OUT');
      }
      if (!['description', 'merchant', 'amount', 'direction'].includes(c.field)) {
        throw DomainError.validation('INVALID_RULE', `Unknown condition field ${c.field}`);
      }
      return { field: c.field, operator: c.operator, value: c.field === 'direction' ? value.toUpperCase() : value };
    });

    const actions: RuleActions = {};
    if (input.actions.categoryId) {
      if (!(await this.store.categories.findVisibleById(userId, input.actions.categoryId))) {
        throw DomainError.notFound('CATEGORY_NOT_FOUND', 'Category not found');
      }
      actions.categoryId = input.actions.categoryId;
    }
    if (input.actions.merchantName?.trim()) actions.merchantName = requireText('merchantName', input.actions.merchantName, 120);
    if (input.actions.type) {
      if (!Object.values(TransactionType).includes(input.actions.type)) {
        throw DomainError.validation('INVALID_RULE', 'Unknown transaction type');
      }
      actions.type = input.actions.type;
    }
    if (input.actions.markRecurring) actions.markRecurring = true;
    if (Object.keys(actions).length === 0) {
      throw DomainError.validation('INVALID_RULE', 'A rule needs at least one action');
    }
    return { name, conditions, actions };
  }
}
