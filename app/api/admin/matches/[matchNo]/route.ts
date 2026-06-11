import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { readMatches, writeMatches } from "@/lib/jsonStore";

export const dynamic = "force-dynamic";

function scoreValue(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ matchNo: string }> },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { matchNo } = await params;
  const body = await request.json();
  const homeScore = scoreValue(body.home_score);
  const awayScore = scoreValue(body.away_score);
  const homePenalty = scoreValue(body.home_penalty);
  const awayPenalty = scoreValue(body.away_penalty);
  const status =
    homeScore === null || awayScore === null ? "scheduled" : "completed";

  try {
    const matches = await readMatches();
    const index = matches.findIndex(
      (match) => match.match_no === Number(matchNo),
    );
    if (index === -1)
      return NextResponse.json({ error: "Match not found." }, { status: 404 });

    const next = [...matches];
    next[index] = {
      ...next[index],
      home_score: homeScore,
      away_score: awayScore,
      home_penalty: homePenalty,
      away_penalty: awayPenalty,
      status,
    };
    await writeMatches(next);
    return NextResponse.json({ match: next[index] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update match.",
      },
      { status: 500 },
    );
  }
}
