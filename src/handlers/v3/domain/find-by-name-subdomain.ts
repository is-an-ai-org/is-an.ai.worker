import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { AppError, ErrorCode } from '@utils/error';
import { eq, sql } from 'drizzle-orm';
import { Github } from '@/utils/github/github';
import type { Subdomain } from '@drizzle/schema/domain';
import { z } from 'zod';
import { recordSchema, Record } from '@/utils/github/github.dto';

interface SubdomainResponse {
  subdomainId: string;
  subdomainName: string;
  description: string;
  record: Record;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export const handleFindByNameSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const subdomainName = c.req.param('subdomainName');
  const db = c.get('db');
  const githubToken = await Github.createTokenforGitHubApp(
    c.env.GITHUB_APP_SECRET,
    c.env.GITHUB_APP_CLIENT_ID,
    c.env.GITHUB_APP_INSTALLATION_ID
  );

  // query subdomain by name
  const subdomain = await db
    .select()
    .from(subdomains)
    .where(sql`lower(${subdomains.name}) = lower(${subdomainName})`)
    .get();

  if (!subdomain) {
    throw new AppError(404, ErrorCode.SUBDOMAIN_NOT_FOUND, 'Subdomain not found');
  }

  // check if the subdomain exists in GitHub
  const githubContent = await Github.getDomainDeterminationContent(subdomain.name, githubToken);
  const existsInGithub = !!githubContent;

  // if the subdomain does not exist in GitHub, delete it from the DB
  if (!existsInGithub) {
    await db.delete(subdomains).where(eq(subdomains.name, subdomainName));
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
