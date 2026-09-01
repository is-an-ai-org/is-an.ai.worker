import { Context } from 'hono';
import { AppType } from '@/binding';
import { AppError, ErrorCode } from '@utils/error';
import { importSPKI, exportJWK } from 'jose';

interface JWK {
  kty: 'RSA';
  kid: string;
  alg: 'RS256';
  use: 'sig';
  n: string; // Base64URL encoded modulus
  e: string; // Base64URL encoded exponent
}

interface JWKS {
  keys: JWK[];
}

export async function handleJWKSHandler(c: Context<AppType>): Promise<Response> {
  try {
    const publicKey = c.env.JWT_PUBLIC_KEY;
    const key = await importSPKI(publicKey, 'RS256');
    const jwk = await exportJWK(key);

    const jwks: JWKS = {
      keys: [
        {
          kty: 'RSA',
          kid: '1', // 키 식별자 (필요한 경우 동적으로 생성)
          alg: 'RS256',
          use: 'sig',
          n: jwk.n!,
          e: jwk.e!,
        },
      ],
    };

    return c.json(jwks);
  } catch (error) {
    console.error('Failed to generate JWKS:', error);
    throw new AppError(500, ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to generate JWKS');
  }
}
