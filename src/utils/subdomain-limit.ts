import type { AccountTier, IDatabase } from '@/adapters/types';
import { AppError, ErrorCode } from '@utils/error';

const SUBDOMAIN_LIMITS: Record<AccountTier, number> = { free: 5, pro: 50 };

export function getSubdomainLimit(tier: AccountTier | undefined): number {
  return tier && Object.hasOwn(SUBDOMAIN_LIMITS, tier)
    ? SUBDOMAIN_LIMITS[tier]
    : SUBDOMAIN_LIMITS.free;
}

export async function assertSubdomainLimit(db: IDatabase, userId: string, count: number) {
  if (count < SUBDOMAIN_LIMITS.free) return;

  const user = await db.findUserById(userId);
  const limit = getSubdomainLimit(user?.tier);
  if (count >= limit) {
    throw new AppError(
      400,
      ErrorCode.MAX_SUBDOMAIN_REACHED,
      `User has reached the maximum number of domains (${limit})`
    );
  }
}
