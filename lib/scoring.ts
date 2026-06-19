import fs from "fs/promises";
import path from "path";

export type MatchStatus = "scheduled" | "completed";

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
  status: MatchStatus;
};

export type Prediction = {
  match_no: number;
  stage: string;
  home_team: string;
  away_team: string;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  predicted_winner?: string | null;
};

export type MemberFile = {
  name: string;
  paid?: boolean;
  entry_fee?: number;
  predictions: Prediction[];
  third_place?: {
    team_1?: string | null;
    team_2?: string | null;
  };
  final?: {
    team_1?: string | null;
    team_2?: string | null;
  };
  world_cup_winner?: string | null;
};

export type LeaderboardMember = {
  id: string;
  name: string;
  paid: boolean;
  entry_fee: number;
  points: number;
  breakdown: {
    group_stage: number;
    round_of_32: number;
    round_of_16: number;
    quarter_final: number;
    semi_final: number;
    third_place: number;
    final: number;
    world_cup_winner: number;
  };
};

const MEMBERS_FOLDER = path.join(process.cwd(), "data", "members-JSON");

function clean(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function sameTeam(a: string | null | undefined, b: string | null | undefined) {
  return clean(a) !== "" && clean(a) === clean(b);
}

function isCompletedMatch(match: Match) {
  return (
    match.status === "completed" &&
    typeof match.home_score === "number" &&
    typeof match.away_score === "number"
  );
}

function resultDirection(home: number, away: number) {
  if (home > away) return "HOME";
  if (away > home) return "AWAY";
  return "DRAW";
}
function debugScoreRegularMatch(prediction: Prediction, match: Match) {
  const score = scoreRegularMatch(prediction, match);
  const points = stagePoints(match.stage);

  const predictedScore =
    prediction.predicted_home_score !== null &&
      prediction.predicted_away_score !== null
      ? `${prediction.predicted_home_score}-${prediction.predicted_away_score}`
      : "N/A";

  const actualScore =
    match.home_score !== null && match.away_score !== null
      ? `${match.home_score}-${match.away_score}`
      : "N/A";

  const predictedResult =
    typeof prediction.predicted_home_score === "number" &&
      typeof prediction.predicted_away_score === "number"
      ? resultDirection(
        prediction.predicted_home_score,
        prediction.predicted_away_score,
      )
      : "N/A";

  const actualResult =
    typeof match.home_score === "number" && typeof match.away_score === "number"
      ? resultDirection(match.home_score, match.away_score)
      : "N/A";

  const exactScore =
    prediction.predicted_home_score === match.home_score &&
    prediction.predicted_away_score === match.away_score;

  return {
    match_no: match.match_no,
    stage: match.stage,
    match: `${match.home_team} vs ${match.away_team}`,
    predicted_score: predictedScore,
    actual_score: actualScore,
    predicted_result: predictedResult,
    actual_result: actualResult,
    exact_score: exactScore,
    points_possible: points,
    points_awarded: score,
  };
}
function stageKey(stage: string): keyof LeaderboardMember["breakdown"] | null {
  const s = stage.toLowerCase().replace(/[-_]/g, " ");

  if (s.includes("group")) return "group_stage";
  if (s.includes("round of 32")) return "round_of_32";
  if (s.includes("round of 16")) return "round_of_16";
  if (s.includes("quarter")) return "quarter_final";
  if (s.includes("semi")) return "semi_final";

  return null;
}

function stagePoints(stage: string) {
  const key = stageKey(stage);

  if (key === "group_stage") return { winner: 1, exact: 3 };
  if (key === "round_of_32") return { winner: 2, exact: 5 };
  if (key === "round_of_16") return { winner: 3, exact: 7 };
  if (key === "quarter_final") return { winner: 4, exact: 9 };
  if (key === "semi_final") return { winner: 5, exact: 11 };

  return null;
}

function getActualWinner(match: Match): string | null {
  if (!isCompletedMatch(match)) return null;

  if (match.home_score! > match.away_score!) return match.home_team;
  if (match.away_score! > match.home_score!) return match.away_team;

  const hasPenalties =
    typeof match.home_penalty === "number" &&
    typeof match.away_penalty === "number";

  if (hasPenalties) {
    if (match.home_penalty! > match.away_penalty!) return match.home_team;
    if (match.away_penalty! > match.home_penalty!) return match.away_team;
  }

  return null;
}

function scoreRegularMatch(prediction: Prediction, match: Match) {
  if (!isCompletedMatch(match)) return 0;

  const points = stagePoints(match.stage);
  if (!points) return 0;

  if (
    typeof prediction.predicted_home_score !== "number" ||
    typeof prediction.predicted_away_score !== "number"
  ) {
    return 0;
  }

  const predictedResult = resultDirection(
    prediction.predicted_home_score,
    prediction.predicted_away_score,
  );

  const actualResult = resultDirection(match.home_score!, match.away_score!);

  if (predictedResult !== actualResult) {
    return 0;
  }

  const exactScore =
    prediction.predicted_home_score === match.home_score &&
    prediction.predicted_away_score === match.away_score;

  return exactScore ? points.exact : points.winner;
}

function completedMatchTeams(match: Match | undefined) {
  if (!match || !isCompletedMatch(match)) return [];
  return [match.home_team, match.away_team].filter(Boolean);
}

function countMatchingTeams(
  predictedTeams: Array<string | null | undefined>,
  actualTeams: string[],
) {
  const actual = actualTeams.map(clean);
  const predicted = Array.from(new Set(predictedTeams.map(clean))).filter(
    Boolean,
  );

  return predicted.filter((team) => actual.includes(team)).length;
}

function scoreThirdPlace(member: MemberFile, match: Match | undefined) {
  const actualTeams = completedMatchTeams(match);
  if (actualTeams.length !== 2) return 0;

  const matches = countMatchingTeams(
    [member.third_place?.team_1, member.third_place?.team_2],
    actualTeams,
  );

  if (matches >= 2) return 10;
  if (matches === 1) return 5;
  return 0;
}

function scoreFinalTeams(member: MemberFile, match: Match | undefined) {
  const actualTeams = completedMatchTeams(match);
  if (actualTeams.length !== 2) return 0;

  const matches = countMatchingTeams(
    [member.final?.team_1, member.final?.team_2],
    actualTeams,
  );

  if (matches >= 2) return 25;
  if (matches === 1) return 15;
  return 0;
}

function scoreWorldCupWinner(member: MemberFile, finalMatch: Match | undefined) {
  if (!finalMatch || !isCompletedMatch(finalMatch)) return 0;

  const winner = getActualWinner(finalMatch);
  if (!winner) return 0;

  return sameTeam(member.world_cup_winner, winner) ? 30 : 0;
}

export async function readMemberFiles() {
  try {
    const files = await fs.readdir(MEMBERS_FOLDER);
    const jsonFiles = files.filter((file) => file.toLowerCase().endsWith(".json"));

    const members = await Promise.all(
      jsonFiles.map(async (file) => {
        const fullPath = path.join(MEMBERS_FOLDER, file);
        const raw = await fs.readFile(fullPath, "utf8");
        const parsed = JSON.parse(raw) as MemberFile;

        return {
          id: file.replace(/\.json$/i, ""),
          ...parsed,
        };
      }),
    );
    console.log(
      "Loaded members:",
      members?.map((member) => member.name),
    );
    return members;
  } catch (error) {
    console.error("Could not read members JSON folder:", error);
    return [];
  }
}

// export function calculateMemberPoints(member: MemberFile, matches: Match[]) {
//   const matchByNo = new Map(matches.map((match) => [match.match_no, match]));

//   const breakdown: LeaderboardMember["breakdown"] = {
//     group_stage: 0,
//     round_of_32: 0,
//     round_of_16: 0,
//     quarter_final: 0,
//     semi_final: 0,
//     third_place: 0,
//     final: 0,
//     world_cup_winner: 0,
//   };

//   for (const prediction of member.predictions ?? []) {
//     const match = matchByNo.get(prediction.match_no);
//     if (!match) continue;

//     const key = stageKey(match.stage);
//     if (!key) continue;

//     breakdown[key] += scoreRegularMatch(prediction, match);
//   }

//   const thirdPlaceMatch =
//     matches.find((match) => match.match_no === 103) ??
//     matches.find((match) => match.stage.toLowerCase().includes("third"));

//   const finalMatch =
//     matches.find((match) => match.match_no === 104) ??
//     matches.find((match) => match.stage.toLowerCase().includes("final"));

//   breakdown.third_place = scoreThirdPlace(member, thirdPlaceMatch);
//   breakdown.final = scoreFinalTeams(member, finalMatch);
//   breakdown.world_cup_winner = scoreWorldCupWinner(member, finalMatch);

//   const total =
//     breakdown.group_stage +
//     breakdown.round_of_32 +
//     breakdown.round_of_16 +
//     breakdown.quarter_final +
//     breakdown.semi_final +
//     breakdown.third_place +
//     breakdown.final +
//     breakdown.world_cup_winner;

//   return {
//     total,
//     breakdown,
//   };
// }
export function calculateMemberPoints(
  member: MemberFile,
  matches: Match[],
  debug = false,
) {
  const matchByNo = new Map(matches.map((match) => [match.match_no, match]));

  const breakdown: LeaderboardMember["breakdown"] = {
    group_stage: 0,
    round_of_32: 0,
    round_of_16: 0,
    quarter_final: 0,
    semi_final: 0,
    third_place: 0,
    final: 0,
    world_cup_winner: 0,
  };

  const matchLogs = [];

  for (const prediction of member.predictions ?? []) {
    const match = matchByNo.get(prediction.match_no);
    if (!match) continue;

    const key = stageKey(match.stage);
    if (!key) continue;

    const points = scoreRegularMatch(prediction, match);
    breakdown[key] += points;

    if (debug) {
      matchLogs.push(debugScoreRegularMatch(prediction, match));
    }
  }

  const thirdPlaceMatch =
    matches.find((match) => match.match_no === 103) ??
    matches.find((match) => match.stage.toLowerCase().includes("third"));

  const finalMatch =
    matches.find((match) => match.match_no === 104) ??
    matches.find((match) => {
      const stage = match.stage.toLowerCase().trim();
      return stage === "final" || stage === "final match";
    });

  breakdown.third_place = scoreThirdPlace(member, thirdPlaceMatch);
  breakdown.final = scoreFinalTeams(member, finalMatch);
  breakdown.world_cup_winner = scoreWorldCupWinner(member, finalMatch);

  const total =
    breakdown.group_stage +
    breakdown.round_of_32 +
    breakdown.round_of_16 +
    breakdown.quarter_final +
    breakdown.semi_final +
    breakdown.third_place +
    breakdown.final +
    breakdown.world_cup_winner;

  if (debug) {
    console.log("\n====================================");
    console.log(`Scoring for: ${member.name}`);
    console.log("====================================");

    console.table(matchLogs);

    console.log("Bonus scoring:", {
      third_place: breakdown.third_place,
      final: breakdown.final,
      world_cup_winner: breakdown.world_cup_winner,
    });

    console.log("Breakdown:", breakdown);
    console.log("TOTAL:", total);
  }

  return {
    total,
    breakdown,
  };
}

export function buildLeaderboard(
  members: Array<MemberFile & { id: string }>,
  matches: Match[],
) {
  return members
    .map((member) => {
      const result = calculateMemberPoints(member, matches, true);

      return {
        id: member.id,
        name: member.name,
        paid: member.paid ?? true,
        entry_fee: member.entry_fee ?? 30,
        points: result.total,
        breakdown: result.breakdown,
      } satisfies LeaderboardMember;
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.name.localeCompare(b.name);
    });
}

export function getPayouts(members: Array<MemberFile & { id?: string }>) {
  const paidEntries = members.filter((member) => member.paid ?? true).length;
  const pot = paidEntries * 30;

  return {
    paidEntries,
    pot,
    first: pot * 0.8,
    second: pot * 0.2,
  };
}

function sameTorontoDate(a: Date, b: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(a) === formatter.format(b);
}

export function todayOrNextMatches(matches: Match[]) {
  const now = new Date();

  const upcoming = [...matches]
    .filter((match) => match.status !== "completed")
    .sort(
      (a, b) =>
        new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
    );

  const today = upcoming.filter((match) =>
    sameTorontoDate(new Date(match.match_date), now),
  );

  if (today.length > 0) {
    return {
      label: "Today's Matches",
      matches: today,
    };
  }

  const nextMatch = upcoming[0];

  if (!nextMatch) {
    return {
      label: "Tournament Completed",
      matches: [],
    };
  }

  const nextDate = new Date(nextMatch.match_date);

  return {
    label: `Next Matches`,
    matches: upcoming.filter((match) =>
      sameTorontoDate(new Date(match.match_date), nextDate),
    ),
  };
}