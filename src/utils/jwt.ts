import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import { AppError, ErrorCode } from './error';

// JWT 관련 타입
interface JWTPayload {
  sub: string; // user id
  name: string; // user name
  iat: number; // issued at
  exp: number; // expiration time
}

// PKCS8 형식의 개인키를 가져오는 함수
async function importPrivateKey(key: string) {
  return await importPKCS8(key, 'RS256');
}

// SPKI 형식의 공개키를 가져오는 함수
async function importPublicKey(key: string) {
  return await importSPKI(key, 'RS256');
}

export async function generateToken(
  privateKey: string,
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  expiresIn: string
): Promise<string> {
  try {
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(await importPrivateKey(privateKey));

    return token;
  } catch (error) {
    throw new AppError(500, ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to generate token');
  }
}

export async function verifyToken(publicKey: string, token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, await importPublicKey(publicKey));

    return payload as unknown as JWTPayload;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        throw new AppError(401, ErrorCode.TOKEN_EXPIRED, 'Token has expired');
      }
    }

    throw new AppError(401, ErrorCode.INVALID_TOKEN, 'Invalid token');
  }
}
