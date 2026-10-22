import { z } from 'zod';
import { email, objectId, requiredText } from './common';

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), 'Include upper-case, lower-case letters and a number');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: requiredText('Name', 100),
  email,
  password: passwordSchema,
  companyName: requiredText('Company name', 150),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const selectCompanySchema = z.object({ companyId: objectId });

export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: requiredText('Name', 100).optional(),
  password: passwordSchema.optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
