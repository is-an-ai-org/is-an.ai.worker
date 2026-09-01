import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { AppError, ErrorCode } from '@utils/error';
import { eq } from 'drizzle-orm';
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

export const handleFindByIdSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const subdomainId = c.req.param('id');
  const db = c.get('db');
  const githubToken = c.env.GITHUB_PAT;

  // query subdomain by id
  const subdomain = await db.select().from(subdomains).where(eq(subdomains.id, subdomainId)).get();

  if (!subdomain) {
    throw new AppError(404, ErrorCode.SUBDOMAIN_NOT_FOUND, 'Subdomain not found');
  }

  // check if the subdomain exists in GitHub
  const githubContent = await Github.getDomainDeterminationContent(subdomain.name, githubToken);

  // if the subdomain does not exist in GitHub, delete it from the DB
  if (!githubContent) {
    await db.delete(subdomains).where(eq(subdomains.id, subdomainId));
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
