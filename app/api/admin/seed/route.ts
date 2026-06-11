import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readMatches } from '@/lib/jsonStore';

export const dynamic = 'force-dynamic';

export async function POST() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const matches = await readMatches();
  return NextResponse.json({ ok: true, count: matches.length, message: 'JSON schedule is already loaded from data/matches.json.' });
}
