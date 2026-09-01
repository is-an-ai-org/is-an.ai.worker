import { Context } from 'hono';
import { AppError, ErrorCode } from '@utils/error';
import { generateToken } from '@utils/jwt';
import { users } from '@drizzle/schema/users';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { AppType } from '@/binding';
import { getCookie, setCookie } from 'hono/cookie';

// GitHub API 응답 타입
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
    // Cache에서 state 정보 가져오기
    const storedData = await c.env.AUTH_STORE.get(`oauth_state:${state}`);
    if (!storedData) {
      throw new AppError(400, ErrorCode.INVALID_STATE, 'Invalid state parameter');
    }

    const { clientType } = JSON.parse(storedData);

    if (!code || !state) {
      throw new AppError(400, ErrorCode.INVALID_STATE, 'Invalid state parameter');
    }

    // 사용 후 Cache에서 삭제
    await c.env.AUTH_STORE.delete(`oauth_state:${state}`);

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
    const existingUser = await db.query.users.findFirst({
      where: eq(users.providerId, githubUser.id.toString()),
    });

    let userId: string;
    let userName: string;

    if (existingUser) {
      // 기존 사용자 로그인
      userId = existingUser.id;
      userName = existingUser.name;
    } else {
      // 새 사용자 회원가입
      const newUser = await db
        .insert(users)
        .values({
          id: nanoid(),
          name: githubUser.name || githubUser.login,
          email: githubUser.email || `${githubUser.login}@users.noreply.github.com`,
          provider: 'github',
          providerId: githubUser.id.toString(),
        })
        .returning();

      userId = newUser[0].id;
      userName = newUser[0].name;
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

    // client-type이 없거나 다른 값인 경우 기본 리다이렉트 (웹 클라이언트)
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
