import { DomainError, type DomainErrorKind } from '@arvo/finance-core';
import type { ApiErrorBody } from '@arvo/types';
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ArvoRequest, ArvoResponse } from './request-context';

const STATUS_BY_KIND: Record<DomainErrorKind, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION: HttpStatus.UNPROCESSABLE_ENTITY,
  CONFLICT: HttpStatus.CONFLICT,
  FORBIDDEN: HttpStatus.FORBIDDEN,
};

/** Application-level error for HTTP concerns (auth, request shape). */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, readonly code: string, message: string, readonly details?: unknown) {
    super(message, status);
  }
}

/** Renders every failure as { error: { code, message, details? } }. Never leaks stack traces. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<ArvoRequest>();
    const res = http.getResponse<ArvoResponse>();
    const [status, body] = this.toResponse(exception, req);
    res.locals.errorCode = body.error.code;
    res.status(status).json(body);
  }

  private toResponse(exception: unknown, req: ArvoRequest): [number, ApiErrorBody] {
    if (exception instanceof DomainError) {
      return [STATUS_BY_KIND[exception.kind], errorBody(exception.code, exception.message, exception.details)];
    }
    if (exception instanceof ApiError) {
      return [exception.getStatus(), errorBody(exception.code, exception.message, exception.details)];
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = (HttpStatus[status] ?? 'HTTP_ERROR').toString();
      return [status, errorBody(code, exception.message)];
    }
    this.logger.error(
      { msg: 'unhandled exception', request_id: req.requestId, error: String(exception) },
      exception instanceof Error ? exception.stack : undefined,
    );
    return [HttpStatus.INTERNAL_SERVER_ERROR, errorBody('INTERNAL_ERROR', 'An unexpected error occurred')];
  }
}

function errorBody(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}
