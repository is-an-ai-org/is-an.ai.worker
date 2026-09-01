import { Hono } from 'hono';
import {
  createSubdomainRequestSchema,
  handleCreateSubdomain,
} from '@/handlers/v2/domain/create-subdomain';

import { authMiddleware } from '@middlewares/auth';
import { AppType } from '@/binding';
import { zValidator } from '@hono/zod-validator';
import { handleAvailableSubdomain } from '@/handlers/v2/domain/available-subdomain';

const domain = new Hono<AppType>();

domain.post(
  '/',
  authMiddleware,
  zValidator('json', createSubdomainRequestSchema),
  handleCreateSubdomain
);

domain.get('/available/:subdomainName', handleAvailableSubdomain);

export { domain };
