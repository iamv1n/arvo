import type { Request, Response } from 'express';

export interface AuthenticatedUser {
  id: string;
}

export interface ArvoRequest extends Request {
  requestId: string;
  user?: AuthenticatedUser;
}

export interface ArvoResponse extends Response {
  locals: { errorCode?: string };
}
