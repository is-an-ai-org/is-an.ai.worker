import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { nanoid } from 'nanoid';
import { AppError, ErrorCode } from '@utils/error';
import { eq, sql } from 'drizzle-orm';
import { Github } from '@/utils/github/github';
import { GithubSubDomain, Record, recordSchema } from '@/utils/github/github.dto';
import { User, users } from '@drizzle/schema/users';
import { z } from 'zod';
import { blackListedSubdomainRegexes, blackListedSubdomains } from '@/utils/blacklist';

interface CreateSubdomainRequest {
  subdomainName: string;
  description: string;
  record: Record[];
}

interface CreateSubdomainResponse {
  subdomainId: string;
  subdomainName: string;
  description: string;
  record: Record[];
  ownerId: string;
}

// Zod Schemas
export const createSubdomainRequestSchema = z.object({
  subdomainName: z.string(),
  description: z.string(),
  record: z.array(recordSchema),
});

const USER_MAX_SUBDOMAINS = 5;

/**
 * @deprecated 더 이상 사용되지 않습니다. v2 엔드포인트를 사용하세요.
 */
export async function handleCreateSubdomain(c: Context<AppType>): Promise<Response> {
  const { subdomainName, description, record } = await c.req.json<CreateSubdomainRequest>();

  const db = c.get('db');
  const user = c.get('user');

  const githubToken = c.env.GITHUB_PAT;

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const existingSubdomain = await db
    .select()
    .from(subdomains)
    .where(sql`lower(${subdomains.name}) = lower(${subdomainName})`)
    .get();

  if (existingSubdomain) {
    throw new AppError(400, ErrorCode.SUBDOMAIN_ALREADY_EXISTS, 'Subdomain already exists');
  }

  if (
    blackListedSubdomains.includes(subdomainName) ||
    blackListedSubdomainRegexes.some((regex) => regex.test(subdomainName))
  ) {
    throw new AppError(
      400,
      ErrorCode.INVALID_SUBDOMAIN_NAME,
      'Subdomain name is not allowed, because it used for a reserved purpose'
    );
  }

  const userDomains = await db
    .select()
    .from(subdomains)
    .where(eq(subdomains.ownerId, user.userId))
    .all();

  if (userDomains.length >= USER_MAX_SUBDOMAINS) {
    throw new AppError(
      400,
      ErrorCode.MAX_SUBDOMAIN_REACHED,
      `User has reached the maximum number of domains (${USER_MAX_SUBDOMAINS})`
    );
  }

  const subDomain: GithubSubDomain = {
    description: description,
    owner: {
      github_username: user.userId,
      email: user.name + '@noreply.com',
    },
    record: record,
  };

  await Github.createDomainDeterminationContent(subdomainName, subDomain, githubToken);

  const subdomain = await db
    .insert(subdomains)
    .values({
      id: nanoid(),
      name: subdomainName,
      description: description,
      record: JSON.stringify(record),
      ownerId: user.userId,
    })
    .returning();

  const response: CreateSubdomainResponse = {
    subdomainId: subdomain[0].id,
    subdomainName: subdomain[0].name,
    description: subdomain[0].description,
    record: JSON.parse(subdomain[0].record),
    ownerId: subdomain[0].ownerId,
  };

  return c.json(response);
}
