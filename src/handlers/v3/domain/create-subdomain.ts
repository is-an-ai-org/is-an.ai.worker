import { Context } from 'hono';
import { AppType } from '@/binding';
import { nanoid } from 'nanoid';
import { AppError, ErrorCode } from '@utils/error';
import { Github } from '@/utils/github/github';
import { GithubSubDomain, Record, recordSchema } from '@/utils/github/github.dto';
import { z } from 'zod';
import { validateSubdomainName } from '@/utils/subdomain';
import { validateVendorRecords } from '@/utils/vendor';

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

  const githubToken = await Github.createTokenforGitHubApp(
    c.env.GITHUB_APP_SECRET,
    c.env.GITHUB_APP_CLIENT_ID,
    c.env.GITHUB_APP_INSTALLATION_ID
  );

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const validationResult = validateSubdomainName(subdomainName);

  if (!validationResult.isValid && validationResult.error) {
    throw new AppError(400, ErrorCode.INVALID_SUBDOMAIN_NAME, validationResult.error);
  }

  const existingSubdomain = await db.findSubdomainByName(subdomainName);

  if (existingSubdomain) {
    throw new AppError(400, ErrorCode.SUBDOMAIN_ALREADY_EXISTS, 'Subdomain already exists');
  }

  // Vendor subdomain (_{vendor}.{base}): validate TXT-only and check base subdomain ownership
  if (validationResult.isVendor && validationResult.baseSubdomain) {
    const vendorRecordValidation = validateVendorRecords(record);
    if (!vendorRecordValidation.isValid) {
      throw new AppError(400, ErrorCode.INVALID_SUBDOMAIN_NAME, vendorRecordValidation.error!);
    }

    const baseSubdomainRecord = await db.findSubdomainByName(validationResult.baseSubdomain);

    if (!baseSubdomainRecord) {
      throw new AppError(
        400,
        ErrorCode.SUBDOMAIN_NOT_FOUND,
        `Base subdomain '${validationResult.baseSubdomain}' does not exist. You must register the base subdomain first.`
      );
    }

    if (baseSubdomainRecord.ownerId !== user.userId) {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        `You don't have permission to create vendor verification for '${validationResult.baseSubdomain}'.`
      );
    }
  }

  const userDomains = await db.findSubdomainsByOwner(user.userId);

  // Vendor subdomains don't count toward the limit
  const regularDomains = userDomains.filter((d) => !d.name.startsWith('_'));
  if (!validationResult.isVendor && regularDomains.length >= USER_MAX_SUBDOMAINS) {
    throw new AppError(
      400,
      ErrorCode.MAX_SUBDOMAIN_REACHED,
      `User has reached the maximum number of domains (${USER_MAX_SUBDOMAINS})`
    );
  }

  const subDomain: GithubSubDomain = {
    description:
      description ||
      (validationResult.isVendor
        ? `${validationResult.vendorName} verification for ${validationResult.baseSubdomain}`
        : ''),
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
    description: subDomain.description,
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
