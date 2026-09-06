import { Context } from 'hono';
import { AppError, ErrorCode } from '@utils/error';
import { generateToken } from '@utils/jwt';
import { nanoid } from 'nanoid';
import { AppType } from '@/binding';

interface GitHubUserResponse {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
}

interface DeviceAuthRequest {
  github_access_token: string;
}

/**
 * Exchange a GitHub access token for an is-an.ai JWT.
 * Used by the CLI after completing GitHub Device Flow or with an existing token.
 *
 * POST /v1/user/auth/github/device
 * Body: { github_access_token: string }
 * Response: { token: string, user: { id, name, email } }
 */
export async function handleDeviceAuth(c: Context<AppType>): Promise<Response> {
  const body = await c.req.json<DeviceAuthRequest>();

  if (!body.github_access_token) {
    throw new AppError(400, ErrorCode.INVALID_TOKEN, 'github_access_token is required');
  }

  // Verify the GitHub token and get user info
  const ghResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${body.github_access_token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'is-an.ai.worker',
    },
  });

  if (!ghResponse.ok) {
    throw new AppError(401, ErrorCode.GITHUB_AUTH_ERROR, 'Invalid GitHub access token');
  }

  const githubUser = (await ghResponse.json()) as GitHubUserResponse;

  const db = c.get('db');

  // Find or create user (same logic as OAuth callback)
  const existingUser = await db.findUserByProviderId(githubUser.id.toString());

  let userId: string;
  let userName: string;
  let userEmail: string;

  if (existingUser) {
    userId = existingUser.id;
    userName = existingUser.name;
    userEmail = existingUser.email;
  } else {
    const email = githubUser.email || `${githubUser.login}@users.noreply.github.com`;
    const newUser = await db.createUser({
      id: nanoid(),
      name: githubUser.name || githubUser.login,
      email,
      provider: 'github',
      providerId: githubUser.id.toString(),
      hashedPassword: null,
    });

    userId = newUser.id;
    userName = newUser.name;
    userEmail = newUser.email;
  }

  const token = await generateToken(
    c.env.JWT_PRIVATE_KEY,
    { sub: userId, name: userName },
    c.env.JWT_EXPIRES_IN
  );

  return c.json({
    token,
    user: { id: userId, name: userName, email: userEmail },
  });
}
