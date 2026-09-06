import { Context } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';
import { validateSubdomainName } from '@/utils/subdomain';

const MAX_FILE_COUNT = 1000;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const USER_MAX_SUBDOMAINS = 5;

interface FileEntry {
  path: string;
  size: number;
  contentType: string;
}

interface PrepareRequest {
  files: FileEntry[];
}

interface PrepareResponse {
  uploadUrls: { path: string; url: string }[];
}

export async function handlePrepareHosting(c: Context<AppType>): Promise<Response> {
  const name = c.req.param('name');
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  if (!name) {
    throw new AppError(400, ErrorCode.INVALID_SUBDOMAIN_NAME, 'Subdomain name is required');
  }

  const body: PrepareRequest = await c.req.json();

  if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
    throw new AppError(400, ErrorCode.INDEX_HTML_REQUIRED, 'files array is required');
  }

  if (body.files.length > MAX_FILE_COUNT) {
    throw new AppError(
      400,
      ErrorCode.TOO_MANY_FILES,
      `Maximum ${MAX_FILE_COUNT} files per deployment`
    );
  }

  const hasIndexHtml = body.files.some((f) => f.path === 'index.html');
  if (!hasIndexHtml) {
    throw new AppError(400, ErrorCode.INDEX_HTML_REQUIRED, 'Deployment must contain index.html');
  }

  let totalSize = 0;
  for (const file of body.files) {
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(
        400,
        ErrorCode.FILE_TOO_LARGE,
        `File '${file.path}' exceeds maximum size of 10MB`
      );
    }
    totalSize += file.size;
  }
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new AppError(400, ErrorCode.FILE_TOO_LARGE, 'Total upload size exceeds 50MB');
  }

  const existingSubdomain = await db.findSubdomainByName(name);

  if (existingSubdomain) {
    if (existingSubdomain.ownerId !== user.userId) {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        "You don't have permission to update this hosting"
      );
    }
  } else {
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

  const uploadUrls = await Promise.all(
    body.files.map(async (file) => ({
      path: file.path,
      url: await storage.getPresignedUploadUrl(
        `${prefix}${file.path}`,
        file.contentType || 'application/octet-stream',
        3600
      ),
    }))
  );

  return c.json({ uploadUrls } satisfies PrepareResponse);
}
