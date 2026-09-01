import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { AppError, ErrorCode } from '@utils/error';
import { eq, sql } from 'drizzle-orm';
import { Github } from '@/utils/github/github';
import type { R2Bucket } from '@cloudflare/workers-types';

async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map((obj) => bucket.delete(obj.key)));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

export async function handleDeleteHosting(c: Context<AppType>): Promise<Response> {
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
    throw new AppError(403, ErrorCode.FORBIDDEN, "You don't have permission to delete this hosting");
  }

  // Delete R2 files
  const bucket = c.env.SITES_BUCKET;
  await deleteR2Prefix(bucket, `sites/${name}/`);

  // Delete GitHub record file (triggers CI → PowerDNS → HE)
  const githubToken = await Github.createTokenforGitHubApp(
    c.env.GITHUB_APP_SECRET,
    c.env.GITHUB_APP_CLIENT_ID,
    c.env.GITHUB_APP_INSTALLATION_ID
  );

  const githubContent = await Github.getDomainDeterminationContent(name, githubToken);
  if (githubContent) {
    await Github.deleteDomainDeterminationContent(name, githubToken, githubContent.sha);
  }

  await db.delete(subdomains).where(eq(subdomains.name, name));

  return c.json({ success: true });
}
