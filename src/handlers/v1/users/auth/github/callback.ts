import { Context } from 'hono';
import { AppError, ErrorCode } from '@utils/error';
import { generateToken } from '@utils/jwt';
import { nanoid } from 'nanoid';
import { AppType } from '@/binding';
import { setCookie } from 'hono/cookie';

// GitHub API response types
interface GitHubUserResponse {
  id: number;
  login: string;
  name: string | null;
  email: string;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

async function getGitHubUser(accessToken: string): Promise<GitHubUserResponse> {
  try {
    const response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'is-an-ai-worker',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(500, ErrorCode.GITHUB_API_ERROR, `GitHub API error: ${errorText}`);
    }

    const userData = await response.json();
    return userData as GitHubUserResponse;
  } catch (error) {
    console.error('Error in getGitHubUser:', error);
    throw new AppError(500, ErrorCode.GITHUB_API_ERROR, 'Failed to fetch GitHub user');
  }
}

async function getGitHubAccessToken(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!response.ok) {
      throw new AppError(500, ErrorCode.GITHUB_AUTH_ERROR, 'Failed to get access token');
    }

    const data = (await response.json()) as GitHubTokenResponse;
    return data.access_token;
  } catch (error) {
    throw new AppError(500, ErrorCode.GITHUB_AUTH_ERROR, 'Failed to get access token');
  }
}

export async function handleGitHubCallback(c: Context<AppType>): Promise<Response> {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');

    const stateStore = c.get('stateStore');

    // Get state info from state store
    const storedData = await stateStore.get(`oauth_state:${state}`);
    if (!storedData) {
      throw new AppError(400, ErrorCode.INVALID_STATE, 'Invalid state parameter');
    }

    const { clientType } = JSON.parse(storedData);

    if (!code || !state) {
      throw new AppError(400, ErrorCode.INVALID_STATE, 'Invalid state parameter');
    }

    // Delete from state store after use
    await stateStore.delete(`oauth_state:${state}`);

    const clientId = c.env.GITHUB_CLIENT_ID;
    const clientSecret = c.env.GITHUB_CLIENT_SECRET;
    const jwtPrivateKey = c.env.JWT_PRIVATE_KEY;
    const jwtExpiresIn = c.env.JWT_EXPIRES_IN;
    const db = c.get('db');

    // 1. Get access token
    const accessToken = await getGitHubAccessToken(code, clientId, clientSecret);

    // 2. Get user info
    const githubUser = await getGitHubUser(accessToken);

    // 3. Find or create user
    const existingUser = await db.findUserByProviderId(githubUser.id.toString());

    let userId: string;
    let userName: string;

    if (existingUser) {
      userId = existingUser.id;
      userName = existingUser.name;
    } else {
      const newUser = await db.createUser({
        id: nanoid(),
        name: githubUser.name || githubUser.login,
        email: githubUser.email || `${githubUser.login}@users.noreply.github.com`,
        provider: 'github',
        providerId: githubUser.id.toString(),
        hashedPassword: null,
      });

      userId = newUser.id;
      userName = newUser.name;
    }

    // 4. Generate JWT
    const token = await generateToken(
      jwtPrivateKey,
      {
        sub: userId,
        name: userName,
      },
      jwtExpiresIn
    );

    // 5. Clear state and client-type cookies
    setCookie(c, 'github_oauth_state', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 0,
    });
    setCookie(c, 'github_client_type', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 0,
    });

    const userData = {
      id: userId,
      name: userName,
    };

    if (clientType === 'bifrost-client') {
      return c.redirect(`bifrost://auth/callback?token=${token}`);
    }

    return c.redirect(
      `${c.env.FRONTEND_URL}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(userData))}`
    );
  } catch (error) {
    console.error('GitHub callback error:', error);
    if (error instanceof AppError) {
      return c.redirect(
        `${c.env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(JSON.stringify(error))}`
      );
    }
    throw new AppError(500, ErrorCode.GITHUB_AUTH_ERROR, 'Failed to handle GitHub callback');
  }
}
