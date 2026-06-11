import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/auth';
import { readPeople, writePeople } from '@/lib/jsonStore';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json();
  const name = String(body.name || '').trim();
  const team = String(body.team || '').trim();
  const paid = Boolean(body.paid ?? true);

  if (!name || !team) return NextResponse.json({ error: 'Name and team are required.' }, { status: 400 });

  try {
    const people = await readPeople();
    const entrant = { id: crypto.randomUUID(), name, team, paid, created_at: new Date().toISOString() };
    await writePeople([...people, entrant]);
    return NextResponse.json({ entrant });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not add applicant.' }, { status: 500 });
  }
}
