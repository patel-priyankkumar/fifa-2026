import fs from "fs/promises";
import path from "path";
import { Entrant, Match } from "./scoring";

type GitHubFile<T> = { data: T; sha?: string };

const PEOPLE_FILE = "data/people.json";
const MATCHES_FILE = "data/matches.json";

function repoConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) return null;
  return { token, repo, branch };
}

function localPath(filePath: string) {
  return path.join(process.cwd(), filePath);
}

function normalizeMatch(raw: any): Match {
  return {
    match_no: Number(raw.match_no ?? raw.matchNo),
    stage: String(raw.stage ?? ""),
    match_date: String(raw.match_date ?? raw.dateTime),
    venue: String(raw.venue ?? ""),
    home_team: String(raw.home_team ?? raw.homeTeam ?? ""),
    away_team: String(raw.away_team ?? raw.awayTeam ?? ""),
    home_score: raw.home_score === undefined ? null : raw.home_score,
    away_score: raw.away_score === undefined ? null : raw.away_score,
    home_penalty: raw.home_penalty === undefined ? null : raw.home_penalty,
    away_penalty: raw.away_penalty === undefined ? null : raw.away_penalty,
    status:
      raw.status ??
      (raw.home_score === undefined ||
      raw.away_score === undefined ||
      raw.home_score === null ||
      raw.away_score === null
        ? "scheduled"
        : "completed"),
  };
}

function serializeMatch(match: Match) {
  return {
    match_no: match.match_no,
    stage: match.stage,
    match_date: match.match_date,
    venue: match.venue,
    home_team: match.home_team,
    away_team: match.away_team,
    home_score: match.home_score,
    away_score: match.away_score,
    home_penalty: match.home_penalty ?? null,
    away_penalty: match.away_penalty ?? null,
    status: match.status,
  };
}

async function readJson<T>(filePath: string): Promise<GitHubFile<T>> {
  const cfg = repoConfig();

  if (cfg) {
    const url = `https://api.github.com/repos/${cfg.repo}/contents/${filePath}?ref=${cfg.branch}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      throw new Error(
        `Could not read ${filePath} from GitHub: ${res.status} ${await res.text()}`,
      );
    }

    const payload = await res.json();
    const encoded = String(payload.content || "").replace(/\n/g, "");
    const json = Buffer.from(encoded, "base64").toString("utf8");
    return { data: JSON.parse(json), sha: payload.sha };
  }

  const text = await fs.readFile(localPath(filePath), "utf8");
  return { data: JSON.parse(text) };
}

async function writeJson<T>(filePath: string, data: T, sha?: string) {
  const cfg = repoConfig();
  const content = JSON.stringify(data, null, 2) + "\n";

  if (cfg) {
    if (!sha) {
      const current = await readJson<T>(filePath);
      sha = current.sha;
    }

    const url = `https://api.github.com/repos/${cfg.repo}/contents/${filePath}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Update ${filePath} from SVP SPORTS FIFA 2026 admin`,
        content: Buffer.from(content, "utf8").toString("base64"),
        sha,
        branch: cfg.branch,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Could not write ${filePath} to GitHub: ${res.status} ${await res.text()}`,
      );
    }
    return;
  }

  await fs.writeFile(localPath(filePath), content, "utf8");
}

export async function readPeople() {
  const file = await readJson<Entrant[]>(PEOPLE_FILE);
  return file.data.map((p) => ({
    id: String(p.id),
    name: String(p.name || ""),
    team: String(p.team || ""),
    paid: Boolean(p.paid ?? true),
    created_at: p.created_at,
  }));
}

export async function writePeople(people: Entrant[]) {
  const current = await readJson<Entrant[]>(PEOPLE_FILE);
  await writeJson(PEOPLE_FILE, people, current.sha);
}

export async function readMatches() {
  const file = await readJson<any[]>(MATCHES_FILE);
  return file.data.map(normalizeMatch).sort((a, b) => a.match_no - b.match_no);
}

export async function writeMatches(matches: Match[]) {
  const current = await readJson<any[]>(MATCHES_FILE);
  await writeJson(MATCHES_FILE, matches.map(serializeMatch), current.sha);
}
