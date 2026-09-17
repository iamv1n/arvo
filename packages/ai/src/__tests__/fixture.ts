import { FinanceCore } from '@arvo/finance-core';
import { InMemoryStore } from '@arvo/finance-core/testing';
import type { ToolContext } from '@arvo/finance-tools';
import { AccountType, CategoryType, TransactionType } from '@arvo/types';

export const USER_A = '00000000-0000-4000-8000-00000000000a';
export const USER_B = '00000000-0000-4000-8000-00000000000b';
export const TODAY = '2026-08-20';

export async function fixture() {
  const store = new InMemoryStore();
  const core = new FinanceCore(store);
  const food = store.addSystemCategory('Food', CategoryType.EXPENSE);
  const bank = await core.accounts.create(USER_A, { name: 'HDFC', type: AccountType.BANK, currency: 'INR', openingBalance: '10000' });
  const add = (date: string, amount: string, type: TransactionType, description: string, extra: Record<string, unknown> = {}) =>
    core.transactions.create(USER_A, { accountId: bank.id, date, amount, type, description, ...extra });
  for (const month of ['05', '06', '07', '08']) {
    await add(`2026-${month}-01`, '100000', TransactionType.INCOME, 'SALARY');
    await add(`2026-${month}-05`, '-649', TransactionType.EXPENSE, 'NETFLIX', { merchantName: 'Netflix' });
  }
  await add('2026-05-10', '-2000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: food.id, merchantName: 'Swiggy' });
  await add('2026-06-10', '-2000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: food.id, merchantName: 'Swiggy' });
  await add('2026-07-10', '-6000', TransactionType.EXPENSE, 'SWIGGY', { categoryId: food.id, merchantName: 'Swiggy' });
  await add('2026-08-10', '-4500', TransactionType.EXPENSE, 'SWIGGY', { categoryId: food.id, merchantName: 'Swiggy' });
  const ctx = (userId = USER_A): ToolContext => ({ core, userId, currency: 'INR', today: TODAY });
  return { store, core, bank, food, ctx };
}
