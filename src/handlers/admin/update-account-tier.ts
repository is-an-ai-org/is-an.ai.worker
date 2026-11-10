import type { Context } from 'hono';
import { z } from 'zod';
import { ACCOUNT_TIERS } from '@/adapters/types';
import type { AppType } from '@/binding';
import { getSubdomainLimit } from '@/utils/subdomain-limit';
import { AppError, ErrorCode } from '@utils/error';

const updateAccountTierSchema = z.object({ tier: z.enum(ACCOUNT_TIERS) }).strict();

export async function handleUpdateAccountTier(c: Context<AppType, '/users/:userId/tier'>) {
  const adminKey = c.req.header('X-Admin-Key');
  if (!adminKey || adminKey !== c.env.ACCOUNT_TIER_ADMIN_KEY) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid account tier admin key');
  }

  const result = updateAccountTierSchema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Expected a valid account tier');
  }

  const userId = c.req.param('userId');
  const { tier } = result.data;
  if (!(await c.get('db').setUserTier(userId, tier))) {
    throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'User not found');
  }

  return c.json({ userId, tier, limit: getSubdomainLimit(tier) });
}
