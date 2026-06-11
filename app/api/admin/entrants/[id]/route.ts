import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readPeople, writePeople } from '@/lib/jsonStore';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json();

  try {
    const people = await readPeople();
    const index = people.findIndex((person) => person.id === id);
    if (index === -1) return NextResponse.json({ error: 'Applicant not found.' }, { status: 404 });

    const next = [...people];
    next[index] = {
      ...next[index],
      name: 'name' in body ? String(body.name || '').trim() : next[index].name,
      team: 'team' in body ? String(body.team || '').trim() : next[index].team,
      paid: 'paid' in body ? Boolean(body.paid) : next[index].paid
    };

    await writePeople(next);
    return NextResponse.json({ entrant: next[index] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update applicant.' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    const people = await readPeople();
    await writePeople(people.filter((person) => person.id !== id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not delete applicant.' }, { status: 500 });
  }
}
