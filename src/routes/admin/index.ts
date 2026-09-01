import { Hono } from 'hono';
import { AppType } from '@/binding';
import { handleSyncRecords } from '@/handlers/admin/sync-records';
import { handleDomainCount } from '@/handlers/admin/domain-count';

const admin = new Hono<AppType>();

admin.post('/sync-records', handleSyncRecords);
admin.get('/domain-count', handleDomainCount);

export { admin };
