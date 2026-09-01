import { Context, Next } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';
import { verifyToken } from '@utils/jwt';

interface UserInfo {
  userId: string;
  name: string;
}

export async function authMiddleware(c: Context<AppType>, next: Next) {
  const rawToken = c.req.header('Authorization');

  if (!rawToken) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const [prefix, token] = rawToken.split(' ');

  if (prefix !== 'Bearer' || !token) {
    throw new AppError(400, ErrorCode.INVALID_TOKEN, 'Invalid token format');
  }

  try {
    const payload = await verifyToken(c.env.JWT_PUBLIC_KEY, token);
    const user: UserInfo = {
      userId: payload.sub,
      name: payload.name,
    };

    c.set('user', user);
    await next();
  } catch (error) {
    console.error('JWT verification failed:', error);
    throw new AppError(401, ErrorCode.INVALID_TOKEN, 'Token verification failed');
  }
}
