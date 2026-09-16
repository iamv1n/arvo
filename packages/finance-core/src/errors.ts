export type DomainErrorKind = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FORBIDDEN';

/**
 * A business-rule failure. `code` is stable and machine-readable (e.g. ACCOUNT_NOT_FOUND);
 * interfaces (HTTP, MCP) map `kind` to their own status semantics.
 */
export class DomainError extends Error {
  constructor(
    readonly kind: DomainErrorKind,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static notFound(code: string, message: string): DomainError {
    return new DomainError('NOT_FOUND', code, message);
  }

  static validation(code: string, message: string, details?: unknown): DomainError {
    return new DomainError('VALIDATION', code, message, details);
  }

  static conflict(code: string, message: string): DomainError {
    return new DomainError('CONFLICT', code, message);
  }

  static forbidden(code: string, message: string): DomainError {
    return new DomainError('FORBIDDEN', code, message);
  }
}
