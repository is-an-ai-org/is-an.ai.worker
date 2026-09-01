import { drizzle } from 'drizzle-orm/d1';
import { D1Database } from '@cloudflare/workers-types';
import * as schema from '@drizzle/schema';

export const initializeDb = (db: D1Database) => {
  return drizzle(db, { schema });
};
