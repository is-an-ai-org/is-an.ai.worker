import { Context } from 'hono';
import { AppType } from '@/binding';
import { nanoid } from 'nanoid';
import { generateToken } from '@utils/jwt';

export async function loginDevUserHandler(c: Context<AppType>): Promise<Response> {
  const db = c.get('db');
  const jwtPrivateKey = c.env.JWT_PRIVATE_KEY;

  // find dev user
  const devUser = await db.findUserByProviderId('dev-user-id');

  let userId: string;
  let userName: string;

  if (devUser) {
    // if dev user exists, use it
    userId = devUser.id;
    userName = devUser.name;
  } else {
    // if dev user not exists, create new one
    const newUser = await db.createUser({
      id: nanoid(),
      name: 'Dev User',
      email: 'dev@example.com',
      provider: 'github',
      providerId: 'dev-user-id',
      hashedPassword: null,
    });

    userId = newUser.id;
    userName = newUser.name;
  }

  // generate JWT token
  const token = await generateToken(
    jwtPrivateKey,
    {
      sub: userId,
      name: userName,
    },
    c.env.JWT_EXPIRES_IN
  );

  return c.json({
    user: {
      id: userId,
      name: userName,
    },
    token,
  });
}
