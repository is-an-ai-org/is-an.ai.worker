import { Context, Next } from 'hono';
import { AppType } from '../binding';
import { initializeDb } from '@/config/db';
import { Github } from '@/utils/github/github';

export async function initMiddleware(c: Context<AppType>, next: Next) {
  // org/봇 정체성을 env에서 주입한다. 값이 없으면 기본값(현재 운영값)이 유지된다.
  Github.configure(c.env);

  const db = initializeDb(c.env.DB);
  c.set('db', db);
  await next();
}
