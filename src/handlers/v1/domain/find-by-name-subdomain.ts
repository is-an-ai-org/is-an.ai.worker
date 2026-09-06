import { Context } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';
import { Github } from '@/utils/github/github';
import { Record } from '@/utils/github/github.dto';

interface SubdomainResponse {
  subdomainId: string;
  subdomainName: string;
  description: string;
  record: Record;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const handleFindByNameSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const subdomainName = c.req.param('subdomainName');
  const db = c.get('db');
  const githubToken = c.env.GITHUB_PAT;

  // query subdomain by name (case-insensitive matching handled by adapter)
  const subdomain = await db.findSubdomainByName(subdomainName);

  if (!subdomain) {
    throw new AppError(404, ErrorCode.SUBDOMAIN_NOT_FOUND, 'Subdomain not found');
  }

  // check if the subdomain exists in GitHub
  const githubContent = await Github.getDomainDeterminationContent(subdomain.name, githubToken);
  const existsInGithub = !!githubContent;

  // if the subdomain does not exist in GitHub, delete it from the DB
  if (!existsInGithub) {
    await db.deleteSubdomainByName(subdomainName);
    throw new AppError(404, ErrorCode.SUBDOMAIN_NOT_FOUND, 'Subdomain not found in GitHub');
  }

  const response: SubdomainResponse = {
    subdomainId: subdomain.id,
    subdomainName: subdomain.name,
    description: subdomain.description,
    record: JSON.parse(subdomain.record),
    ownerId: subdomain.ownerId,
    createdAt: subdomain.createdAt,
    updatedAt: subdomain.updatedAt,
  };

  return c.json(response);
};
