import type { ApiErrorCode } from '@mythweaver/contracts';

/**
 * Errors a service raises on purpose. Anything else that escapes a handler is a bug and is
 * reported as a generic 500, so internal details never reach a client.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, string[]>;

  constructor(
    code: ApiErrorCode,
    statusCode: number,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    if (details) this.details = details;
  }
}

export const badRequest = (message: string, details?: Record<string, string[]>) =>
  new AppError('bad_request', 400, message, details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError('unauthorized', 401, message);

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError('forbidden', 403, message);

export const notFound = (message = 'Not found') => new AppError('not_found', 404, message);

export const conflict = (message: string) => new AppError('conflict', 409, message);

/**
 * A campaign the caller cannot see is reported as missing, not forbidden: a 403 would confirm
 * that the id exists in someone else's account.
 */
export const campaignNotFound = () => notFound('Campaign not found');
