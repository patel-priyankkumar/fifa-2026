import { Match } from "./scoring";

type SyncResult = {
  checked: number;
  updated: number;
  skipped: number;
  source: string;
  message: string;
};

const DEFAULT_LIVE_SCORES_URL = "https://worldcup26.ir/get/games";

function firstValue(obj: any, keys: string[]) {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function toNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.games,
    payload?.matches,
    payload?.data,
    payload?.results,
    payload?.fixtures,
    payload?.response,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (Array.isArray(candidate?.games)) return candidate.games;
    if (Array.isArray(candidate?.matches)) return candidate.matches;
  }
  return [];
}

function sourceMatchNo(raw: any) {
  return toNumber(
    firstValue(raw, [
      "match_no",
      "matchNo",
      "match_number",
      "matchNumber",
      "number",
      "game_no",
      "gameNo",
      "id",
    ]),
  );
}

function sourceHomeTeam(raw: any) {
  return firstValue(raw, [
    "home_team",
    "homeTeam",
    "home.name_en",
    "home.name",
    "home_team_en",
    "team1",
    "team1_en",
    "home",
  ]);
}

function sourceAwayTeam(raw: any) {
  return firstValue(raw, [
    "away_team",
    "awayTeam",
    "away.name_en",
    "away.name",
    "away_team_en",
    "team2",
    "team2_en",
    "away",
  ]);
}

function sourceScore(raw: any, side: "home" | "away") {
  const prefix = side === "home" ? "home" : "away";
  const team = side === "home" ? "team1" : "team2";
  return toNumber(
    firstValue(raw, [
      `${prefix}_score`,
      `${prefix}Score`,
      `${prefix}.score`,
      `${prefix}.goals`,
      `${team}_score`,
      `${team}Score`,
      `score.${prefix}`,
      `goals.${prefix}`,
    ]),
  );
}

function sourcePenalty(raw: any, side: "home" | "away") {
  const prefix = side === "home" ? "home" : "away";
  const team = side === "home" ? "team1" : "team2";
  return toNumber(
    firstValue(raw, [
      `${prefix}_penalty`,
      `${prefix}Penalty`,
      `${prefix}_penalties`,
      `${prefix}Penalties`,
      `${prefix}.penalty`,
      `${prefix}.penalties`,
      `${team}_penalty`,
      `${team}Penalty`,
      `penalties.${prefix}`,
    ]),
  );
}

function sourceStatus(raw: any) {
  const value = String(
    firstValue(raw, ["status", "match_status", "matchStatus", "state"])
      ?? "",
  ).toLowerCase();
  if (["finished", "fulltime", "full-time", "ft", "completed", "ended"].some((x) => value.includes(x))) {
    return "completed" as const;
  }
  if (["live", "inprogress", "in progress", "playing", "half"].some((x) => value.includes(x))) {
    return "completed" as const;
  }
  return undefined;
}

function findLocalMatch(localMatches: Match[], raw: any) {
  const matchNo = sourceMatchNo(raw);
  if (matchNo !== null) {
    const byNumber = localMatches.find((m) => m.match_no === matchNo);
    if (byNumber) return byNumber;
  }

  const home = normalizeName(sourceHomeTeam(raw));
  const away = normalizeName(sourceAwayTeam(raw));
  if (!home || !away) return null;

  return (
    localMatches.find(
      (m) =>
        normalizeName(m.home_team) === home && normalizeName(m.away_team) === away,
    ) || null
  );
}

export async function syncLiveScores(matches: Match[]): Promise<{ matches: Match[]; result: SyncResult }> {
  const source = process.env.LIVE_SCORES_URL || DEFAULT_LIVE_SCORES_URL;
  const res = await fetch(source, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Live score source failed: ${res.status}`);
  }

  const payload = await res.json();
  const remoteMatches = findArray(payload);
  let updated = 0;
  let skipped = 0;
  const next = [...matches];

  for (const remote of remoteMatches) {
    const local = findLocalMatch(next, remote);
    if (!local) {
      skipped += 1;
      continue;
    }

    const homeScore = sourceScore(remote, "home");
    const awayScore = sourceScore(remote, "away");
    const homePenalty = sourcePenalty(remote, "home");
    const awayPenalty = sourcePenalty(remote, "away");
    const status = sourceStatus(remote);

    if (homeScore === null || awayScore === null) {
      skipped += 1;
      continue;
    }

    const index = next.findIndex((m) => m.match_no === local.match_no);
    const candidate: Match = {
      ...next[index],
      home_score: homeScore,
      away_score: awayScore,
      home_penalty: homePenalty,
      away_penalty: awayPenalty,
      status: status || "completed",
    };

    const changed =
      candidate.home_score !== next[index].home_score ||
      candidate.away_score !== next[index].away_score ||
      candidate.home_penalty !== next[index].home_penalty ||
      candidate.away_penalty !== next[index].away_penalty ||
      candidate.status !== next[index].status;

    if (changed) {
      next[index] = candidate;
      updated += 1;
    }
  }

  return {
    matches: next,
    result: {
      checked: remoteMatches.length,
      updated,
      skipped,
      source,
      message: updated
        ? `Synced ${updated} match score${updated === 1 ? "" : "s"}.`
        : `Checked ${remoteMatches.length} live records. No score changes found.`,
    },
  };
}
