import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readMatches, writeMatches } from "@/lib/jsonStore";

export const dynamic = "force-dynamic";

function parseOptionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return null;
  }

  return numberValue;
}

function hasValue(value: unknown) {
  return value !== "" && value !== null && value !== undefined;
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ matchNo: string }> },
) {
  const session = await getSession();

  if (!session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchNo } = await context.params;
  const targetMatchNo = Number(matchNo);

  if (Number.isNaN(targetMatchNo)) {
    return NextResponse.json({ error: "Invalid match number" }, { status: 400 });
  }

  const body = await request.json();

  const homeTeam = asText(body.home_team);
  const awayTeam = asText(body.away_team);

  const homeScoreRaw = body.home_score;
  const awayScoreRaw = body.away_score;
  const homePenaltyRaw = body.home_penalty;
  const awayPenaltyRaw = body.away_penalty;

  const hasHomeScore = hasValue(homeScoreRaw);
  const hasAwayScore = hasValue(awayScoreRaw);

  if (hasHomeScore !== hasAwayScore) {
    return NextResponse.json(
      { error: "Enter both scores or clear both scores." },
      { status: 400 },
    );
  }

  const hasHomePenalty = hasValue(homePenaltyRaw);
  const hasAwayPenalty = hasValue(awayPenaltyRaw);

  if (hasHomePenalty !== hasAwayPenalty) {
    return NextResponse.json(
      { error: "Enter both penalty scores or clear both penalty scores." },
      { status: 400 },
    );
  }

  const homeScore = parseOptionalNumber(homeScoreRaw);
  const awayScore = parseOptionalNumber(awayScoreRaw);
  const homePenalty = parseOptionalNumber(homePenaltyRaw);
  const awayPenalty = parseOptionalNumber(awayPenaltyRaw);

  if (hasHomeScore && homeScore === null) {
    return NextResponse.json({ error: "Home score must be a number." }, { status: 400 });
  }

  if (hasAwayScore && awayScore === null) {
    return NextResponse.json({ error: "Away score must be a number." }, { status: 400 });
  }

  if (hasHomePenalty && homePenalty === null) {
    return NextResponse.json({ error: "Home penalty score must be a number." }, { status: 400 });
  }

  if (hasAwayPenalty && awayPenalty === null) {
    return NextResponse.json({ error: "Away penalty score must be a number." }, { status: 400 });
  }

  const isCompleted = homeScore !== null && awayScore !== null;

  const matches = await readMatches();
  let found = false;

  const updatedMatches = matches.map((match) => {
    if (match.match_no !== targetMatchNo) {
      return match;
    }

    found = true;

    return {
      ...match,
      home_team: homeTeam || match.home_team,
      away_team: awayTeam || match.away_team,
      home_score: isCompleted ? homeScore : null,
      away_score: isCompleted ? awayScore : null,
      home_penalty: isCompleted ? homePenalty : null,
      away_penalty: isCompleted ? awayPenalty : null,
      status: isCompleted ? ("completed" as const) : ("scheduled" as const),
    };
  });

  if (!found) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  await writeMatches(updatedMatches);

  return NextResponse.json({
    ok: true,
    message: isCompleted
      ? "Match saved. Leaderboard will recalculate automatically."
      : "Match cleared. Leaderboard will recalculate automatically.",
  });
}