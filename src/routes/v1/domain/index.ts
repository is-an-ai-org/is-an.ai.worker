import { Hono } from 'hono';
import {
  createSubdomainRequestSchema,
  handleCreateSubdomain,
} from '@/handlers/v1/domain/create-subdomain';
import { handleDeleteSubdomain } from '@/handlers/v1/domain/delete-subdomain';
import { handleFindAllSubdomain } from '@/handlers/v1/domain/find-all-subdomain';
import { handleFindByIdSubdomain } from '@/handlers/v1/domain/find-by-id-subdomain';
import { handleFindByNameSubdomain } from '@/handlers/v1/domain/find-by-name-subdomain';
import { handleFindMySubdomain } from '@/handlers/v1/domain/find-my-subdomain';
import {
  handleUpdateSubdomain,
  updateSubdomainRequestSchema,
} from '@/handlers/v1/domain/update-subdomain';
import { authMiddleware } from '@middlewares/auth';
import { AppType } from '@/binding';
import { zValidator } from '@hono/zod-validator';
const domain = new Hono<AppType>();

domain.get('/', handleFindAllSubdomain);
domain.get('/id/:id', handleFindByIdSubdomain);
domain.get('/name/:subdomainName', handleFindByNameSubdomain);

// Private routes
domain.get('/my', authMiddleware, handleFindMySubdomain);

/**
 * @deprecated Create Subdomain is deprecated. Use v2 API instead.
 */
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
