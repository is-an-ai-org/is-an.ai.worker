import { Hono } from 'hono';
import { AppType } from '@/binding';
import { devMiddleware } from '@middlewares/dev';
import { loginDevUserHandler } from '@/handlers/v1/dev/login-dev-user';

const dev = new Hono<AppType>();

dev.use('*', devMiddleware);

// dev login
dev.post('/login', loginDevUserHandler);

export { dev };
