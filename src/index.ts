import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { v1 } from './routes/v1';
import { AppType } from './binding';
import { initMiddleware } from './middlewares/init';
import { v2 } from './routes/v2';
import { v3 } from './routes/v3';
import { admin } from './routes/admin';

const app = new Hono<AppType>();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: 'https://is-an.ai',
  })
);
app.use('*', initMiddleware);

// Routes
app.get('/', (c) => c.json({ message: 'Welcome to is-an-ai-worker API' }));
app.route('/v1', v1);
app.route('/v2', v2);
app.route('/v3', v3);
app.route('/admin', admin);

export default app;
