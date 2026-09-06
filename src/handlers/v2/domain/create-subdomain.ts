import { Context } from 'hono';
import { AppType } from '@/binding';
import { nanoid } from 'nanoid';
import { AppError, ErrorCode } from '@utils/error';
import { Github } from '@/utils/github/github';
import { GithubSubDomain, Record, recordSchema } from '@/utils/github/github.dto';
import { z } from 'zod';
import { validateSubdomainName } from '@/utils/subdomain';

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

export async function handleCreateSubdomain(c: Context<AppType>): Promise<Response> {
  const { subdomainName, description, record } = await c.req.json<CreateSubdomainRequest>();

  const db = c.get('db');
  const user = c.get('user');

  const githubToken = c.env.GITHUB_PAT;

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const existingSubdomain = await db.findSubdomainByName(subdomainName);

  if (existingSubdomain) {
    throw new AppError(400, ErrorCode.SUBDOMAIN_ALREADY_EXISTS, 'Subdomain already exists');
  }

  const { isValid, error } = validateSubdomainName(subdomainName);

  if (!isValid && error) {
    throw new AppError(400, ErrorCode.INVALID_SUBDOMAIN_NAME, error);
  }

  const userDomains = await db.findSubdomainsByOwner(user.userId);

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

  const subdomain = await db.createSubdomain({
    id: nanoid(),
    name: subdomainName,
    description: description,
    record: JSON.stringify(record),
    ownerId: user.userId,
  });

  const response: CreateSubdomainResponse = {
    subdomainId: subdomain.id,
    subdomainName: subdomain.name,
    description: subdomain.description,
    record: JSON.parse(subdomain.record),
    ownerId: user.userId,
  };

  return c.json(response);
}
