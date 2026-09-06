import { Context } from 'hono';
import { AppError, ErrorCode } from '@/utils/error';
import { nanoid } from 'nanoid';
import { AppType } from '@/binding';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';

export async function handleGitHubLogin(c: Context<AppType>): Promise<Response> {
  try {
    const clientId = c.env.GITHUB_CLIENT_ID;
    const redirectUri = c.env.GITHUB_REDIRECT_URI;
    const clientType = c.req.query('client_type');
    const state = nanoid();

    const stateStore = c.get('stateStore');

    // Store state and clientType (valid for 1 minute)
    await stateStore.put(
      `oauth_state:${state}`,
      JSON.stringify({
        state,
        clientType,
        timestamp: Date.now(),
      }),
      { ttlSeconds: 60 }
    );

    // Redirect to GitHub OAuth page
    const authUrl = new URL(GITHUB_AUTH_URL);
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', 'user:email');

    return c.redirect(authUrl.toString());
  } catch (error) {
    throw new AppError(500, ErrorCode.GITHUB_AUTH_ERROR, 'Failed to start GitHub login');
  }
}
