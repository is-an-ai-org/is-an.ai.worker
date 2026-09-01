import { AppType } from '@/binding';
import { validateSubdomainName } from '@/utils/subdomain';
import { subdomains } from '@drizzle/schema/domain';
import { sql } from 'drizzle-orm';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import { Context } from 'hono';
import { z } from 'zod';

interface AvailableSubdomainResponse {
  available: boolean;
  error?: string;
}

export const handleAvailableSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const subdomainName = c.req.param('subdomainName');

  const db: DrizzleD1Database = c.get('db');

  const { isValid, error } = validateSubdomainName(subdomainName);

  if (!isValid) {
    return c.json({ available: false, error });
  }

  const subdomain = await db
    .select()
    .from(subdomains)
    .where(sql`lower(${subdomains.name}) = lower(${subdomainName})`)
    .get();

  if (subdomain) {
    return c.json({ available: false, error: 'Subdomain already exists' });
  }

  return c.json({ available: true });
};
