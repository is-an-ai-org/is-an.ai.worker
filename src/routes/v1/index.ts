import { Hono } from 'hono';
import { AppType } from '@/binding';
import { user } from './user';
import { domain } from './domain';
import { dev } from './dev';

const v1 = new Hono<AppType>();

// User routes
v1.route('/user', user);

v1.route('/domain', domain);

v1.route('/dev', dev);

export { v1 };
