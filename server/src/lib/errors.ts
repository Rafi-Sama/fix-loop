export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed') => new AppError(403, 'forbidden', message);
// Same response whether the row doesn't exist or belongs to another org: never confirm existence.
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) => new AppError(409, 'conflict', message, details);
export const gone = (message = 'This link has expired') => new AppError(410, 'gone', message);
export const tooMany = (message = 'Too many attempts, try again later') => new AppError(429, 'too_many_requests', message);

/** Narrows `value` in place: `assertFound(row, 'Unit'); row.id`. */
export function assertFound<T>(value: T | undefined | null, what?: string): asserts value is T {
  if (value === undefined || value === null) throw notFound(what);
}

/** Expression form: `return found(row, 'Unit')`. */
export function found<T>(value: T | undefined | null, what?: string): T {
  assertFound(value, what);
  return value;
}
