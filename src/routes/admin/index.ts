import { Hono } from 'hono';
import { AppType } from '@/binding';
import { handleSyncRecords } from '@/handlers/admin/sync-records';
import { handleDomainCount } from '@/handlers/admin/domain-count';
import { handleUpdateAccountTier } from '@/handlers/admin/update-account-tier';

const admin = new Hono<AppType>();

admin.post('/sync-records', handleSyncRecords);
admin.get('/domain-count', handleDomainCount);
admin.put('/users/:userId/tier', handleUpdateAccountTier);

export { admin };
