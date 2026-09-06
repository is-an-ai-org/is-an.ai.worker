import { Context } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';

export async function handleGetHosting(c: Context<AppType>): Promise<Response> {
  const name = c.req.param('name');
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const existingSubdomain = await db.findSubdomainByName(name);

  if (!existingSubdomain) {
    throw new AppError(404, ErrorCode.HOSTING_NOT_FOUND, 'Hosting not found');
  }

  if (existingSubdomain.ownerId !== user.userId) {
    throw new AppError(403, ErrorCode.FORBIDDEN, "You don't have permission to view this hosting");
  }

  const storage = c.get('storage');
  const prefix = `sites/${name}/`;
  let fileCount = 0;
  let totalSize = 0;
  let cursor: string | undefined;

  do {
    const listed = await storage.list({ prefix, cursor });
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
