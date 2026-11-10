import { Hono } from 'hono';
import { AppType } from '@/binding';
import { handleSyncRecords } from '@/handlers/admin/sync-records';
import { handleDomainCount } from '@/handlers/admin/domain-count';
import { handleUpdateAccountTier } from '@/handlers/admin/update-account-tier';
import {
  handleCheckGitHubUserBan,
  handleSetDomainSuspension,
  handleSetGitHubUserBan,
} from '@/handlers/admin/moderation';

const admin = new Hono<AppType>();

admin.post('/sync-records', handleSyncRecords);
admin.get('/domain-count', handleDomainCount);
admin.put('/users/:userId/tier', handleUpdateAccountTier);
admin.get('/github-users/:githubId/ban', handleCheckGitHubUserBan);
admin.put('/github-users/:githubId/ban', handleSetGitHubUserBan);
admin.put('/domains/:name/suspension', handleSetDomainSuspension);

export { admin };
