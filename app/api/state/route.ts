import { NextResponse } from 'next/server';
import { buildLeaderboard, getPayouts, todayOrNextMatches } from '@/lib/scoring';
import { isAdmin } from '@/lib/auth';
import { readMatches, readPeople } from '@/lib/jsonStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [entrants, matches] = await Promise.all([readPeople(), readMatches()]);
    const leaderboard = buildLeaderboard(entrants, matches);
    const featured = todayOrNextMatches(matches);

    return NextResponse.json({
      isAdmin: await isAdmin(),
      entrants,
      matches,
      leaderboard,
      featured,
      payouts: getPayouts(entrants)
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load JSON data.' }, { status: 500 });
  }
}
