import type { CloudFrontResponseEvent, CloudFrontResponseResult } from 'aws-lambda';

const HASHED_FILE_RE = /\.[a-f0-9]{8,}\.\w+$/;

export const handler = async (
  event: CloudFrontResponseEvent
): Promise<CloudFrontResponseResult> => {
  const response = event.Records[0].cf.response;
  const request = event.Records[0].cf.request;
  const uri = request.uri;
  const contentType = response.headers['content-type']?.[0]?.value || '';

  // Cache control based on content type
  if (contentType.includes('text/html')) {
    response.headers['cache-control'] = [{ key: 'Cache-Control', value: 'no-cache' }];
  } else if (HASHED_FILE_RE.test(uri)) {
    response.headers['cache-control'] = [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ];
  } else if (!response.headers['cache-control']) {
    response.headers['cache-control'] = [{ key: 'Cache-Control', value: 'public, max-age=3600' }];
  }

  // CORS
  response.headers['access-control-allow-origin'] = [
    { key: 'Access-Control-Allow-Origin', value: '*' },
  ];

  return response;
};
