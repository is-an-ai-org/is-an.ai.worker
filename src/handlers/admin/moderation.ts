import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppType } from '@/binding';
import { Github } from '@/utils/github/github';
import { validateSubdomainName } from '@/utils/subdomain';
import { AppError, ErrorCode } from '@utils/error';

const githubIdSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);
const banSchema = z.object({ banned: z.boolean() }).strict();
const suspensionSchema = z.object({ suspended: z.boolean() }).strict();

function requireKey(c: Context<AppType>, key: string | undefined): void {
  const expected = Buffer.from(key ?? '');
  const provided = Buffer.from(c.req.header('X-Admin-Key') ?? '');
  if (
    !expected.length ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid moderation key');
  }
}

function readGitHubId(value: string): string {
  const result = githubIdSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Expected a numeric GitHub user ID');
  }
  return result.data;
}

export async function handleSetGitHubUserBan(c: Context<AppType, '/github-users/:githubId/ban'>) {
  requireKey(c, c.env.MODERATION_API_KEY);
  const githubId = readGitHubId(c.req.param('githubId'));
  const body = banSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Expected a boolean banned value');
  }

  const { banned } = body.data;
  await c.get('db').setGitHubUserBan(githubId, banned);
  return c.json({ githubId, banned });
}

export async function handleCheckGitHubUserBan(c: Context<AppType, '/github-users/:githubId/ban'>) {
  requireKey(c, c.env.PR_MODERATION_KEY);
  const githubId = readGitHubId(c.req.param('githubId'));
  const banned = await c.get('db').isGitHubUserBanned(githubId);
  c.header('Cache-Control', 'no-store');
  return c.body(null, banned ? 403 : 204);
}

export async function handleSetDomainSuspension(c: Context<AppType, '/domains/:name/suspension'>) {
  requireKey(c, c.env.MODERATION_API_KEY);
  const body = suspensionSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Expected a boolean suspended value');
  }

  const name = c.req.param('name').toLowerCase();
  const validation = validateSubdomainName(name);
  if (!validation.isValid || validation.isVendor || name === 'schema') {
    throw new AppError(
      400,
      ErrorCode.INVALID_SUBDOMAIN_NAME,
      'Expected a registered subdomain name'
    );
  }

  const token = await Github.createTokenforGitHubApp(
    c.env.GITHUB_APP_SECRET,
    c.env.GITHUB_APP_CLIENT_ID,
    c.env.GITHUB_APP_INSTALLATION_ID
  );
  const names = await Github.getDomainDeterminationDirectory(token);
  const matches = names.filter((registered) => registered.toLowerCase() === name);
  if (matches.length > 1) {
    throw new AppError(409, ErrorCode.SUBDOMAIN_ALREADY_EXISTS, 'Multiple records match this name');
  }
  const registeredName = matches[0];
  const record =
    registeredName && (await Github.getDomainDeterminationContent(registeredName, token));
  if (!record) {
    throw new AppError(404, ErrorCode.SUBDOMAIN_NOT_FOUND, 'Subdomain record not found');
  }

  const { suspended } = body.data;
  if ((record.subDomain.suspended === true) !== suspended) {
    if (suspended) record.subDomain.suspended = true;
    else delete record.subDomain.suspended;
    await Github.updateDomainDeterminationContent(
      registeredName,
      record.subDomain,
      token,
      record.sha
    );
  }

  return c.json({ name, suspended });
}
