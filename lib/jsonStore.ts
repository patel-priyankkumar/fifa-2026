import fs from "fs/promises";
import path from "path";
import type { Match } from "./scoring";

type GitHubFile<T> = { data: T; sha?: string };

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

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function normalizeMatch(raw: any): Match {
  const homeScore = normalizeNumber(raw.home_score ?? raw.homeScore);
  const awayScore = normalizeNumber(raw.away_score ?? raw.awayScore);

  const status =
    raw.status === "completed" && typeof homeScore === "number" && typeof awayScore === "number"
      ? "completed"
      : "scheduled";

  return {
    match_no: Number(raw.match_no ?? raw.matchNo),
    stage: String(raw.stage ?? ""),
    match_date: String(raw.match_date ?? raw.dateTime ?? ""),
    venue: String(raw.venue ?? ""),
    home_team: String(raw.home_team ?? raw.homeTeam ?? ""),
    away_team: String(raw.away_team ?? raw.awayTeam ?? ""),
    home_score: status === "completed" ? homeScore : null,
    away_score: status === "completed" ? awayScore : null,
    home_penalty: status === "completed" ? normalizeNumber(raw.home_penalty ?? raw.homePenalty) : null,
    away_penalty: status === "completed" ? normalizeNumber(raw.away_penalty ?? raw.awayPenalty) : null,
    status,
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

export async function readJson<T>(filePath: string): Promise<GitHubFile<T>> {
  const cfg = repoConfig();

  if (cfg) {
    const url = `https://api.github.com/repos/${cfg.repo}/contents/${filePath}?ref=${cfg.branch}`;

    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!res.ok) {
        console.warn(
          `Could not read ${filePath} from GitHub. Falling back to local file. Status: ${res.status}`,
        );
      } else {
        const payload = await res.json();
        const encoded = String(payload.content || "").replace(/\n/g, "");
        const json = Buffer.from(encoded, "base64").toString("utf8");

        return {
          data: JSON.parse(json),
          sha: payload.sha,
        };
      }
    } catch (error) {
      console.warn(
        `GitHub read failed for ${filePath}. Falling back to local file.`,
        error,
      );
    }
  }

  const fullPath = localPath(filePath);

  try {
    const text = await fs.readFile(fullPath, "utf8");

    return {
      data: JSON.parse(text),
    };
  } catch (error) {
    console.error("Could not read local JSON file:", {
      filePath,
      fullPath,
      cwd: process.cwd(),
      error,
    });

    throw new Error(`Could not read ${filePath} from GitHub or local file`);
  }
}

export async function writeJson<T>(filePath: string, data: T, sha?: string) {
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
        message: `Update ${filePath} from FIFA 2026 admin`,
        content: Buffer.from(content, "utf8").toString("base64"),
        sha,
        branch: cfg.branch,
      }),
    });

    if (!res.ok) {
      throw new Error(`Could not write ${filePath} to GitHub: ${res.status} ${await res.text()}`);
    }
    return;
  }

  await fs.writeFile(localPath(filePath), content, "utf8");
}

export async function readMatches() {
  const file = await readJson<any[]>(MATCHES_FILE);
  return file.data.map(normalizeMatch).sort((a, b) => a.match_no - b.match_no);
}

export async function writeMatches(matches: Match[]) {
  const current = await readJson<any[]>(MATCHES_FILE);
  await writeJson(MATCHES_FILE, matches.map(serializeMatch), current.sha);
}
