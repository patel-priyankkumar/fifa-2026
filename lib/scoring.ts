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
  predicted_winner: string | null;
};

export type MemberFile = {
  id?: string;
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
    match_points: number;
    third_place_points: number;
    final_points: number;
    winner_points: number;
  };
  final_pick?: string[];
  third_place_pick?: string[];
  world_cup_winner?: string | null;
};

export type PredictionResult = Prediction & {
  actual_home_score: number | null;
  actual_away_score: number | null;
  actual_winner: string | "Draw" | null;
  points: number;
  completed: boolean;
};

const MEMBERS_FOLDER = path.join(process.cwd(), "data", "members-JSON");

function repoConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) return null;
  return { token, repo, branch };
}

export function clean(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function sameTeam(a: string | null | undefined, b: string | null | undefined) {
  return clean(a) === clean(b) && clean(a) !== "";
}

export function isCompletedMatch(match: Match) {
  return (
    match.status === "completed" &&
    typeof match.home_score === "number" &&
    typeof match.away_score === "number"
  );
}

export function getActualWinner(match: Match): string | "Draw" | null {
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

  return "Draw";
}

function getStagePoints(stage: string) {
  const s = stage.toLowerCase();

  if (s.includes("group")) return { winner: 1, exact: 3, useMatchScore: true };
  if (s.includes("round of 32")) return { winner: 2, exact: 5, useMatchScore: true };
  if (s.includes("round of 16")) return { winner: 3, exact: 7, useMatchScore: true };
  if (s.includes("quarter")) return { winner: 4, exact: 9, useMatchScore: true };
  if (s.includes("semi")) return { winner: 5, exact: 11, useMatchScore: true };

  return { winner: 0, exact: 0, useMatchScore: false };
}

export function predictionWinner(prediction: Prediction) {
  if (prediction.predicted_winner && clean(prediction.predicted_winner)) {
    return prediction.predicted_winner;
  }

  if (
    typeof prediction.predicted_home_score === "number" &&
    typeof prediction.predicted_away_score === "number"
  ) {
    if (prediction.predicted_home_score > prediction.predicted_away_score) return prediction.home_team;
    if (prediction.predicted_away_score > prediction.predicted_home_score) return prediction.away_team;
    return "Draw";
  }

  return null;
}

export function scoreOneMatch(prediction: Prediction, match: Match) {
  if (!isCompletedMatch(match)) return 0;

  const stagePoints = getStagePoints(match.stage || prediction.stage);
  if (!stagePoints.useMatchScore) return 0;

  const actualWinner = getActualWinner(match);
  const predictedWinner = predictionWinner(prediction);
  if (!actualWinner || !predictedWinner) return 0;

  const winnerCorrect = sameTeam(predictedWinner, actualWinner);
  if (!winnerCorrect) return 0;

  const exactScoreCorrect =
    prediction.predicted_home_score === match.home_score &&
    prediction.predicted_away_score === match.away_score;

  return exactScoreCorrect ? stagePoints.exact : stagePoints.winner;
}

function getTeamsFromCompletedMatch(match: Match | undefined) {
  if (!match || !isCompletedMatch(match)) return [];
  return [match.home_team, match.away_team].filter(Boolean);
}

function countMatchingTeams(predicted: Array<string | null | undefined>, actual: string[]) {
  const actualClean = actual.map(clean);
  const uniquePredicted = Array.from(new Set(predicted.map(clean))).filter(Boolean);
  return uniquePredicted.filter((team) => actualClean.includes(team)).length;
}

function scoreThirdPlace(member: MemberFile, thirdPlaceMatch: Match | undefined) {
  const actualTeams = getTeamsFromCompletedMatch(thirdPlaceMatch);
  if (actualTeams.length !== 2) return 0;

  const matchingTeams = countMatchingTeams(
    [member.third_place?.team_1, member.third_place?.team_2],
    actualTeams,
  );

  if (matchingTeams >= 2) return 10;
  if (matchingTeams === 1) return 5;
  return 0;
}

function scoreFinalTeams(member: MemberFile, finalMatch: Match | undefined) {
  const actualTeams = getTeamsFromCompletedMatch(finalMatch);
  if (actualTeams.length !== 2) return 0;

  const matchingTeams = countMatchingTeams(
    [member.final?.team_1, member.final?.team_2],
    actualTeams,
  );

  if (matchingTeams >= 2) return 25;
  if (matchingTeams === 1) return 15;
  return 0;
}

function scoreWorldCupWinner(member: MemberFile, finalMatch: Match | undefined) {
  if (!finalMatch || !isCompletedMatch(finalMatch)) return 0;
  const actualWinner = getActualWinner(finalMatch);
  if (!actualWinner || actualWinner === "Draw") return 0;
  return sameTeam(member.world_cup_winner, actualWinner) ? 30 : 0;
}

function normalizeMember(raw: MemberFile & { id?: string }, id: string) {
  return {
    id,
    name: String(raw.name || id),
    paid: raw.paid ?? true,
    entry_fee: raw.entry_fee ?? 30,
    predictions: Array.isArray(raw.predictions) ? raw.predictions : [],
    third_place: raw.third_place ?? {},
    final: raw.final ?? {},
    world_cup_winner: raw.world_cup_winner ?? null,
  } satisfies MemberFile & { id: string };
}

async function readMembersFromGitHub() {
  const cfg = repoConfig();
  if (!cfg) return null;

  const folderPath = "data/members-JSON";
  const listUrl = `https://api.github.com/repos/${cfg.repo}/contents/${folderPath}?ref=${cfg.branch}`;
  const listRes = await fetch(listUrl, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!listRes.ok) {
    console.error(`Could not list ${folderPath} from GitHub: ${listRes.status} ${await listRes.text()}`);
    return null;
  }

  const files = (await listRes.json()) as Array<{ name: string; type: string; download_url?: string }>;
  const jsonFiles = files.filter((file) => file.type === "file" && file.name.toLowerCase().endsWith(".json"));

  const members = await Promise.all(
    jsonFiles.map(async (file) => {
      const fileUrl = `https://api.github.com/repos/${cfg.repo}/contents/${folderPath}/${encodeURIComponent(file.name)}?ref=${cfg.branch}`;
      const res = await fetch(fileUrl, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!res.ok) throw new Error(`Could not read ${file.name}: ${res.status}`);
      const payload = await res.json();
      const encoded = String(payload.content || "").replace(/\n/g, "");
      const json = Buffer.from(encoded, "base64").toString("utf8");
      const parsed = JSON.parse(json) as MemberFile;
      return normalizeMember(parsed, file.name.replace(/\.json$/i, ""));
    }),
  );

  return members;
}

export async function readMemberFiles() {
  const githubMembers = await readMembersFromGitHub();
  if (githubMembers) return githubMembers;

  try {
    const files = await fs.readdir(MEMBERS_FOLDER);
    const jsonFiles = files.filter((file) => file.toLowerCase().endsWith(".json"));

    const members = await Promise.all(
      jsonFiles.map(async (file) => {
        const fullPath = path.join(MEMBERS_FOLDER, file);
        const raw = await fs.readFile(fullPath, "utf8");
        const parsed = JSON.parse(raw) as MemberFile;
        return normalizeMember(parsed, file.replace(/\.json$/i, ""));
      }),
    );

    return members;
  } catch (error) {
    console.error("Could not read data/members-JSON folder:", error);
    return [];
  }
}

export function calculateMemberPoints(member: MemberFile, matches: Match[]) {
  const matchByNo = new Map(matches.map((match) => [match.match_no, match]));
  let matchPoints = 0;

  for (const prediction of member.predictions ?? []) {
    const match = matchByNo.get(Number(prediction.match_no));
    if (!match) continue;
    matchPoints += scoreOneMatch(prediction, match);
  }

  const thirdPlaceMatch =
    matches.find((match) => match.stage.toLowerCase().includes("third")) ??
    matches.find((match) => match.match_no === 103);

  const finalMatch =
    matches.find((match) => match.stage.toLowerCase() === "final") ??
    matches.find((match) => match.match_no === 104);

  const thirdPlacePoints = scoreThirdPlace(member, thirdPlaceMatch);
  const finalPoints = scoreFinalTeams(member, finalMatch);
  const winnerPoints = scoreWorldCupWinner(member, finalMatch);

  return {
    total: matchPoints + thirdPlacePoints + finalPoints + winnerPoints,
    breakdown: {
      match_points: matchPoints,
      third_place_points: thirdPlacePoints,
      final_points: finalPoints,
      winner_points: winnerPoints,
    },
  };
}

export function buildLeaderboard(members: Array<MemberFile & { id: string }>, matches: Match[]) {
  return members
    .map((member) => {
      const result = calculateMemberPoints(member, matches);
      return {
        id: member.id,
        name: member.name,
        paid: member.paid ?? true,
        entry_fee: member.entry_fee ?? 30,
        points: result.total,
        breakdown: result.breakdown,
        final_pick: [member.final?.team_1 || "", member.final?.team_2 || ""].filter(Boolean),
        third_place_pick: [member.third_place?.team_1 || "", member.third_place?.team_2 || ""].filter(Boolean),
        world_cup_winner: member.world_cup_winner ?? null,
      } satisfies LeaderboardMember;
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.name.localeCompare(b.name);
    });
}

export function buildPredictionResults(member: MemberFile, matches: Match[]) {
  const matchByNo = new Map(matches.map((match) => [match.match_no, match]));

  return (member.predictions ?? []).map((prediction) => {
    const match = matchByNo.get(Number(prediction.match_no));
    return {
      ...prediction,
      actual_home_score: match?.home_score ?? null,
      actual_away_score: match?.away_score ?? null,
      actual_winner: match ? getActualWinner(match) : null,
      points: match ? scoreOneMatch(prediction, match) : 0,
      completed: match ? isCompletedMatch(match) : false,
    } satisfies PredictionResult;
  });
}

export function getPayouts(members: Array<MemberFile & { id: string }>) {
  const paidMembers = members.filter((member) => member.paid ?? true);
  const pot = paidMembers.reduce((sum, member) => sum + (member.entry_fee ?? 30), 0);
  return {
    paidEntries: paidMembers.length,
    pot,
    first: Math.round(pot * 0.8 * 100) / 100,
    second: Math.round(pot * 0.2 * 100) / 100,
  };
}

export function todayOrNextMatches(matches: Match[]) {
  const now = new Date();
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

  const today = matches
    .filter((m) => m.status !== "completed")
    .filter((m) =>
      new Date(m.match_date).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) === todayKey,
    );

  if (today.length) return { label: "Today's Matches", matches: today };

  const future = matches
    .filter((m) => m.status !== "completed")
    .filter((m) => new Date(m.match_date).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());

  const first = future[0];
  if (!first) return { label: "Tournament Complete", matches: [] };

  const firstKey = new Date(first.match_date).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

  return {
    label: "Next Match Day",
    matches: future.filter(
      (m) => new Date(m.match_date).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) === firstKey,
    ),
  };
}
