import { Context } from 'hono';
import { AppType } from '@/binding';
import { nanoid } from 'nanoid';
import { AppError, ErrorCode } from '@utils/error';
import { validateSubdomainName } from '@/utils/subdomain';
import { Github } from '@/utils/github/github';
import { GithubSubDomain, Record as DNSRecord } from '@/utils/github/github.dto';
import type { IObjectStorage } from '@/adapters/types';

const HOSTING_WORKER_DOMAIN = 'd2t4ubtfjuejkc.cloudfront.net';

const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILE_COUNT = 1000;
const USER_MAX_SUBDOMAINS = 5;

const CONTENT_TYPE_MAP: Record<string, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ico: 'image/x-icon',
  webp: 'image/webp',
  avif: 'image/avif',
  txt: 'text/plain',
  xml: 'application/xml',
  webmanifest: 'application/manifest+json',
};

function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return (ext && CONTENT_TYPE_MAP[ext]) || 'application/octet-stream';
}

interface DeployResult {
  subdomain: string;
  url: string;
  fileCount: number;
  totalSize: number;
}

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

export async function handleCreateHosting(c: Context<AppType>): Promise<Response> {
  return deployHosting(c, false);
}

export async function handleUpdateHosting(c: Context<AppType>): Promise<Response> {
  return deployHosting(c, true);
}

async function deployHosting(c: Context<AppType>, isUpdate: boolean): Promise<Response> {
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const formData = await c.req.formData();
  const name = c.req.param('name') || (formData.get('subdomain') as string);

  if (!name) {
    throw new AppError(400, ErrorCode.INVALID_SUBDOMAIN_NAME, 'Subdomain name is required');
  }
  const files: { path: string; data: ArrayBuffer; size: number }[] = [];
  let hasIndexHtml = false;
  let totalSize = 0;

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      continue;
    }

    const file = value as unknown as {
      arrayBuffer(): Promise<ArrayBuffer>;
      size: number;
      name: string;
    };
    const filepath = file.name || key;
    const data = await file.arrayBuffer();
    const size = data.byteLength;

    if (size > MAX_FILE_SIZE) {
      throw new AppError(
        400,
        ErrorCode.FILE_TOO_LARGE,
        `File '${filepath}' exceeds maximum size of 10MB`
      );
    }

    totalSize += size;
    if (totalSize > MAX_TOTAL_SIZE) {
      throw new AppError(400, ErrorCode.FILE_TOO_LARGE, 'Total upload size exceeds 50MB');
    }

    files.push({ path: filepath, data, size });

    if (filepath === 'index.html') {
      hasIndexHtml = true;
    }
  }

  if (files.length > MAX_FILE_COUNT) {
    throw new AppError(
      400,
      ErrorCode.TOO_MANY_FILES,
      `Maximum ${MAX_FILE_COUNT} files per deployment`
    );
  }

  if (!hasIndexHtml) {
    throw new AppError(400, ErrorCode.INDEX_HTML_REQUIRED, 'Deployment must contain index.html');
  }

  const existingSubdomain = await db.findSubdomainByName(name);

  if (isUpdate) {
    if (!existingSubdomain) {
      throw new AppError(404, ErrorCode.HOSTING_NOT_FOUND, 'Hosting not found');
    }
    if (existingSubdomain.ownerId !== user.userId) {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        "You don't have permission to update this hosting"
      );
    }
  } else {
    if (existingSubdomain) {
      throw new AppError(400, ErrorCode.HOSTING_ALREADY_EXISTS, 'Subdomain already exists');
    }

    const validationResult = validateSubdomainName(name);
    if (!validationResult.isValid && validationResult.error) {
      throw new AppError(400, ErrorCode.INVALID_SUBDOMAIN_NAME, validationResult.error);
    }

    const userDomains = await db.findSubdomainsByOwner(user.userId);
    const regularDomains = userDomains.filter((d) => !d.name.startsWith('_'));
    if (regularDomains.length >= USER_MAX_SUBDOMAINS) {
      throw new AppError(
        400,
        ErrorCode.MAX_SUBDOMAIN_REACHED,
        `User has reached the maximum number of domains (${USER_MAX_SUBDOMAINS})`
      );
    }
  }

  const storage = c.get('storage');
  const prefix = `sites/${name}/`;

  // Clean up old files
  await deleteStoragePrefix(storage, prefix);

  // Upload all files
  await Promise.all(
    files.map((file) =>
      storage.put(`${prefix}${file.path}`, file.data, {
        contentType: getContentType(file.path),
      })
    )
  );

  const cnameRecord: DNSRecord[] = [{ type: 'CNAME' as const, value: HOSTING_WORKER_DOMAIN }];

  if (!isUpdate) {
    // Create GitHub record file (triggers CI -> PowerDNS -> HE zone transfer)
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
  } else {
    await db.updateSubdomain(name, {});
  }

  const result: DeployResult = {
    subdomain: name,
    url: `https://${name}.is-an.ai`,
    fileCount: files.length,
    totalSize,
  };

  return c.json(result, isUpdate ? 200 : 201);
}
