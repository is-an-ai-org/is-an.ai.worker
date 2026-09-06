import { Context, Next } from 'hono';
import { AppType } from '../binding';
import { DynamoDatabase, DynamoStateStore, S3ObjectStorage } from '@/adapters/aws';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Github } from '@/utils/github/github';

let cachedDb: DynamoDatabase | null = null;
let cachedStateStore: DynamoStateStore | null = null;
let cachedStorage: S3ObjectStorage | null = null;
let cachedSecrets: Record<string, string> | null = null;

async function loadSecrets(region: string, arn: string): Promise<Record<string, string>> {
  if (cachedSecrets) return cachedSecrets;

  const client = new SecretsManagerClient({ region });
  const result = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const raw = JSON.parse(result.SecretString || '{}');
  // Trim PEM keys to avoid whitespace issues with jose
  for (const key of Object.keys(raw)) {
    if (typeof raw[key] === 'string') {
      raw[key] = raw[key].trim();
    }
  }
  cachedSecrets = raw;
  return cachedSecrets!;
}

export async function initMiddleware(c: Context<AppType>, next: Next) {
  // Hono Lambda adapter passes { event, requestContext, lambdaContext } as env,
  // not process.env. Inject Lambda environment variables into c.env.
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !(key in c.env)) {
      (c.env as any)[key] = value;
    }
  }

  const region = c.env.S3_REGION || 'ap-northeast-2';

  if (!cachedDb) {
    cachedDb = new DynamoDatabase(
      region,
      c.env.DYNAMODB_USERS_TABLE,
      c.env.DYNAMODB_SUBDOMAINS_TABLE
    );
  }

  if (!cachedStateStore) {
    cachedStateStore = new DynamoStateStore(region, c.env.DYNAMODB_AUTH_STATE_TABLE);
  }

  if (!cachedStorage) {
    cachedStorage = new S3ObjectStorage(region, c.env.S3_SITES_BUCKET);
  }

  // Load secrets from Secrets Manager
  const secretsArn = c.env.SECRETS_ARN || process.env.SECRETS_ARN;
  if (secretsArn && !cachedSecrets) {
    const secrets = await loadSecrets(region, secretsArn);
    cachedSecrets = secrets;
  }
  // Inject cached secrets into c.env on every request
  if (cachedSecrets) {
    for (const [key, value] of Object.entries(cachedSecrets)) {
      (c.env as any)[key] = value;
    }
  }

  Github.configure(c.env);
  c.set('db', cachedDb);
  c.set('stateStore', cachedStateStore);
  c.set('storage', cachedStorage);
  await next();
}
