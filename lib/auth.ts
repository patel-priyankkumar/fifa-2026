import { cookies } from 'next/headers';
import crypto from 'crypto';

const COOKIE_NAME = 'svp_admin';

function secret() {
  return process.env.ADMIN_SESSION_SECRET || 'dev-secret-change-me';
}

export function signSession(value: string) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

export async function setAdminCookie() {
  const token = signSession('admin');
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8
  });
}

export async function clearAdminCookie() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function isAdmin() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return Boolean(token && token === signSession('admin'));
}

export async function requireAdmin() {
  if (!(await isAdmin())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}
