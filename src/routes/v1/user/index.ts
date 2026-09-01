import { Hono } from 'hono';
import { AppType } from '@/binding';
import { handleGitHubLogin } from '@/handlers/v1/users/auth/github/login';
import { handleGitHubCallback } from '@/handlers/v1/users/auth/github/callback';
import { handleDeviceAuth } from '@/handlers/v1/users/auth/github/device';
import { handleJWKSHandler } from '@/handlers/v1/users/auth/jwks';

const user = new Hono<AppType>();

// GitHub OAuth
user.get('/auth/github', handleGitHubLogin);
user.get('/auth/github/callback', handleGitHubCallback);
user.post('/auth/github/device', handleDeviceAuth);

user.get('/auth/jwks', handleJWKSHandler);

export { user };
