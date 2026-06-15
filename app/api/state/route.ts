import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readMatches } from "@/lib/jsonStore";
import { buildLeaderboard, getPayouts, readMemberFiles, todayOrNextMatches } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const matches = await readMatches();
  const members = await readMemberFiles();
  const leaderboard = buildLeaderboard(members, matches);
  const payouts = getPayouts(members);

  return NextResponse.json({
    isAdmin: session.isAdmin,
    members,
    entrants: leaderboard,
    matches,
    leaderboard,
    featured: todayOrNextMatches(matches),
    payouts,
  });
}
