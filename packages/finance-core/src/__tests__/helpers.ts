import { AccountType } from '@arvo/types';
import { DomainError } from '../errors';
import { FinanceCore } from '../finance-core';
import { InMemoryStore } from '../testing/in-memory-store';

export const USER_A = '00000000-0000-4000-8000-00000000000a';
export const USER_B = '00000000-0000-4000-8000-00000000000b';

export function setup() {
  const store = new InMemoryStore();
  const core = new FinanceCore(store);
  const bank = (userId = USER_A, openingBalance = '10000') =>
    core.accounts.create(userId, { name: 'HDFC Savings', type: AccountType.BANK, currency: 'INR', openingBalance });
  const card = (userId = USER_A) =>
    core.accounts.create(userId, { name: 'ICICI Card', type: AccountType.CREDIT_CARD, currency: 'INR' });
  return { store, core, bank, card };
}

export async function expectDomainError(promise: Promise<unknown>, code: string): Promise<DomainError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}
