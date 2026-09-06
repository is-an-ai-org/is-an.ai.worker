import { Context } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';

const HOSTING_WORKER_DOMAIN = 'd2t4ubtfjuejkc.cloudfront.net';

export async function handleGetMyHostings(c: Context<AppType>): Promise<Response> {
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const userSubdomains = await db.findSubdomainsByOwner(user.userId);

  const hostingSubs = userSubdomains.filter((sub) => sub.record.includes(HOSTING_WORKER_DOMAIN));

  const results = hostingSubs.map((sub) => ({
    subdomain: sub.name,
    url: `https://${sub.name}.is-an.ai`,
    fileCount: 0,
    totalSize: 0,
    lastDeployedAt: sub.updatedAt,
  }));

  return c.json(results);
}
