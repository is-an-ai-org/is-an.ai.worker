import type { CloudFrontRequestEvent, CloudFrontRequestResult } from 'aws-lambda';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const RESERVED_SUBDOMAINS = new Set(['api', 'www']);
const DOMAIN_SUFFIX = '.is-an.ai';
const S3_BUCKET = 'is-an-ai-sites';
const S3_REGION = 'ap-northeast-2';
const S3_ORIGIN_HOST = `${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;

const s3 = new S3Client({ region: S3_REGION });

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Site not found - is-an.ai</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #fafafa; color: #333;
    }
    .container { text-align: center; padding: 2rem; }
    h1 { font-size: 2rem; font-weight: 600; margin-bottom: 0.5rem; }
    p { color: #666; margin-bottom: 1.5rem; }
    a { color: #2563eb; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Site not found</h1>
    <p>This subdomain doesn't have a site deployed yet.</p>
    <a href="https://is-an.ai">Get your own subdomain at is-an.ai &rarr;</a>
  </div>
</body>
</html>`;

function extractSubdomain(host: string): string | null {
  const hostname = host.split(':')[0].toLowerCase();
  if (!hostname.endsWith(DOMAIN_SUFFIX)) return null;
  const sub = hostname.slice(0, -DOMAIN_SUFFIX.length);
  if (!sub || sub.includes('.')) return null;
  return sub;
}

async function s3Exists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

function setS3Origin(request: any): typeof request {
  request.headers['host'] = [{ key: 'Host', value: S3_ORIGIN_HOST }];
  return request;
}

export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontRequestResult> => {
  const request = event.Records[0].cf.request;
  const host = request.headers['host']?.[0]?.value || '';

  const subdomain = extractSubdomain(host);

  if (subdomain === null) {
    return {
      status: '301',
      statusDescription: 'Moved Permanently',
      headers: { location: [{ key: 'Location', value: 'https://is-an.ai' }] },
    };
  }

  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    return {
      status: '404',
      statusDescription: 'Not Found',
      body: NOT_FOUND_HTML,
      headers: { 'content-type': [{ key: 'Content-Type', value: 'text/html; charset=utf-8' }] },
    };
  }

  let path = request.uri.slice(1);
  if (path.endsWith('/')) path = path.slice(0, -1);

  const prefix = `sites/${subdomain}`;

  // Try exact path
  if (path === '') {
    request.uri = `/${prefix}/index.html`;
    return setS3Origin(request);
  }

  const exactKey = `${prefix}/${path}`;
  if (await s3Exists(exactKey)) {
    request.uri = `/${exactKey}`;
    return setS3Origin(request);
  }

  // Try path/index.html (directory index)
  const dirKey = `${prefix}/${path}/index.html`;
  if (await s3Exists(dirKey)) {
    request.uri = `/${dirKey}`;
    return setS3Origin(request);
  }

  // SPA fallback: serve index.html
  const fallbackKey = `${prefix}/index.html`;
  if (await s3Exists(fallbackKey)) {
    request.uri = `/${fallbackKey}`;
    return setS3Origin(request);
  }

  // No site found
  return {
    status: '404',
    statusDescription: 'Not Found',
    body: NOT_FOUND_HTML,
    headers: { 'content-type': [{ key: 'Content-Type', value: 'text/html; charset=utf-8' }] },
  };
};
