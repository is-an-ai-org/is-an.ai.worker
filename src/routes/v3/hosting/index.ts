import { Hono } from 'hono';
import { authMiddleware } from '@middlewares/auth';
import { AppType } from '@/binding';
import {
  handleCreateHosting,
  handleUpdateHosting,
} from '@/handlers/v3/hosting/deploy-hosting';
import { handleGetHosting } from '@/handlers/v3/hosting/get-hosting';
import { handleGetMyHostings } from '@/handlers/v3/hosting/get-my-hostings';
import { handleDeleteHosting } from '@/handlers/v3/hosting/delete-hosting';

const hosting = new Hono<AppType>();

hosting.get('/my', authMiddleware, handleGetMyHostings);
hosting.post('/', authMiddleware, handleCreateHosting);
hosting.post('/:name', authMiddleware, handleCreateHosting);
hosting.put('/:name', authMiddleware, handleUpdateHosting);
hosting.get('/:name', authMiddleware, handleGetHosting);
hosting.delete('/:name', authMiddleware, handleDeleteHosting);

export { hosting };
