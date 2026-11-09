import type { IDatabase, User } from '@/adapters/types';
import { AppError, ErrorCode } from '@utils/error';

const DEFAULT_SUBDOMAIN_LIMIT = 5;
const DORI_GITHUB_ID = '30494557';
const DORI_SUBDOMAIN_LIMIT = 50;

export function getSubdomainLimit(user: User | undefined): number {
  return user?.provider === 'github' && user.providerId === DORI_GITHUB_ID
    ? DORI_SUBDOMAIN_LIMIT
    : DEFAULT_SUBDOMAIN_LIMIT;
}

export async function assertSubdomainLimit(db: IDatabase, userId: string, count: number) {
  if (count < DEFAULT_SUBDOMAIN_LIMIT) return;

  const limit = getSubdomainLimit(await db.findUserById(userId));
  if (count >= limit) {
    throw new AppError(
      400,
      ErrorCode.MAX_SUBDOMAIN_REACHED,
      `User has reached the maximum number of domains (${limit})`
    );
  }
}
