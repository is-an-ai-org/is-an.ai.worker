import { Hono } from 'hono';
import { AppType } from '@/binding';
import { domain } from './domain';

const v2 = new Hono<AppType>();

v2.route('/domain', domain);

export { v2 };
