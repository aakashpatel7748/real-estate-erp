import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';

const ISSUER = 'real-estate-erp-api';
const AUDIENCE = 'real-estate-erp-web';

export interface AccessPayload {
  sub: string;
  sid: string;
}

export function signAccessToken(userId: string, sessionId: string): { token: string; expiresAt: Date } {
  const token = jwt.sign({ sid: sessionId }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
  return { token, expiresAt: new Date(Date.now() + env.ACCESS_TOKEN_TTL_SECONDS * 1000) };
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error('bad payload');
    return { sub: payload.sub, sid: payload.sid };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AppError(401, 'TOKEN_EXPIRED', 'Access token expired');
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid access token');
  }
}
