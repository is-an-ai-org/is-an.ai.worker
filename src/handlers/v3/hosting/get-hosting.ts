import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { AppError, ErrorCode } from '@utils/error';
import { sql } from 'drizzle-orm';

export async function handleGetHosting(c: Context<AppType>): Promise<Response> {
  const name = c.req.param('name');
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const existingSubdomain = await db
    .select()
    .from(subdomains)
    .where(sql`lower(${subdomains.name}) = lower(${name})`)
    .get();

  if (!existingSubdomain) {
    throw new AppError(404, ErrorCode.HOSTING_NOT_FOUND, 'Hosting not found');
  }

  if (existingSubdomain.ownerId !== user.userId) {
    throw new AppError(403, ErrorCode.FORBIDDEN, "You don't have permission to view this hosting");
  }

  const bucket = c.env.SITES_BUCKET;
  const prefix = `sites/${name}/`;
  let fileCount = 0;
  let totalSize = 0;
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({ prefix, cursor });
    for (const obj of listed.objects) {
      fileCount++;
      totalSize += obj.size;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return c.json({
    subdomain: name,
    url: `https://${name}.is-an.ai`,
    fileCount,
    totalSize,
    lastDeployedAt: existingSubdomain.updatedAt,
  });
}
