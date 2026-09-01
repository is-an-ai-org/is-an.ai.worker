import { Context, Next } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';

export async function devMiddleware(c: Context<AppType>, next: Next) {
  if (c.env.ENV_TYPE !== 'dev') {
    throw new AppError(
      403,
      ErrorCode.INVALID_STATE,
      'This endpoint is only available in development environment'
    );
  }
  await next();
}
