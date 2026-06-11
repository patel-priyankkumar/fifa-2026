import { NextResponse } from 'next/server';
import { setAdminCookie } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.password !== (process.env.ADMIN_PASSWORD || 'svp6931')) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
