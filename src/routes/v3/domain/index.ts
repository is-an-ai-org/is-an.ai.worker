import { Hono } from 'hono';
import { authMiddleware } from '@middlewares/auth';
import { AppType } from '@/binding';
import { zValidator } from '@hono/zod-validator';
import { AppError, ErrorCode } from '@utils/error';
import { getSubdomainLimit } from '@/utils/subdomain-limit';
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
const domain = new Hono<AppType>();

domain.get('/', handleFindAllSubdomain);
domain.get('/id/:id', handleFindByIdSubdomain);
domain.get('/name/:subdomainName', handleFindByNameSubdomain);

// Private routes
domain.get('/my', authMiddleware, handleFindMySubdomain);
domain.get('/my/limit', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
  }

  const account = await c.get('db').findUserById(user.userId);
  c.header('Cache-Control', 'private, no-store');
  return c.json({ limit: getSubdomainLimit(account) });
});
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
