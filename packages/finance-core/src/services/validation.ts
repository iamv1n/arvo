import { TransactionType } from '@arvo/types';
import { isCurrencyCode, isIsoDate } from '../dates';
import { DomainError } from '../errors';
import { isMoneyString, parseMoney, type MoneyUnits } from '../money';

export function requireText(field: string, value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw DomainError.validation('INVALID_INPUT', `${field} must not be empty`, { field });
  }
  if (trimmed.length > maxLength) {
    throw DomainError.validation('INVALID_INPUT', `${field} must be at most ${maxLength} characters`, {
      field,
    });
  }
  return trimmed;
}

export function optionalText(field: string, value: string | null | undefined, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : requireText(field, trimmed, maxLength);
}

export function requireMoney(field: string, value: string): MoneyUnits {
  if (!isMoneyString(value)) {
    throw DomainError.validation(
      'INVALID_AMOUNT',
      `${field} must be a decimal string with at most 4 fraction digits`,
      { field },
    );
  }
  return parseMoney(value);
}

export function requireCurrency(value: string): string {
  const code = value.trim().toUpperCase();
  if (!isCurrencyCode(code)) {
    throw DomainError.validation('INVALID_CURRENCY', 'currency must be an ISO 4217 code', {
      field: 'currency',
    });
  }
  return code;
}

export function requireDate(field: string, value: string): string {
  if (!isIsoDate(value)) {
    throw DomainError.validation('INVALID_DATE', `${field} must be a valid YYYY-MM-DD date`, { field });
  }
  return value;
}

const INFLOW_TYPES = new Set([TransactionType.INCOME, TransactionType.REFUND]);
const OUTFLOW_TYPES = new Set([TransactionType.EXPENSE, TransactionType.FEE]);

/**
 * Amounts are signed from the account's perspective. Income and refunds must be inflows,
 * expenses and fees must be outflows. Transfers, interest (earned or charged) and unknown
 * rows may go either way. Zero-amount rows are rejected.
 */
export function assertAmountMatchesType(type: TransactionType, amount: MoneyUnits): void {
  if (amount === 0n) {
    throw DomainError.validation('INVALID_AMOUNT', 'amount must not be zero', { field: 'amount' });
  }
  if (INFLOW_TYPES.has(type) && amount < 0n) {
    throw DomainError.validation('AMOUNT_SIGN_MISMATCH', `${type} transactions must have a positive amount`);
  }
  if (OUTFLOW_TYPES.has(type) && amount > 0n) {
    throw DomainError.validation('AMOUNT_SIGN_MISMATCH', `${type} transactions must have a negative amount`);
  }
}
