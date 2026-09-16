import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction } from 'express';
import type { ArvoRequest, ArvoResponse } from './request-context';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Assigns request_id and logs one structured line per request. Bodies are never logged. */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('http');

  use(req: ArvoRequest, res: ArvoResponse, next: NextFunction) {
    const incoming = req.header('x-request-id');
    req.requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    const started = process.hrtime.bigint();

    res.on('finish', () => {
      const route = (req.route as { path?: string } | undefined)?.path ?? 'unmatched';
      this.logger.log({
        msg: 'request',
        request_id: req.requestId,
        user_id: req.user?.id ?? null,
        operation: `${req.method} ${req.baseUrl}${route}`,
        duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
        status: res.statusCode,
        error_code: res.locals.errorCode ?? null,
      });
    });
    next();
  }
}
