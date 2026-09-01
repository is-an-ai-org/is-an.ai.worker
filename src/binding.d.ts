import { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { DrizzleD1Database } from '@drizzle/orm/d1';

export type Bindings = {
  DB: D1Database;
  AUTH_STORE: KVNamespace;
  ENV_TYPE: 'prod' | 'dev';

  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;

  GITHUB_APP_SECRET: string;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;

  GITHUB_PAT: string;

  // org 이전용. 미설정이면 Github 클래스의 기본값(현재 운영값)이 그대로 쓰인다.
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BOT_NAME?: string;
  GITHUB_BOT_EMAIL?: string;

  JWT_PRIVATE_KEY: string;
  JWT_PUBLIC_KEY: string;
  JWT_EXPIRES_IN: string;

  APP_URL: string;
  FRONTEND_URL: string;

  ADMIN_API_KEY: string;

  SITES_BUCKET: R2Bucket;
};

export type Variables = {
  db: DrizzleD1Database;
  user?: {
    userId: string;
    name: string;
  };
};

export type AppType = {
  Bindings: Bindings;
  Variables: Variables;
};
