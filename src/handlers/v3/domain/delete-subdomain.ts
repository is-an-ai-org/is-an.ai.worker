import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { AppError, ErrorCode } from '@utils/error';
import { eq } from 'drizzle-orm';
import { Github } from '@/utils/github/github';

export const handleDeleteSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const subdomainName = c.req.param('subdomainName');

  const db = c.get('db');
  const user = c.get('user');
  const githubToken = await Github.createTokenforGitHubApp(
    c.env.GITHUB_APP_SECRET,
    c.env.GITHUB_APP_CLIENT_ID,
    c.env.GITHUB_APP_INSTALLATION_ID
  );

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const existingSubdomain = await db
    .select()
    .from(subdomains)
    .where(eq(subdomains.name, subdomainName))
    .get();

  if (!existingSubdomain) {
    throw new AppError(404, ErrorCode.SUBDOMAIN_NOT_FOUND, 'Subdomain not found');
  }

  if (existingSubdomain.ownerId !== user.userId) {
    throw new AppError(
      403,
      ErrorCode.FORBIDDEN,
      "You don't have permission to delete this subdomain"
    );
  }

  // Each subdomain (including _{vendor}.*) has its own individual file
  const githubContent = await Github.getDomainDeterminationContent(subdomainName, githubToken);
  if (!githubContent) {
    throw new AppError(
      404,
      ErrorCode.GITHUB_API_ERROR,
      'Subdomain configuration not found in GitHub'
    );
  }

  await Github.deleteDomainDeterminationContent(subdomainName, githubToken, githubContent.sha);

  await db.delete(subdomains).where(eq(subdomains.name, subdomainName));

  return c.json({ message: 'Subdomain deleted successfully' });
};
