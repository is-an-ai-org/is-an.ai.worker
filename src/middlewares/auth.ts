import { Context, Next } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';
import { verifyToken } from '@utils/jwt';

export async function authMiddleware(c: Context<AppType>, next: Next) {
  const rawToken = c.req.header('Authorization');

  if (!rawToken) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const [prefix, token] = rawToken.split(' ');

  if (prefix !== 'Bearer' || !token) {
    throw new AppError(400, ErrorCode.INVALID_TOKEN, 'Invalid token format');
  }

  const payload = await verifyToken(c.env.JWT_PUBLIC_KEY, token);
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new AppError(401, ErrorCode.INVALID_TOKEN, 'Invalid token');
  }
  const db = c.get('db');
  const user = await db.findUserById(payload.sub);
  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Account not found');
  }
  if (user.provider === 'github' && (await db.isGitHubUserBanned(user.providerId))) {
    throw new AppError(403, ErrorCode.ACCOUNT_BANNED, 'Account is banned');
  }

  c.set('user', { userId: user.id, name: payload.name });
  await next();
}
