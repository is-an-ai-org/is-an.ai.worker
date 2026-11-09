import { Context } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';
import { getSubdomainLimit } from '@/utils/subdomain-limit';

/**
 * Get subdomain count for a user by email.
 * Used by CI to enforce per-user domain limits on PR submissions.
 *
 * GET /admin/domain-count?email=user@example.com
 * Headers: X-Admin-Key: {ADMIN_API_KEY}
 * Response: { email, count, limit, allowed }
 */

export async function handleDomainCount(c: Context<AppType>): Promise<Response> {
  const adminKey = c.req.header('X-Admin-Key');
  if (!adminKey || adminKey !== c.env.ADMIN_API_KEY) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid admin key');
  }

  const email = c.req.query('email');
  if (!email) {
    throw new AppError(400, ErrorCode.INVALID_TOKEN, 'email query parameter is required');
  }

  const db = c.get('db');

  const user = await db.findUserByEmail(email);
  const domains = user ? await db.findSubdomainsByOwner(user.id) : [];
  const count = domains.filter((domain) => !domain.name.startsWith('_')).length;

  const limit = getSubdomainLimit(user);
  return c.json({
    email,
    count,
    limit,
    allowed: count < limit,
  });
}
