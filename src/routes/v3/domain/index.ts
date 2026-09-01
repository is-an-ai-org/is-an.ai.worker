import { Hono } from 'hono';
import { authMiddleware } from '@middlewares/auth';
import { AppType } from '@/binding';
import { zValidator } from '@hono/zod-validator';
import {
  createSubdomainRequestSchema,
  handleCreateSubdomain,
} from '@/handlers/v3/domain/create-subdomain';
import { handleDeleteSubdomain } from '@/handlers/v3/domain/delete-subdomain';
import { handleFindAllSubdomain } from '@/handlers/v3/domain/find-all-subdomain';
import { handleFindByIdSubdomain } from '@/handlers/v3/domain/find-by-id-subdomain';
import { handleFindByNameSubdomain } from '@/handlers/v3/domain/find-by-name-subdomain';
import { handleFindMySubdomain } from '@/handlers/v3/domain/find-my-subdomain';
import {
  handleUpdateSubdomain,
  updateSubdomainRequestSchema,
} from '@/handlers/v3/domain/update-subdomain';
import { cache } from 'hono/cache';

const domain = new Hono<AppType>();

// Public routes
domain.get(
  '/',
  cache({
    cacheName: '/v3/domain',
    cacheControl: 'max-age=600',
  }),
  handleFindAllSubdomain
);
domain.get('/id/:id', handleFindByIdSubdomain);
domain.get('/name/:subdomainName', handleFindByNameSubdomain);

// Private routes
domain.get('/my', authMiddleware, handleFindMySubdomain);
domain.post(
  '/',
  authMiddleware,
  zValidator('json', createSubdomainRequestSchema),
  handleCreateSubdomain
);
domain.put(
  '/:subdomainName',
  authMiddleware,
  zValidator('json', updateSubdomainRequestSchema),
  handleUpdateSubdomain
);
domain.delete('/:subdomainName', authMiddleware, handleDeleteSubdomain);
export { domain };
