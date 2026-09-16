import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { ApiError } from './api-exception.filter';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Request validation failed', flatten(errors)),
  });
}

function flatten(errors: ValidationError[], prefix = ''): { field: string; messages: string[] }[] {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Decimal string, optional sign, up to 4 fraction digits. Mirrors finance-core money parsing. */
export const MONEY_PATTERN = /^[+-]?\d{1,15}(\.\d{1,4})?$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
