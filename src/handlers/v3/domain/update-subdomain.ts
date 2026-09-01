import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { AppError, ErrorCode } from '@utils/error';
import { eq } from 'drizzle-orm';
import { Github } from '@/utils/github/github';
import { GithubSubDomain, Record } from '@/utils/github/github.dto';
import { z } from 'zod';
import { recordSchema } from '@/utils/github/github.dto';
import { isVendorSubdomain, validateVendorRecords } from '@/utils/vendor';

interface UpdateSubdomainRequest {
  description?: string;
  record?: Record[];
}

interface UpdateSubdomainResponse {
  subdomainId: string;
  subdomainName: string;
  description: string;
  record: Record[];
  ownerId: string;
}

// Zod Schemas
export const updateSubdomainRequestSchema = z.object({
  description: z.string().optional(),
  record: z.array(recordSchema).optional(),
});

export const handleUpdateSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const subdomainName = c.req.param('subdomainName');
  const { description, record } = await c.req.json<UpdateSubdomainRequest>();

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
      "You don't have permission to update this subdomain"
    );
  }

  // Vendor subdomains (_{vendor}.*) only support TXT records
  if (isVendorSubdomain(subdomainName) && record) {
    const vendorRecordValidation = validateVendorRecords(record);
    if (!vendorRecordValidation.isValid) {
      throw new AppError(400, ErrorCode.INVALID_SUBDOMAIN_NAME, vendorRecordValidation.error!);
    }
  }

  // Get current configuration from GitHub (individual file for each subdomain)
  const githubContent = await Github.getDomainDeterminationContent(subdomainName, githubToken);
  if (!githubContent) {
    throw new AppError(
      404,
      ErrorCode.GITHUB_API_ERROR,
      'Subdomain configuration not found in GitHub'
    );
  }

  const updatedSubDomain: GithubSubDomain = {
    description: description || existingSubdomain.description,
    owner: {
      github_username: user.userId,
      email: user.name + '@noreply.com',
    },
    record: record || (JSON.parse(existingSubdomain.record) as Record[]),
  };

  await Github.updateDomainDeterminationContent(
    subdomainName,
    updatedSubDomain,
    githubToken,
    githubContent.sha
  );

  const updatedSubdomain = await db
    .update(subdomains)
    .set({
      description: description || existingSubdomain.description,
      record: record ? JSON.stringify(record) : existingSubdomain.record,
    })
    .where(eq(subdomains.name, subdomainName))
    .returning();

  const response: UpdateSubdomainResponse = {
    subdomainId: updatedSubdomain[0].id,
    subdomainName: updatedSubdomain[0].name,
    description: updatedSubdomain[0].description,
    record: JSON.parse(updatedSubdomain[0].record),
    ownerId: updatedSubdomain[0].ownerId!,
  };

  return c.json(response);
};
