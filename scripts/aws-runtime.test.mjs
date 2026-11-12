import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

function event(path, method = 'GET', body, headers = {}) {
  const url = new URL(path, 'https://api.is-an.ai');
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers: { host: url.host, 'content-type': 'application/json', ...headers },
    requestContext: { http: { method, path: url.pathname, sourceIp: '127.0.0.1' } },
    isBase64Encoded: false,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

test('AWS Lambda entry point, organization settings, database, and S3 upload flow', async (t) => {
  Object.assign(process.env, {
    AWS_ACCESS_KEY_ID: 'test-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    AWS_EC2_METADATA_DISABLED: 'true',
    S3_REGION: 'ap-northeast-2',
    DYNAMODB_USERS_TABLE: 'test-users',
    DYNAMODB_SUBDOMAINS_TABLE: 'test-domains',
    DYNAMODB_AUTH_STATE_TABLE: 'test-state',
    S3_SITES_BUCKET: 'test-sites',
    SECRETS_ARN: '',
    GITHUB_OWNER: 'test-aws-org',
    GITHUB_REPO: 'is-an.ai',
    GITHUB_BOT_NAME: 'test-bot',
    GITHUB_BOT_EMAIL: 'test-bot@example.com',
    GITHUB_CLIENT_ID: 'test-client',
    GITHUB_APP_CLIENT_ID: 'test-app',
    GITHUB_APP_INSTALLATION_ID: '123',
    GITHUB_REDIRECT_URI: 'https://api.is-an.ai/v1/user/auth/github/callback',
  });
  const { default: production } = await import('../dist/lambda.js');
  assert.equal((await production.handler(event('/'), {})).statusCode, 200);
  const outputs = JSON.parse(readFileSync('dist/api-metafile.json')).outputs;
  for (const output of Object.values(outputs)) {
    for (const dependency of output.imports) {
      assert.ok(
        !dependency.external || builtinModules.includes(dependency.path.replace(/^node:/, ''))
      );
    }
  }

  buildSync({
    entryPoints: ['src/lambda.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    outfile: 'dist/test-lambda.cjs',
  });
  const {
    default: { handler },
  } = await import('../dist/test-lambda.cjs');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  let secretReads = 0;
  process.env.SECRETS_ARN = 'test-secrets';
  t.mock.method(SecretsManagerClient.prototype, 'send', async (command) => {
    assert.equal(command.input.SecretId, 'test-secrets');
    secretReads++;
    return {
      SecretString: JSON.stringify({
        JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }),
        GITHUB_APP_SECRET: pem,
        ADMIN_API_KEY: 'test-admin',
        ACCOUNT_TIER_ADMIN_KEY: 'test-tier-admin',
      }),
    };
  });
  const domains = new Map([
    [
      'existing-site',
      { id: 'existing', name: 'existing-site', ownerId: 'test-user', record: '[]' },
    ],
    [
      '_vercel.existing-site',
      { id: 'vendor', name: '_vercel.existing-site', ownerId: 'test-user', record: '[]' },
    ],
  ]);
  const accounts = [
    { id: 'test-user', provider: 'github', providerId: '111', email: 'test@example.com' },
    { id: 'second-user', provider: 'github', providerId: '222', email: 'second@example.com' },
  ];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (command) => {
    const input = command.input;
    if (command.constructor.name === 'PutCommand') {
      if (input.TableName === 'test-domains') domains.set(input.Item.name, input.Item);
      else assert.equal(input.TableName, 'test-state');
      return {};
    }
    if (command.constructor.name === 'GetCommand') {
      assert.equal(input.TableName, 'test-users');
      assert.equal(input.ConsistentRead, true);
      return { Item: accounts.find(({ id }) => id === input.Key.id) };
    }
    if (command.constructor.name === 'UpdateCommand') {
      assert.equal(input.TableName, 'test-users');
      assert.equal(input.ConditionExpression, 'attribute_exists(id)');
      const account = accounts.find(({ id }) => id === input.Key.id);
      if (!account) throw new ConditionalCheckFailedException({ $metadata: {} });
      account.tier = input.ExpressionAttributeValues[':tier'];
      return {};
    }
    assert.ok(['QueryCommand', 'ScanCommand'].includes(command.constructor.name));
    if (input.TableName === 'test-users') {
      return {
        Items: accounts.filter(({ email }) => email === input.ExpressionAttributeValues[':e']),
      };
    }
    assert.equal(input.TableName, 'test-domains');
    const allDomains = [...domains.values()];
    if (input.IndexName === 'name-index') {
      return {
        Items: allDomains.filter(({ name }) => name === input.ExpressionAttributeValues[':n']),
      };
    }
    if (input.IndexName === 'owner-index') {
      return {
        Items: allDomains.filter(
          ({ ownerId }) => ownerId === input.ExpressionAttributeValues[':o']
        ),
      };
    }
    return { Items: allDomains };
  });
  const githubWrites = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const target = new URL(url);
    assert.equal(target.hostname, 'api.github.com');
    if (target.pathname === '/app/installations/123/access_tokens') {
      return Response.json({ token: 'test-github-token' });
    }
    assert.ok(target.pathname.startsWith('/repos/test-aws-org/is-an.ai/'));
    if (options.method === 'PUT') {
      githubWrites.push(JSON.parse(options.body));
      return Response.json({});
    }
    assert.equal(target.pathname, '/repos/test-aws-org/is-an.ai/git/trees/main');
    return Response.json({
      tree: [...domains.keys()]
        .filter((name) => name !== 'unlisted-site')
        .map((name) => ({ path: `records/${name}.json`, type: 'blob' })),
    });
  });

  const login = await handler(event('/v1/user/auth/github'), {});
  assert.equal(login.statusCode, 302);
  assert.equal(new URL(login.headers.location).searchParams.get('client_id'), 'test-client');
  domains.set('unlisted-site', {
    id: 'unlisted',
    name: 'unlisted-site',
    ownerId: 'test-user',
    record: '[]',
  });
  for (const version of ['v1', 'v3']) {
    const response = await handler(event(`/${version}/domain`), {});
    assert.equal(response.statusCode, 200);
    assert.ok(
      !JSON.parse(response.body).some((domain) => domain.subdomainName === 'unlisted-site')
    );
    assert.ok(domains.has('unlisted-site'));
  }
  domains.delete('unlisted-site');
  assert.equal(
    (await handler(event('/admin/domain-count?email=test@example.com'), {})).statusCode,
    401
  );
  const count = await handler(
    event('/admin/domain-count?email=test@example.com', 'GET', undefined, {
      'x-admin-key': 'test-admin',
    }),
    {}
  );
  assert.equal(JSON.parse(count.body).count, 1);

  for (const step of ['prepare', 'confirm']) {
    assert.equal(
      (await handler(event(`/v3/hosting/new-site/${step}`, 'POST', {}), {})).statusCode,
      401
    );
  }
  const { SignJWT } = await import('jose');
  const jwt = await new SignJWT({ sub: 'test-user', name: 'Test User' })
    .setProtectedHeader({ alg: 'RS256' })
    .setExpirationTime('5m')
    .sign(privateKey);
  const headers = { authorization: `Bearer ${jwt}` };
  await t.test(
    'domain create and update routes reject duplicate records before writing',
    async () => {
      const txt = { type: 'TXT', value: 'kata-verify=duplicate' };
      const writesBefore = githubWrites.length;
      for (const [method, path] of [
        ['POST', '/v1/domain'],
        ['POST', '/v2/domain'],
        ['POST', '/v3/domain'],
        ['PUT', '/v1/domain/existing-site'],
        ['PUT', '/v3/domain/existing-site'],
      ]) {
        const result = await handler(
          event(
            path,
            method,
            {
              subdomainName: 'duplicate-site',
              description: '',
              record: [txt, txt],
            },
            headers
          ),
          {}
        );
        assert.equal(result.statusCode, 400, result.body);
        assert.match(result.body, /Duplicate DNS record/);
      }
      assert.equal(githubWrites.length, writesBefore);
    }
  );
  const files = [{ path: 'index.html', size: 5, contentType: 'text/html' }];
  const prepared = await handler(
    event('/v3/hosting/new-site/prepare', 'POST', { files }, headers),
    {}
  );
  assert.equal(prepared.statusCode, 200);
  const upload = new URL(JSON.parse(prepared.body).uploadUrls[0].url);
  assert.equal(upload.hostname, 'test-sites.s3.ap-northeast-2.amazonaws.com');
  assert.equal(upload.pathname, '/sites/new-site/index.html');
  assert.ok(upload.searchParams.has('X-Amz-Signature'));
  const confirmed = await handler(
    event('/v3/hosting/new-site/confirm', 'POST', { files }, headers),
    {}
  );
  assert.equal(confirmed.statusCode, 201);
  assert.equal(githubWrites.length, 1);
  assert.equal(githubWrites[0].author.name, 'test-bot');
  const record = JSON.parse(Buffer.from(githubWrites[0].content, 'base64').toString());
  assert.equal(record.record[0].value, 'd2t4ubtfjuejkc.cloudfront.net');
  assert.ok(domains.has('new-site'));
  assert.equal(secretReads, 1);

  await t.test(
    'the admin tier API changes quota enforcement for the targeted account',
    async () => {
      assert.equal((await handler(event('/v3/domain/my/limit'), {})).statusCode, 401);

      const secondJwt = await new SignJWT({ sub: 'second-user', name: 'Second User' })
        .setProtectedHeader({ alg: 'RS256' })
        .setExpirationTime('5m')
        .sign(privateKey);
      const secondHeaders = { authorization: `Bearer ${secondJwt}` };
      const readLimit = async (accountHeaders) => {
        const result = await handler(
          event('/v3/domain/my/limit', 'GET', undefined, accountHeaders),
          {}
        );
        assert.equal(result.statusCode, 200);
        return JSON.parse(result.body).limit;
      };
      const setTier = (id, tier, key = 'test-tier-admin') =>
        handler(event(`/admin/users/${id}/tier`, 'PUT', { tier }, { 'x-admin-key': key }), {});

      assert.equal(await readLimit(secondHeaders), 5);
      assert.equal((await setTier('second-user', 'pro', 'test-admin')).statusCode, 401);
      assert.equal((await setTier('second-user', 'enterprise')).statusCode, 400);
      assert.equal((await setTier('missing-user', 'pro')).statusCode, 404);
      assert.equal(await readLimit(secondHeaders), 5);

      const upgraded = await setTier('second-user', 'pro');
      assert.equal(upgraded.statusCode, 200);
      assert.deepEqual(JSON.parse(upgraded.body), {
        userId: 'second-user',
        tier: 'pro',
        limit: 50,
      });
      assert.equal(await readLimit(secondHeaders), 50);
      assert.equal(await readLimit(headers), 5);

      for (const [ownerId, prefix, count] of [
        ['test-user', 'regular', 3],
        ['second-user', 'pro', 49],
      ]) {
        for (let i = 0; i < count; i++) {
          const name = `${prefix}-${i}`;
          domains.set(name, { id: name, name, ownerId, record: '[]' });
        }
      }
      domains.set('_vercel.pro-0', {
        id: 'pro-vendor',
        name: '_vercel.pro-0',
        ownerId: 'second-user',
        record: '[]',
      });

      const createDomain = (subdomainName, accountHeaders) =>
        handler(
          event(
            '/v3/domain',
            'POST',
            {
              subdomainName,
              description: '',
              record: [{ type: 'CNAME', value: 'example.com' }],
            },
            accountHeaders
          ),
          {}
        );
      const regularDenied = await createDomain('regular-extra', headers);
      assert.equal(regularDenied.statusCode, 400);
      assert.match(regularDenied.body, /^\[40403\].*\(5\)$/);

      const proAllowed = await createDomain('pro-extra', secondHeaders);
      assert.equal(proAllowed.statusCode, 200);
      const proDenied = await createDomain('pro-over-limit', secondHeaders);
      assert.equal(proDenied.statusCode, 400);
      assert.match(proDenied.body, /^\[40403\].*\(50\)$/);
      assert.equal(githubWrites.length, 2);

      const adminCount = await handler(
        event('/admin/domain-count?email=second@example.com', 'GET', undefined, {
          'x-admin-key': 'test-admin',
        }),
        {}
      );
      assert.deepEqual(JSON.parse(adminCount.body), {
        email: 'second@example.com',
        count: 50,
        limit: 50,
        allowed: false,
      });

      assert.equal((await setTier('second-user', 'free')).statusCode, 200);
      assert.equal(await readLimit(secondHeaders), 5);
      assert.ok(domains.has('pro-extra'));
    }
  );
});

test('record arrays keep distinct values and reject duplicate MX entries', async () => {
  buildSync({
    entryPoints: ['src/utils/github/github.dto.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/test-record-schema.cjs',
  });
  const { recordArraySchema } = await import('../dist/test-record-schema.cjs');
  assert.equal(
    recordArraySchema.safeParse([
      { type: 'TXT', value: 'first' },
      { type: 'TXT', value: 'second' },
      { type: 'CNAME', value: 'example.com' },
      { type: 'TXT', value: 'example.com' },
    ]).success,
    true
  );
  const mx = { preference: 10, exchange: 'mail.example.com' };
  for (const records of [
    [{ type: 'MX', value: [mx, mx] }],
    [
      { type: 'MX', value: [mx] },
      { type: 'MX', value: [mx] },
    ],
  ])
    assert.equal(recordArraySchema.safeParse(records).success, false);
  assert.equal(
    recordArraySchema.safeParse([{ type: 'MX', value: [mx, { ...mx, preference: 20 }] }]).success,
    true
  );
});
