import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

import { sql } from 'drizzle-orm';
import { users } from './users';

export const subdomains = sqliteTable('subdomains', {
  id: text('id').primaryKey(),
  name: text('subdomain_name').unique().notNull(),
  description: text('description').notNull(),
  record: text('record').notNull(),
  ownerId: text('owner_id').references(() => users.id),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Subdomain = typeof subdomains.$inferSelect;
export type NewSubdomain = typeof subdomains.$inferInsert;
