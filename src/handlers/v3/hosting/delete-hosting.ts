import { Context } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';
import { Github } from '@/utils/github/github';
import type { IObjectStorage } from '@/adapters/types';

async function deleteStoragePrefix(storage: IObjectStorage, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await storage.list({ prefix, cursor });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map((obj) => storage.delete(obj.key)));
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

  const existingSubdomain = await db.findSubdomainByName(name);

  if (!existingSubdomain) {
    throw new AppError(404, ErrorCode.HOSTING_NOT_FOUND, 'Hosting not found');
  }

  if (existingSubdomain.ownerId !== user.userId) {
    throw new AppError(
      403,
      ErrorCode.FORBIDDEN,
      "You don't have permission to delete this hosting"
    );
  }

  // Delete storage files
  const storage = c.get('storage');
  await deleteStoragePrefix(storage, `sites/${name}/`);

  // Delete GitHub record file (triggers CI -> PowerDNS -> HE)
  const githubToken = await Github.createTokenforGitHubApp(
    c.env.GITHUB_APP_SECRET,
    c.env.GITHUB_APP_CLIENT_ID,
    c.env.GITHUB_APP_INSTALLATION_ID
  );

  const githubContent = await Github.getDomainDeterminationContent(name, githubToken);
  if (githubContent) {
    await Github.deleteDomainDeterminationContent(name, githubToken, githubContent.sha);
  }

  await db.deleteSubdomainByName(name);

  return c.json({ success: true });
}
