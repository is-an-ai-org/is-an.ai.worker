import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { users } from '@drizzle/schema/users';
import { eq, sql } from 'drizzle-orm';
import { AppError, ErrorCode } from '@utils/error';

/**
 * Get subdomain count for a user by email.
 * Used by CI to enforce per-user domain limits on PR submissions.
 *
 * GET /admin/domain-count?email=user@example.com
 * Headers: X-Admin-Key: {ADMIN_API_KEY}
 * Response: { email, count, limit, allowed }
 */

const USER_MAX_SUBDOMAINS = 5;

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

  // Find user by email
  const user = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .get();

  if (!user) {
    // User not in DB — no domains registered via website
    return c.json({ email, count: 0, limit: USER_MAX_SUBDOMAINS, allowed: true });
  }

  // Count non-vendor subdomains (vendor subdomains don't count toward limit)
  const allDomains = await db
    .select()
    .from(subdomains)
    .where(eq(subdomains.ownerId, user.id))
    .all();

  const regularCount = allDomains.filter((d: { name: string }) => !d.name.startsWith('_')).length;

  return c.json({
    email,
    count: regularCount,
    limit: USER_MAX_SUBDOMAINS,
    allowed: regularCount < USER_MAX_SUBDOMAINS,
  });
}
