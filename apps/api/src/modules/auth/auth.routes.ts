import { Router, type CookieOptions, type Request, type Response } from 'express';
import {
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  selectCompanySchema,
  verifyEmailSchema,
  type AcceptInviteInput,
  type LoginInput,
  type RegisterInput,
} from '@erp/shared';
import { z } from 'zod';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { credentialLimiter, CSRF_COOKIE, requireCsrf } from '../../middleware/security';
import { body, params, validate } from '../../middleware/validate';
import { randomToken } from '../../utils/crypto';
import { ok } from '../../utils/http';
import { unauthenticated } from '../../utils/errors';
import { Session } from './auth.models';
import * as auth from './auth.service';
import { verifyAccessToken } from './tokens';

export const REFRESH_COOKIE = 'erp_rt';
const REFRESH_PATH = '/api/v1/auth';

function cookieBase(): CookieOptions {
  return { secure: env.cookieSecure, sameSite: 'strict' };
}

function meta(req: Request) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

/** Sets the rotating refresh cookie (HttpOnly) and a readable CSRF cookie, returns the auth payload. */
async function respondWithSession(req: Request, res: Response, issued: auth.IssuedSession, status = 200) {
  res.cookie(REFRESH_COOKIE, issued.refreshToken, {
    ...cookieBase(),
    httpOnly: true,
    path: REFRESH_PATH,
    expires: issued.refreshExpiresAt,
  });
  res.cookie(CSRF_COOKIE, randomToken(24), { ...cookieBase(), httpOnly: false, path: '/', expires: issued.refreshExpiresAt });
  const session = await Session.findById(issued.sessionId).select('activeCompanyId userId').lean();
  const context = await auth.getAuthContext(
    String(session!.userId),
    session?.activeCompanyId ? String(session.activeCompanyId) : undefined,
  );
  ok(
    res,
    { ...context, accessToken: issued.accessToken, accessTokenExpiresAt: issued.accessTokenExpiresAt.toISOString() },
    undefined,
    status,
  );
}

function clearSessionCookies(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), httpOnly: true, path: REFRESH_PATH });
  res.clearCookie(CSRF_COOKIE, { ...cookieBase(), path: '/' });
}

export const authRouter = Router();

authRouter.post('/register', credentialLimiter, validate({ body: registerSchema }), async (req, res) => {
  const issued = await auth.register(body<RegisterInput>(req), meta(req));
  await respondWithSession(req, res, issued, 201);
});

authRouter.post('/login', credentialLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = body<LoginInput>(req);
  const issued = await auth.login(email, password, meta(req));
  await respondWithSession(req, res, issued);
});

authRouter.post('/refresh', requireCsrf, async (req, res) => {
  try {
    const issued = await auth.refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
    await respondWithSession(req, res, issued);
  } catch (err) {
    if ((err as { status?: number }).status === 401) clearSessionCookies(res);
    throw err;
  }
});

authRouter.post('/logout', requireCsrf, async (req, res) => {
  await auth.revokeSessionByToken(req.cookies?.[REFRESH_COOKIE]);
  clearSessionCookies(res);
  ok(res, { loggedOut: true });
});

authRouter.get('/me', authenticate, async (req, res) => {
  ok(res, await auth.getAuthContext(req.auth!.userId, req.auth!.companyId));
});

authRouter.post('/select-company', authenticate, validate({ body: selectCompanySchema }), async (req, res) => {
  const { companyId } = body<{ companyId: string }>(req);
  await auth.selectCompany(req.auth!.userId, req.auth!.sessionId, companyId);
  ok(res, await auth.getAuthContext(req.auth!.userId, companyId));
});

authRouter.get('/sessions', authenticate, async (req, res) => {
  ok(res, await auth.listSessions(req.auth!.userId, req.auth!.sessionId));
});

authRouter.delete(
  '/sessions/:id',
  authenticate,
  validate({ params: z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }) }),
  async (req, res) => {
    await auth.revokeSession(req.auth!.userId, params<{ id: string }>(req).id);
    ok(res, { revoked: true });
  },
);

authRouter.post('/change-password', authenticate, validate({ body: changePasswordSchema }), async (req, res) => {
  const { currentPassword, newPassword } = body<{ currentPassword: string; newPassword: string }>(req);
  await auth.changePassword(req.auth!.userId, req.auth!.sessionId, currentPassword, newPassword);
  ok(res, { changed: true });
});

authRouter.post('/verify-email', validate({ body: verifyEmailSchema }), async (req, res) => {
  await auth.verifyEmail(body<{ token: string }>(req).token);
  ok(res, { verified: true });
});

authRouter.post('/resend-verification', authenticate, async (req, res) => {
  await auth.resendVerification(req.auth!.userId);
  ok(res, { sent: true });
});

authRouter.post('/forgot-password', credentialLimiter, validate({ body: forgotPasswordSchema }), async (req, res) => {
  await auth.forgotPassword(body<{ email: string }>(req).email);
  ok(res, { message: 'If an account exists for this email, a reset link has been sent.' });
});

authRouter.post('/reset-password', credentialLimiter, validate({ body: resetPasswordSchema }), async (req, res) => {
  const { token, password } = body<{ token: string; password: string }>(req);
  await auth.resetPassword(token, password, meta(req));
  clearSessionCookies(res);
  ok(res, { reset: true });
});

authRouter.get('/invitations/:token', validate({ params: z.object({ token: z.string().min(20).max(200) }) }), async (req, res) => {
  ok(res, await auth.describeInvitation(params<{ token: string }>(req).token));
});

authRouter.post('/accept-invite', credentialLimiter, validate({ body: acceptInviteSchema }), async (req, res) => {
  // Optional authentication: existing users accept while signed in.
  let currentUserId: string | undefined;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      currentUserId = verifyAccessToken(header.slice(7)).sub;
    } catch {
      throw unauthenticated('Your session expired. Sign in again to accept the invitation.');
    }
  }
  const result = await auth.acceptInvitation(body<AcceptInviteInput>(req), currentUserId, meta(req));
  if (result.issued) return respondWithSession(req, res, result.issued, 201);
  ok(res, { accepted: true, companyId: result.companyId });
});
