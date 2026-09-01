import { Context } from 'hono';
import { AppType } from '@/binding';
import { subdomains } from '@drizzle/schema/domain';
import { users } from '@drizzle/schema/users';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { AppError, ErrorCode } from '@utils/error';

interface RecordEntry {
  type: string;
  value: string | { priority: number; exchange: string };
}

interface SyncRecord {
  name: string;
  content?: {
    description?: string;
    owner: {
      github_username?: string;
      email: string;
    };
    record: RecordEntry[];
  };
}

interface SyncRequest {
  added?: SyncRecord[];
  modified?: SyncRecord[];
  deleted?: SyncRecord[];
}

/**
 * Sync record changes from GitHub repo to D1 database.
 * Called by deploy-dns GitHub Action after merging PRs.
 *
 * POST /admin/sync-records
 * Headers: X-Admin-Key: {ADMIN_API_KEY}
 */
export async function handleSyncRecords(c: Context<AppType>): Promise<Response> {
  const adminKey = c.req.header('X-Admin-Key');
  if (!adminKey || adminKey !== c.env.ADMIN_API_KEY) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid admin key');
  }

  const body = await c.req.json<SyncRequest>();
  const db = c.get('db');

  const results = {
    added: 0,
    modified: 0,
    deleted: 0,
    errors: [] as string[],
  };

  // Process added records
  for (const record of body.added || []) {
    if (!record.content) continue;
    try {
      const existing = await db
        .select()
        .from(subdomains)
        .where(sql`lower(${subdomains.name}) = lower(${record.name})`)
        .get();

      if (existing) continue; // Already exists in DB

      const ownerId = await resolveOwnerId(db, record.content.owner.email);

      await db.insert(subdomains).values({
        id: nanoid(),
        name: record.name,
        description: record.content.description || '',
        record: JSON.stringify(record.content.record),
        ownerId,
      });
      results.added++;
    } catch (e) {
      results.errors.push(`add ${record.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Process modified records
  for (const record of body.modified || []) {
    if (!record.content) continue;
    try {
      const existing = await db
        .select()
        .from(subdomains)
        .where(sql`lower(${subdomains.name}) = lower(${record.name})`)
        .get();

      if (existing) {
        await db
          .update(subdomains)
          .set({
            description: record.content.description || existing.description,
            record: JSON.stringify(record.content.record),
          })
          .where(eq(subdomains.id, existing.id));
      } else {
        // Record exists in repo but not DB — create it
        const ownerId = await resolveOwnerId(db, record.content.owner.email);
        await db.insert(subdomains).values({
          id: nanoid(),
          name: record.name,
          description: record.content.description || '',
          record: JSON.stringify(record.content.record),
          ownerId,
        });
      }
      results.modified++;
    } catch (e) {
      results.errors.push(`modify ${record.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Process deleted records
  for (const record of body.deleted || []) {
    try {
      await db.delete(subdomains).where(sql`lower(${subdomains.name}) = lower(${record.name})`);
      results.deleted++;
    } catch (e) {
      results.errors.push(`delete ${record.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return c.json(results);
}

async function resolveOwnerId(db: any, email: string): Promise<string | null> {
  if (!email) return null;
  const user = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .get();
  return user?.id || null;
}
