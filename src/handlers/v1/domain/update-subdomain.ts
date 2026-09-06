import { Context } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';
import { Github } from '@/utils/github/github';
import { GithubSubDomain, Record } from '@/utils/github/github.dto';
import { z } from 'zod';
import { recordSchema } from '@/utils/github/github.dto';

interface UpdateSubdomainRequest {
  description?: string;
  record?: Record[];
}

interface UpdateSubdomainResponse {
  subdomainId: string;
  subdomainName: string;
  description: string;
  record: Record[];
  ownerId: string | null;
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
  const githubToken = c.env.GITHUB_PAT;

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  // Query the subdomain from the database
  const existingSubdomain = await db.findSubdomainByName(subdomainName);

  if (!existingSubdomain) {
    throw new AppError(404, ErrorCode.SUBDOMAIN_NOT_FOUND, 'Subdomain not found');
  }

  // Check ownership
  if (existingSubdomain.ownerId !== user.userId) {
    throw new AppError(
      403,
      ErrorCode.FORBIDDEN,
      "You don't have permission to update this subdomain"
    );
  }

  // Get current configuration from GitHub
  const githubContent = await Github.getDomainDeterminationContent(subdomainName, githubToken);
  if (!githubContent) {
    throw new AppError(
      404,
      ErrorCode.GITHUB_API_ERROR,
      'Subdomain configuration not found in GitHub'
    );
  }

  // Prepare update content
  const updatedSubDomain: GithubSubDomain = {
    description: description || existingSubdomain.description,
    owner: {
      github_username: user.userId,
      email: user.name + '@noreply.com',
    },
    record: record || (JSON.parse(existingSubdomain.record) as Record[]),
  };

  // Update GitHub
  await Github.updateDomainDeterminationContent(
    subdomainName,
    updatedSubDomain,
    githubToken,
    githubContent.sha
  );

  // Update DB
  const updatedSubdomain = await db.updateSubdomain(subdomainName, {
    description: description || existingSubdomain.description,
    ...(record ? { record: JSON.stringify(record) } : {}),
  });

  if (!updatedSubdomain) {
    throw new AppError(404, ErrorCode.SUBDOMAIN_NOT_FOUND, 'Failed to update subdomain');
  }

  const response: UpdateSubdomainResponse = {
    subdomainId: updatedSubdomain.id,
    subdomainName: updatedSubdomain.name,
    description: updatedSubdomain.description,
    record: JSON.parse(updatedSubdomain.record),
    ownerId: updatedSubdomain.ownerId,
  };

  return c.json(response);
};
