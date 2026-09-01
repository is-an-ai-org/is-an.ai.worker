import { Hono } from 'hono';
import { AppType } from '@/binding';
import { domain } from './domain';
import { hosting } from './hosting';

const v3 = new Hono<AppType>();

v3.route('/domain', domain);
v3.route('/hosting', hosting);

export { v3 };
