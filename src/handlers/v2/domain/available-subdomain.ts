import { AppType } from '@/binding';
import { validateSubdomainName } from '@/utils/subdomain';
import { Context } from 'hono';

interface AvailableSubdomainResponse {
  available: boolean;
  error?: string;
}

export const handleAvailableSubdomain = async (c: Context<AppType>): Promise<Response> => {
  const subdomainName = c.req.param('subdomainName');

  const db = c.get('db');

  const { isValid, error } = validateSubdomainName(subdomainName);

  if (!isValid) {
    return c.json({ available: false, error });
  }

  const subdomain = await db.findSubdomainByName(subdomainName);

  if (subdomain) {
    return c.json({ available: false, error: 'Subdomain already exists' });
  }

  return c.json({ available: true });
};
