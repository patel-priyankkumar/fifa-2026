"use client";

import { useEffect, useMemo, useState } from "react";

type Match = {
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

type Prediction = {
  match_no: number;
  stage: string;
  home_team: string;
  away_team: string;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  predicted_winner: string | null;
};

type Member = {
  id: string;
  name: string;
  paid?: boolean;
  entry_fee?: number;
  predictions: Prediction[];
  third_place?: { team_1?: string | null; team_2?: string | null };
  final?: { team_1?: string | null; team_2?: string | null };
  world_cup_winner?: string | null;
};

type LeaderboardMember = {
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

type State = {
  isAdmin: boolean;
  members: Member[];
  entrants: LeaderboardMember[];
  matches: Match[];
  leaderboard: LeaderboardMember[];
  featured: { label: string; matches: Match[] };
  payouts: { paidEntries: number; pot: number; first: number; second: number };
};

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto",
});

function clean(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function scoreText(match: Match) {
  const main = `${match.home_score ?? "-"} : ${match.away_score ?? "-"}`;
  const hasPens = typeof match.home_penalty === "number" && typeof match.away_penalty === "number";
  return hasPens ? `${main} pens ${match.home_penalty}-${match.away_penalty}` : main;
}

function predictionWinner(prediction: Prediction) {
  if (prediction.predicted_winner && clean(prediction.predicted_winner)) return prediction.predicted_winner;
  if (typeof prediction.predicted_home_score === "number" && typeof prediction.predicted_away_score === "number") {
    if (prediction.predicted_home_score > prediction.predicted_away_score) return prediction.home_team;
    if (prediction.predicted_away_score > prediction.predicted_home_score) return prediction.away_team;
    return "Draw";
  }
  return "";
}

function predictionScore(prediction: Prediction) {
  if (typeof prediction.predicted_home_score !== "number" || typeof prediction.predicted_away_score !== "number") {
    return "No score";
  }
  return `${prediction.predicted_home_score}-${prediction.predicted_away_score}`;
}

function picksForMatch(members: Member[], match: Match) {
  const home: Array<{ name: string; score: string }> = [];
  const away: Array<{ name: string; score: string }> = [];
  const draw: Array<{ name: string; score: string }> = [];

  for (const member of members) {
    const prediction = member.predictions?.find((p) => Number(p.match_no) === match.match_no);
    if (!prediction) continue;

    const winner = predictionWinner(prediction);
    const item = { name: member.name, score: predictionScore(prediction) };

    if (clean(winner) === clean(match.home_team)) home.push(item);
    else if (clean(winner) === clean(match.away_team)) away.push(item);
    else if (clean(winner) === "draw") draw.push(item);
  }

  return { home, away, draw };
}

function isGroupStage(match: Match) {
  return match.stage.toLowerCase().includes("group");
}

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const res = await fetch("/api/state", { cache: "no-store" });
    const data = await res.json();
    setState(data);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
  }, []);

  const filteredMatches = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    return state.matches.filter(
      (m) =>
        !q ||
        [m.home_team, m.away_team, m.venue, m.stage, String(m.match_no)].some((x) => x.toLowerCase().includes(q)),
    );
  }, [state, search]);

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setSaving(true);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setSaving(false);

    if (!res.ok) {
      setMessage("Wrong password.");
      return;
    }

    setPassword("");
    setMessage("Admin mode enabled.");
    await refresh();
  }

  async function logout() {
    setSaving(true);
    await fetch("/api/admin/logout", { method: "POST" });
    setSaving(false);
    setMessage("Logged out.");
    await refresh();
  }

  async function checkJsonFiles() {
    setSaving(true);
    const res = await fetch("/api/admin/seed", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) setMessage(data.error || "Could not check JSON files.");
    else {
      setMessage(data.message || "JSON files ready.");
      await refresh();
    }
  }

  async function updateScore(
    match: Match,
    home_team: string,
    away_team: string,
    home_score: string,
    away_score: string,
    home_penalty: string,
    away_penalty: string,
  ) {
    setSaving(true);
    setMessage("Saving match...");

    const res = await fetch(`/api/admin/matches/${match.match_no}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home_team, away_team, home_score, away_score, home_penalty, away_penalty }),
    });

    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setMessage(data.error || "Could not save match.");
      return;
    }

    setMessage(data.message || "Match saved.");
    await refresh();
  }

  if (loading || !state) {
    return <main className="loading">Loading SVP SPORTS FIFA 2026...</main>;
  }

  return (
    <main>
      <section className="hero">
        <div className="heroGlow" />
        <div className="nav">
          <div className="brand">
            <span>SVP</span> SPORTS FIFA 2026
          </div>
          <button className="ghost" onClick={() => setAdminOpen(!adminOpen)}>
            {state.isAdmin ? "Admin Panel" : "Admin Login"}
          </button>
        </div>

        <div className="heroGrid">
          <div>
            <p className="eyebrow">World Cup Prediction Pool</p>
            <h1>Full match predictions, live standings, and prize payouts.</h1>
            <p className="subtitle">
              Player predictions are loaded from <strong>data/members-JSON</strong>. Admin updates real match scores;
              the app recalculates every player automatically using the official pool scoring rules.
            </p>
          </div>
          <div className="statStack">
            <div className="statCard">
              <span>Total Pot</span>
              <strong>{money.format(state.payouts.pot)}</strong>
              <small>{state.payouts.paidEntries} paid entries</small>
            </div>
            <div className="statCard smallStat">
              <span>Players</span>
              <strong>{state.members.length}</strong>
              <small>JSON prediction files</small>
            </div>
          </div>
        </div>
      </section>

      {adminOpen && (
        <section className="adminShell">
          {!state.isAdmin ? (
            <form className="adminCard" onSubmit={login}>
              <h2>Admin Login</h2>
              <p>Only the admin can update match teams and scores.</p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
              />
              <button disabled={saving}>{saving ? "Checking..." : "Login"}</button>
            </form>
          ) : (
            <div className="adminGrid">
              <div className="adminCard">
                <h2>Prediction Files</h2>
                <p>
                  Add each player file to <strong>data/members-JSON</strong>, for example <strong>aniket.json</strong>.
                  The site reads all JSON files and lists every player automatically.
                </p>
                <button onClick={checkJsonFiles} disabled={saving}>
                  Check JSON Files
                </button>
              </div>
              <div className="adminCard">
                <h2>Score Updates</h2>
                <p>
                  Update the real score in the schedule below. Clearing both score boxes will put the match back to
                  scheduled and remove points for that match.
                </p>
                <button className="danger" onClick={logout} disabled={saving}>
                  Logout
                </button>
              </div>
            </div>
          )}
          {message && <p className="message">{message}</p>}
        </section>
      )}

      <section className="today">
        <div className="sectionHeader">
          <p className="eyebrow">Featured</p>
          <h2>{state.featured.label}</h2>
        </div>
        <div className="matchCards">
          {state.featured.matches.length === 0 && <div className="empty">No upcoming matches found.</div>}
          {state.featured.matches.map((match) => (
            <FeaturedMatch key={match.match_no} match={match} members={state.members} />
          ))}
        </div>
      </section>

      <section className="contentGrid">
        <div className="panel leaderboard">
          <div className="sectionHeader row">
            <div>
              <p className="eyebrow">Standings</p>
              <h2>Leaderboard</h2>
            </div>
            <span className="pill">Auto calculated</span>
          </div>

          <div className="leaderboardList">
            {state.leaderboard.length === 0 && <div className="empty">No member JSON files found.</div>}
            {state.leaderboard.map((member, idx) => (
              <article className="leaderRow" key={member.id}>
                <div className="rank">#{idx + 1}</div>
                <div className="leaderMain">
                  <strong>{member.name}</strong>
                  <span>
                    Match {member.breakdown.match_points} · Third {member.breakdown.third_place_points} · Final{" "}
                    {member.breakdown.final_points} · Winner {member.breakdown.winner_points}
                  </span>
                </div>
                <div className="leaderPicks">
                  <span>Winner: {member.world_cup_winner || "-"}</span>
                  <span>Final: {member.final_pick?.join(" vs ") || "-"}</span>
                </div>
                <div className="points">{member.points} pts</div>
              </article>
            ))}
          </div>
        </div>

        <aside className="panel payout">
          <p className="eyebrow">Prize Pot</p>
          <h2>Payouts</h2>
          <div className="payLine">
            <span>1st Place</span>
            <strong>{money.format(state.payouts.first)}</strong>
          </div>
          <div className="payLine">
            <span>2nd Place</span>
            <strong>{money.format(state.payouts.second)}</strong>
          </div>
          <div className="payLine muted">
            <span>Total</span>
            <strong>{money.format(state.payouts.pot)}</strong>
          </div>
        </aside>
      </section>

      <section className="panel matchesPanel">
        <div className="sectionHeader row">
          <div>
            <p className="eyebrow">Schedule</p>
            <h2>Match Scores</h2>
          </div>
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team, city, round..."
          />
        </div>
        <div className="matchList">
          {filteredMatches.map((match) => (
            <div className="matchRow" key={match.match_no}>
              <div className="matchInfo">
                <strong>
                  {match.home_team} vs {match.away_team}
                </strong>
                <span>
                  #{match.match_no} · {match.stage} · {dateFmt.format(new Date(match.match_date))} · {match.venue}
                </span>
              </div>
              {state.isAdmin ? (
                <ScoreEditor match={match} onSave={updateScore} disabled={saving} />
              ) : (
                <div className="smallScore">{scoreText(match)}</div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function FeaturedMatch({ match, members }: { match: Match; members: Member[] }) {
  const picks = picksForMatch(members, match);

  return (
    <article className="bigMatch">
      <div className="matchMeta">
        Match {match.match_no} · {match.stage} · {dateFmt.format(new Date(match.match_date))} · {match.venue}
      </div>
      <div className="teamsBig">
        <div className="teamSide">
          <h3>{match.home_team}</h3>
          <PickerList title="Picked this side" picks={picks.home} />
        </div>
        <div className="scoreBubble">
          <strong>{scoreText(match)}</strong>
          <span>{match.status === "completed" ? "Final" : "Scheduled"}</span>
        </div>
        <div className="teamSide right">
          <h3>{match.away_team}</h3>
          <PickerList title="Picked this side" picks={picks.away} />
        </div>
      </div>
      {picks.draw.length > 0 && <PickerList title="Picked draw" picks={picks.draw} compact />}
    </article>
  );
}

function PickerList({
  title,
  picks,
  compact = false,
}: {
  title: string;
  picks: Array<{ name: string; score: string }>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "pickerStrip" : "pickerList"}>
      <span className="pickerTitle">{title}</span>
      {picks.length === 0 ? (
        <p>No picks</p>
      ) : (
        picks.map((pick) => (
          <span className="pickerChip" key={`${pick.name}-${pick.score}`}>
            {pick.name} <small>{pick.score}</small>
          </span>
        ))
      )}
    </div>
  );
}

function ScoreEditor({
  match,
  onSave,
  disabled,
}: {
  match: Match;
  disabled: boolean;
  onSave: (
    match: Match,
    homeTeam: string,
    awayTeam: string,
    homeScore: string,
    awayScore: string,
    homePenalty: string,
    awayPenalty: string,
  ) => void | Promise<void>;
}) {
  const [homeTeam, setHomeTeam] = useState(match.home_team);
  const [awayTeam, setAwayTeam] = useState(match.away_team);
  const [homeScore, setHomeScore] = useState(match.home_score?.toString() ?? "");
  const [awayScore, setAwayScore] = useState(match.away_score?.toString() ?? "");
  const [homePenalty, setHomePenalty] = useState(match.home_penalty?.toString() ?? "");
  const [awayPenalty, setAwayPenalty] = useState(match.away_penalty?.toString() ?? "");

  const canHavePenalties = !isGroupStage(match);

  useEffect(() => {
    setHomeTeam(match.home_team);
    setAwayTeam(match.away_team);
    setHomeScore(match.home_score?.toString() ?? "");
    setAwayScore(match.away_score?.toString() ?? "");
    setHomePenalty(match.home_penalty?.toString() ?? "");
    setAwayPenalty(match.away_penalty?.toString() ?? "");
  }, [match.home_team, match.away_team, match.home_score, match.away_score, match.home_penalty, match.away_penalty]);

  return (
    <div className="scoreCard">
      <div className="teamEditGrid">
        <input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="Home team" />
        <input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="Away team" />
      </div>
      <div className="scoreTeams">
        <input
          className="scoreInput"
          inputMode="numeric"
          value={homeScore}
          onChange={(e) => setHomeScore(e.target.value)}
          placeholder="H"
        />
        <span>:</span>
        <input
          className="scoreInput"
          inputMode="numeric"
          value={awayScore}
          onChange={(e) => setAwayScore(e.target.value)}
          placeholder="A"
        />
      </div>
      {canHavePenalties && (
        <div className="penaltyMini">
          <span>Pens</span>
          <input inputMode="numeric" value={homePenalty} onChange={(e) => setHomePenalty(e.target.value)} placeholder="H" />
          <span>:</span>
          <input inputMode="numeric" value={awayPenalty} onChange={(e) => setAwayPenalty(e.target.value)} placeholder="A" />
        </div>
      )}
      <div className="scoreActions">
        <button
          className="mini"
          disabled={disabled}
          onClick={() => onSave(match, homeTeam, awayTeam, homeScore, awayScore, canHavePenalties ? homePenalty : "", canHavePenalties ? awayPenalty : "")}
        >
          Save
        </button>
        <button
          className="mini ghostMini"
          disabled={disabled}
          onClick={() => {
            setHomeScore("");
            setAwayScore("");
            setHomePenalty("");
            setAwayPenalty("");
            onSave(match, homeTeam, awayTeam, "", "", "", "");
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
