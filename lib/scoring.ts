export type Entrant = {
  id: string;
  name: string;
  team: string;
  paid: boolean;
  created_at?: string;
};

export type Match = {
  match_no: number;
  stage: string;
  match_date: string;
  venue: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  home_penalty?: number | null;
  away_penalty?: number | null;
  status: "scheduled" | "completed";
};

function norm(team: string) {
  return team.trim().toLowerCase();
}

export function teamPoints(team: string, matches: Match[]) {
  let total = 0;
  const selected = norm(team);

  for (const match of matches) {
    if (
      match.status !== "completed" ||
      match.home_score === null ||
      match.away_score === null
    )
      continue;
    const isHome = norm(match.home_team) === selected;
    const isAway = norm(match.away_team) === selected;
    if (!isHome && !isAway) continue;

    const teamScore = isHome ? match.home_score : match.away_score;
    const opponentScore = isHome ? match.away_score : match.home_score;
    const teamPenalty = isHome ? match.home_penalty : match.away_penalty;
    const opponentPenalty = isHome ? match.away_penalty : match.home_penalty;

    if (teamScore > opponentScore) total += 3;
    else if (teamScore < opponentScore) total += 0;
    else if (
      teamPenalty !== null &&
      teamPenalty !== undefined &&
      opponentPenalty !== null &&
      opponentPenalty !== undefined &&
      teamPenalty !== opponentPenalty
    ) {
      if (teamPenalty > opponentPenalty) total += 3;
    } else total += 1;
  }

  return total;
}

export function buildLeaderboard(entrants: Entrant[], matches: Match[]) {
  return entrants
    .map((entrant) => ({
      ...entrant,
      points: teamPoints(entrant.team, matches),
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

export function getPayouts(entrants: Entrant[]) {
  const paidEntries = entrants.filter((e) => e.paid).length;
  const pot = paidEntries * 30;
  return {
    paidEntries,
    pot,
    first: Math.round(pot * 0.8 * 100) / 100,
    second: Math.round(pot * 0.2 * 100) / 100,
  };
}

export function todayOrNextMatches(matches: Match[]) {
  const now = new Date();
  const todayKey = now.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
  });

  const today = matches.filter(
    (m) =>
      new Date(m.match_date).toLocaleDateString("en-CA", {
        timeZone: "America/Toronto",
      }) === todayKey,
  );

  if (today.length) return { label: "Today's Matches", matches: today };

  const future = matches
    .filter((m) => new Date(m.match_date).getTime() >= now.getTime())
    .sort(
      (a, b) =>
        new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
    );
  const first = future[0];
  if (!first) return { label: "Tournament Complete", matches: [] };

  const firstKey = new Date(first.match_date).toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
  });
  return {
    label: "Next Matches",
    matches: future.filter(
      (m) =>
        new Date(m.match_date).toLocaleDateString("en-CA", {
          timeZone: "America/Toronto",
        }) === firstKey,
    ),
  };
}
