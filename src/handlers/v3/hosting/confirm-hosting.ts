import { Context } from 'hono';
import { AppType } from '@/binding';
import { nanoid } from 'nanoid';
import { AppError, ErrorCode } from '@utils/error';
import { Github } from '@/utils/github/github';
import { GithubSubDomain, Record as DNSRecord } from '@/utils/github/github.dto';
import type { IObjectStorage } from '@/adapters/types';

const HOSTING_WORKER_DOMAIN = 'd2t4ubtfjuejkc.cloudfront.net';
const USER_MAX_SUBDOMAINS = 5;

async function deleteStoragePrefix(storage: IObjectStorage, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await storage.list({ prefix, cursor });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map((obj) => storage.delete(obj.key)));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

interface ConfirmRequest {
  files: { path: string; size: number }[];
}

export async function handleConfirmHosting(c: Context<AppType>): Promise<Response> {
  const name = c.req.param('name');
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  if (!name) {
    throw new AppError(400, ErrorCode.INVALID_SUBDOMAIN_NAME, 'Subdomain name is required');
  }

  const body: ConfirmRequest = await c.req.json();
  const totalSize = body.files?.reduce((sum, f) => sum + (f.size || 0), 0) || 0;

  const existingSubdomain = await db.findSubdomainByName(name);
  const isUpdate = !!existingSubdomain;

  if (isUpdate) {
    if (existingSubdomain.ownerId !== user.userId) {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        "You don't have permission to update this hosting"
      );
    }
    await db.updateSubdomain(name, {});
  } else {
    const userDomains = await db.findSubdomainsByOwner(user.userId);
    const regularDomains = userDomains.filter((d) => !d.name.startsWith('_'));
    if (regularDomains.length >= USER_MAX_SUBDOMAINS) {
      throw new AppError(
        400,
        ErrorCode.MAX_SUBDOMAIN_REACHED,
        `User has reached the maximum number of domains (${USER_MAX_SUBDOMAINS})`
      );
    }

    const cnameRecord: DNSRecord[] = [{ type: 'CNAME' as const, value: HOSTING_WORKER_DOMAIN }];

    const githubToken = await Github.createTokenforGitHubApp(
      c.env.GITHUB_APP_SECRET,
      c.env.GITHUB_APP_CLIENT_ID,
      c.env.GITHUB_APP_INSTALLATION_ID
    );

    const subDomain: GithubSubDomain = {
      description: 'Static site hosting',
      owner: {
        github_username: user.userId,
        email: user.name + '@noreply.com',
      },
      record: cnameRecord,
    };

    await Github.createDomainDeterminationContent(name, subDomain, githubToken);

    await db.createSubdomain({
      id: nanoid(),
      name,
      description: 'Static site hosting',
      record: JSON.stringify(cnameRecord),
      ownerId: user.userId,
    });
  }

  return c.json(
    {
      subdomain: name,
      url: `https://${name}.is-an.ai`,
      fileCount: body.files?.length || 0,
      totalSize,
    },
    isUpdate ? 200 : 201
  );
}
