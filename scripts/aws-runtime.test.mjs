import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
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
    { id: 'dori-user', provider: 'github', providerId: '30494557', email: 'dori@example.com' },
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
      return { Item: accounts.find(({ id }) => id === input.Key.id) };
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

  await t.test('regular accounts get 5 domains and Dori gets 50', async () => {
    assert.equal((await handler(event('/v3/domain/my/limit'), {})).statusCode, 401);

    const doriJwt = await new SignJWT({ sub: 'dori-user', name: 'Dori' })
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime('5m')
      .sign(privateKey);
    const doriHeaders = { authorization: `Bearer ${doriJwt}` };
    for (const [accountHeaders, limit] of [
      [headers, 5],
      [doriHeaders, 50],
    ]) {
      const result = await handler(
        event('/v3/domain/my/limit', 'GET', undefined, accountHeaders),
        {}
      );
      assert.equal(result.statusCode, 200);
      assert.deepEqual(JSON.parse(result.body), { limit });
    }

    for (const [ownerId, prefix, count] of [
      ['test-user', 'regular', 3],
      ['dori-user', 'dori', 49],
    ]) {
      for (let i = 0; i < count; i++) {
        const name = `${prefix}-${i}`;
        domains.set(name, { id: name, name, ownerId, record: '[]' });
      }
    }
    domains.set('_vercel.dori-0', {
      id: 'dori-vendor',
      name: '_vercel.dori-0',
      ownerId: 'dori-user',
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

    const doriAllowed = await createDomain('dori-extra', doriHeaders);
    assert.equal(doriAllowed.statusCode, 200);
    const doriDenied = await createDomain('dori-over-limit', doriHeaders);
    assert.equal(doriDenied.statusCode, 400);
    assert.match(doriDenied.body, /^\[40403\].*\(50\)$/);
    assert.equal(githubWrites.length, 2);

    const adminCount = await handler(
      event('/admin/domain-count?email=dori@example.com', 'GET', undefined, {
        'x-admin-key': 'test-admin',
      }),
      {}
    );
    assert.deepEqual(JSON.parse(adminCount.body), {
      email: 'dori@example.com',
      count: 50,
      limit: 50,
      allowed: false,
    });
  });
});
