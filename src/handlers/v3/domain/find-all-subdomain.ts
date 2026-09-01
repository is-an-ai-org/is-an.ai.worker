import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { AppError, ErrorCode } from '@utils/error';
import { eq } from 'drizzle-orm';
import { Github } from '@/utils/github/github';
import type { Subdomain } from '@drizzle/schema/domain';
import { z } from 'zod';
import { Record } from '@/utils/github/github.dto';

interface SubdomainResponse {
  subdomainId: string;
  subdomainName: string;
  description: string;
  record: Record;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export const handleFindAllSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const db = c.get('db');
  const githubToken = await Github.createTokenforGitHubApp(
    c.env.GITHUB_APP_SECRET,
    c.env.GITHUB_APP_CLIENT_ID,
    c.env.GITHUB_APP_INSTALLATION_ID
  );

  // query all subdomains
  const allSubdomains = await db.select().from(subdomains).all();

  const allGithubSubdomains = await Github.getDomainDeterminationDirectory(githubToken);

  // check if the subdomain exists in GitHub and clean up the DB
  const validSubdomains = await Promise.all(
    allSubdomains.map(async (subdomain: Subdomain) => {
      // if the subdomain does not exist in GitHub, delete it from the DB
      if (!allGithubSubdomains.includes(subdomain.name)) {
        await db.delete(subdomains).where(eq(subdomains.name, subdomain.name));
        return null;
      }

      return subdomain;
    })
  );

  // remove null values and convert to response data
  const response: SubdomainResponse[] = validSubdomains
    .filter((subdomain: Subdomain | null): subdomain is Subdomain => subdomain !== null)
    .map((subdomain: Subdomain) => ({
      subdomainId: subdomain.id,
      subdomainName: subdomain.name,
      description: subdomain.description,
      record: JSON.parse(subdomain.record),
      ownerId: subdomain.ownerId,
      createdAt: subdomain.createdAt,
      updatedAt: subdomain.updatedAt,
    }));

  return c.json(response);
};
