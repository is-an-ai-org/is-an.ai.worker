import type { IDatabase, IStateStore, IObjectStorage } from './adapters/types';

export type Bindings = {
  // AWS-specific env vars (set via Lambda environment)
  DYNAMODB_USERS_TABLE: string;
  DYNAMODB_SUBDOMAINS_TABLE: string;
  DYNAMODB_AUTH_STATE_TABLE: string;
  S3_SITES_BUCKET: string;
  S3_REGION: string;
  SECRETS_ARN: string;

  ENV_TYPE: 'prod' | 'dev';

  // From env vars (small values)
  GITHUB_CLIENT_ID: string;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_PAT: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BOT_NAME?: string;
  GITHUB_BOT_EMAIL?: string;
  GITHUB_REDIRECT_URI: string;
  JWT_EXPIRES_IN: string;
  APP_URL: string;
  FRONTEND_URL: string;

  // From Secrets Manager (large PEM keys)
  GITHUB_CLIENT_SECRET: string;
  GITHUB_APP_SECRET: string;
  JWT_PRIVATE_KEY: string;
  JWT_PUBLIC_KEY: string;
  ADMIN_API_KEY: string;
};

export type Variables = {
  db: IDatabase;
  stateStore: IStateStore;
  storage: IObjectStorage;
  user?: {
    userId: string;
    name: string;
  };
};

export type AppType = {
  Bindings: Bindings;
  Variables: Variables;
};
