"use client";

import { useEffect, useMemo, useState } from "react";
import { teamFlag, teamLabel } from "@/lib/flags";

type Entrant = {
  id: string;
  name: string;
  team: string;
  paid: boolean;
  points?: number;
};

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

type Featured = {
  label: string;
  matches: Match[];
};

type Payouts = {
  paidEntries: number;
  pot: number;
  first: number;
  second: number;
};

type State = {
  isAdmin: boolean;
  entrants: Entrant[];
  matches: Match[];
  leaderboard: Entrant[];
  featured: Featured;
  payouts: Payouts;
};

type LeaderboardEntrant = Entrant & {
  points: number;
};

const ENTRY_FEE = 30;

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto",
});

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "America/Toronto",
});

function clean(value: string) {
  return value.trim().toLowerCase();
}

function isGroupStage(match: Match) {
  return match.stage.toLowerCase().includes("group");
}

function isCompletedMatch(match: Match) {
  return (
    match.status === "completed" &&
    typeof match.home_score === "number" &&
    typeof match.away_score === "number"
  );
}

function isSameTorontoDate(a: Date, b: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(a) === formatter.format(b);
}

function teamOwners(entrants: Entrant[], team: string) {
  const selectedTeam = clean(team);

  return entrants
    .filter((entrant) => clean(entrant.team) === selectedTeam)
    .map((entrant) => entrant.name);
}

function getMatchWinner(match: Match): string | null {
  if (!isCompletedMatch(match)) return null;

  if (match.home_score! > match.away_score!) {
    return match.home_team;
  }

  if (match.away_score! > match.home_score!) {
    return match.away_team;
  }

  const hasPenalties =
    typeof match.home_penalty === "number" &&
    typeof match.away_penalty === "number";

  if (hasPenalties) {
    if (match.home_penalty! > match.away_penalty!) {
      return match.home_team;
    }

    if (match.away_penalty! > match.home_penalty!) {
      return match.away_team;
    }
  }

  return null;
}

function calculateEntrantPoints(entrant: Entrant, matches: Match[]) {
  let points = 0;
  const pickedTeam = clean(entrant.team);

  for (const match of matches) {
    if (!isCompletedMatch(match)) continue;

    const isHomePick = pickedTeam === clean(match.home_team);
    const isAwayPick = pickedTeam === clean(match.away_team);

    if (!isHomePick && !isAwayPick) continue;

    const winner = getMatchWinner(match);

    if (winner) {
      if (pickedTeam === clean(winner)) {
        points += 3;
      }

      continue;
    }

    // Only true draws should give 1 point.
    // Group-stage draws are normal. Knockout draws without penalties are rare,
    // but this safely avoids giving 3 points by mistake.
    if (match.home_score === match.away_score) {
      points += 1;
    }
  }

  return points;
}

function buildLeaderboard(entrants: Entrant[], matches: Match[]) {
  return entrants
    .map((entrant) => ({
      ...entrant,
      points: calculateEntrantPoints(entrant, matches),
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.name.localeCompare(b.name);
    });
}

function buildPayouts(entrants: Entrant[]): Payouts {
  const paidEntries = entrants.filter((entrant) => entrant.paid).length;
  const pot = paidEntries * ENTRY_FEE;

  return {
    paidEntries,
    pot,
    first: pot * 0.8,
    second: pot * 0.2,
  };
}

function buildFeatured(matches: Match[]): Featured {
  const now = new Date();

  const sortedUpcoming = [...matches]
    .filter((match) => match.status !== "completed")
    .sort(
      (a, b) =>
        new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
    );

  const todayMatches = sortedUpcoming.filter((match) =>
    isSameTorontoDate(new Date(match.match_date), now),
  );

  if (todayMatches.length) {
    return {
      label: "Today's Matches",
      matches: todayMatches,
    };
  }

  const nextMatch = sortedUpcoming[0];

  if (!nextMatch) {
    return {
      label: "Tournament Completed",
      matches: [],
    };
  }

  const nextDate = new Date(nextMatch.match_date);

  return {
    label: `Next Matches — ${dayFmt.format(nextDate)}`,
    matches: sortedUpcoming.filter((match) =>
      isSameTorontoDate(new Date(match.match_date), nextDate),
    ),
  };
}

function scoreToText(value: number | null | undefined) {
  return typeof value === "number" ? String(value) : "-";
}

function toScoreInput(value: number | null | undefined) {
  return typeof value === "number" ? String(value) : "";
}

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const [paid, setPaid] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const res = await fetch("/api/state", { cache: "no-store" });

    if (!res.ok) {
      setMessage("Could not load app data.");
      setLoading(false);
      return;
    }

    const data: State = await res.json();

    setState(data);
    setLoading(false);
  }

  useEffect(() => {
    refresh();

    const intervalId = window.setInterval(refresh, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  const leaderboard = useMemo<LeaderboardEntrant[]>(() => {
    if (!state) return [];
    return buildLeaderboard(state.entrants, state.matches);
  }, [state]);

  const payouts = useMemo<Payouts>(() => {
    if (!state) {
      return {
        paidEntries: 0,
        pot: 0,
        first: 0,
        second: 0,
      };
    }

    return buildPayouts(state.entrants);
  }, [state]);

  const featured = useMemo<Featured>(() => {
    if (!state) {
      return {
        label: "Featured Matches",
        matches: [],
      };
    }

    return buildFeatured(state.matches);
  }, [state]);

  const filteredMatches = useMemo(() => {
    if (!state) return [];

    const query = search.trim().toLowerCase();

    return state.matches.filter((match) => {
      if (!query) return true;

      return [
        match.home_team,
        match.away_team,
        match.venue,
        match.stage,
        String(match.match_no),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [state, search]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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

    await fetch("/api/admin/logout", {
      method: "POST",
    });

    setSaving(false);
    setMessage("Logged out.");

    await refresh();
  }

  async function checkJsonFiles() {
    setSaving(true);
    setMessage("Checking JSON files...");

    const res = await fetch("/api/admin/seed", {
      method: "POST",
    });

    const data = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setMessage(data.error || "Could not check JSON files.");
      return;
    }

    setMessage(data.message || `JSON files ready with ${data.count} matches.`);

    await refresh();
  }

  async function syncLiveScores() {
    setSaving(true);
    setMessage("Checking free live score source...");

    const res = await fetch("/api/admin/sync-live", {
      method: "POST",
    });

    const data = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setMessage(data.error || "Could not sync live scores.");
      return;
    }

    setMessage(data.message || "Live scores checked.");

    await refresh();
  }

  async function addEntrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newName.trim()) {
      setMessage("Please enter the applicant name.");
      return;
    }

    if (!newTeam.trim()) {
      setMessage("Please enter the FIFA team picked.");
      return;
    }

    setSaving(true);
    setMessage("");

    const res = await fetch("/api/admin/entrants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: newName.trim(),
        team: newTeam.trim(),
        paid,
      }),
    });

    const data = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setMessage(data.error || "Could not add applicant.");
      return;
    }

    setNewName("");
    setNewTeam("");
    setPaid(true);
    setMessage("Applicant added.");

    await refresh();
  }

  async function deleteEntrant(id: string) {
    const confirmed = window.confirm("Delete this applicant?");

    if (!confirmed) return;

    setSaving(true);

    const res = await fetch(`/api/admin/entrants/${id}`, {
      method: "DELETE",
    });

    setSaving(false);

    if (!res.ok) {
      setMessage("Could not delete applicant.");
      return;
    }

    setMessage("Applicant deleted.");

    await refresh();
  }

  async function updateScore(
    match: Match,
    homeScore: string,
    awayScore: string,
    homePenalty: string,
    awayPenalty: string,
  ) {
    const home = homeScore.trim();
    const away = awayScore.trim();
    const homePens = homePenalty.trim();
    const awayPens = awayPenalty.trim();

    const hasOneMainScore = home !== "" || away !== "";
    const hasBothMainScores = home !== "" && away !== "";

    if (hasOneMainScore && !hasBothMainScores) {
      setMessage("Enter both home and away scores, or leave both blank.");
      return;
    }

    if (home !== "" && Number.isNaN(Number(home))) {
      setMessage("Home score must be a number.");
      return;
    }

    if (away !== "" && Number.isNaN(Number(away))) {
      setMessage("Away score must be a number.");
      return;
    }

    const hasOnePenaltyScore = homePens !== "" || awayPens !== "";
    const hasBothPenaltyScores = homePens !== "" && awayPens !== "";

    if (hasOnePenaltyScore && !hasBothPenaltyScores) {
      setMessage("Enter both penalty scores, or leave both blank.");
      return;
    }

    if (homePens !== "" && Number.isNaN(Number(homePens))) {
      setMessage("Home penalty score must be a number.");
      return;
    }

    if (awayPens !== "" && Number.isNaN(Number(awayPens))) {
      setMessage("Away penalty score must be a number.");
      return;
    }

    setSaving(true);
    setMessage("Saving score...");

    const res = await fetch(`/api/admin/matches/${match.match_no}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        home_score: home,
        away_score: away,
        home_penalty: isGroupStage(match) ? "" : homePens,
        away_penalty: isGroupStage(match) ? "" : awayPens,
      }),
    });

    const data = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setMessage(data.error || "Could not save score.");
      return;
    }

    setMessage(hasBothMainScores ? "Score saved." : "Score cleared.");

    await refresh();
  }

  if (loading || !state) {
    return (
      <main className="loading">
        <div className="loadingCard">
          <span className="loadingLogo">SVP</span>
          <strong>Loading SVP SPORTS FIFA 2026...</strong>
        </div>
      </main>
    );
  }

  return (
    <main className="appPage">
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
            <p className="eyebrow">World Cup Pool</p>

            <h1>Leaderboard, match picks, scores, and payouts.</h1>

            <p className="subtitle">
              Each applicant picks a FIFA team. When a match is completed, the
              leaderboard updates automatically. Scheduled matches never award
              points.
            </p>
          </div>

          <div className="statCard">
            <span>Total Pot</span>
            <strong>{money.format(payouts.pot)}</strong>
            <small>
              {payouts.paidEntries} paid entries × {money.format(ENTRY_FEE)}
            </small>
          </div>
        </div>
      </section>

      {adminOpen && (
        <section className="adminShell">
          {!state.isAdmin ? (
            <form className="adminCard" onSubmit={login}>
              <h2>Admin Login</h2>

              <p>Only the admin can add applicants and update match scores.</p>

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Admin password"
              />

              <button disabled={saving}>
                {saving ? "Checking..." : "Login"}
              </button>
            </form>
          ) : (
            <div className="adminGrid">
              <form className="adminCard" onSubmit={addEntrant}>
                <h2>Add Applicant</h2>

                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Person name"
                />

                <input
                  value={newTeam}
                  onChange={(event) => setNewTeam(event.target.value)}
                  placeholder="FIFA team picked, e.g. Canada"
                />

                <label className="check">
                  <input
                    type="checkbox"
                    checked={paid}
                    onChange={(event) => setPaid(event.target.checked)}
                  />
                  Paid {money.format(ENTRY_FEE)}
                </label>

                <button disabled={saving}>
                  {saving ? "Saving..." : "Add Applicant"}
                </button>
              </form>

              <div className="adminCard">
                <h2>Admin Tools</h2>

                <p>
                  Data is stored in <strong>data/people.json</strong> and{" "}
                  <strong>data/matches.json</strong>.
                </p>

                <button onClick={checkJsonFiles} disabled={saving}>
                  Check JSON Files
                </button>

                <button onClick={syncLiveScores} disabled={saving}>
                  Sync Free Live Scores
                </button>

                <p className="hint">
                  Manual score editing still works if the free score source is
                  unavailable.
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
          <h2>{featured.label}</h2>
        </div>

        <div className="matchCards">
          {featured.matches.length === 0 && (
            <div className="empty">
              No upcoming matches found. Load the schedule in admin.
            </div>
          )}

          {featured.matches.map((match) => {
            const homeOwners = teamOwners(state.entrants, match.home_team);
            const awayOwners = teamOwners(state.entrants, match.away_team);

            return (
              <article className="bigMatch" key={match.match_no}>
                <div className="matchMeta">
                  Match {match.match_no} · {match.stage} ·{" "}
                  {dateFmt.format(new Date(match.match_date))} · {match.venue}
                </div>

                <div className="teamsBig">
                  <div className="teamSide">
                    <div className="flagHero">{teamFlag(match.home_team)}</div>
                    <h3>{match.home_team}</h3>
                    <PickerGrid names={homeOwners} />
                  </div>

                  <div className="scoreBubble">
                    <ScoreDisplay match={match} />
                  </div>

                  <div className="teamSide right">
                    <div className="flagHero">{teamFlag(match.away_team)}</div>
                    <h3>{match.away_team}</h3>
                    <PickerGrid names={awayOwners} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="contentGrid">
        <div className="panel leaderboard">
          <div className="sectionHeader row">
            <div>
              <p className="eyebrow">Standings</p>
              <h2>Leaderboard</h2>
            </div>

            <span className="pill">Auto sorted</span>
          </div>

          <div className="leaderboardTable">
            <div className="leaderboardHead">
              <span>Rank</span>
              <span>Name</span>
              <span>Team</span>
              <span>Points</span>
              {state.isAdmin && <span>Action</span>}
            </div>

            {leaderboard.length === 0 && (
              <div className="empty">No applicants added yet.</div>
            )}

            {leaderboard.map((entrant, index) => (
              <article className="leaderboardRow" key={entrant.id}>
                <div className="rankCell">#{index + 1}</div>

                <div className="nameCell">
                  <span className="entrantFlag">{teamFlag(entrant.team)}</span>
                  <strong>{entrant.name}</strong>
                </div>

                <div className="teamCell">{entrant.team}</div>

                <div className="pointsCell">
                  <strong>{entrant.points}</strong>
                  <span>pts</span>
                </div>

                {state.isAdmin && (
                  <button
                    className="mini danger"
                    onClick={() => deleteEntrant(entrant.id)}
                    disabled={saving}
                  >
                    Delete
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>

        <aside className="panel payout">
          <p className="eyebrow">Prize Pot</p>

          <h2>Payouts</h2>

          <div className="payLine">
            <span>1st Place</span>
            <strong>{money.format(payouts.first)}</strong>
          </div>

          <div className="payLine">
            <span>2nd Place</span>
            <strong>{money.format(payouts.second)}</strong>
          </div>

          <div className="payLine muted">
            <span>Total Pot</span>
            <strong>{money.format(payouts.pot)}</strong>
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
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search team, city, round..."
          />
        </div>

        <div className="matchList">
          {filteredMatches.map((match) => (
            <div className="matchRow" key={match.match_no}>
              <div className="matchInfo">
                <strong>
                  {teamLabel(match.home_team)} vs {teamLabel(match.away_team)}
                </strong>

                <span>
                  #{match.match_no} · {match.stage} ·{" "}
                  {dateFmt.format(new Date(match.match_date))} · {match.venue}
                </span>
              </div>

              {state.isAdmin ? (
                <ScoreEditor match={match} onSave={updateScore} />
              ) : (
                <div className="smallScore">
                  <ScoreDisplay match={match} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function ScoreDisplay({ match }: { match: Match }) {
  const main = `${scoreToText(match.home_score)} : ${scoreToText(
    match.away_score,
  )}`;

  const hasPenalties =
    typeof match.home_penalty === "number" &&
    typeof match.away_penalty === "number";

  return (
    <span className="scoreStack">
      <strong>{main}</strong>
 
      {hasPenalties && (
        <small>
          Pens {match.home_penalty}-{match.away_penalty}
        </small>
      )}

      {match.status !== "completed" && <small></small>}
    </span>
  );
}

function PickerGrid({ names }: { names: string[] }) {
  if (!names.length) {
    return <p className="noPicks">No picks yet</p>;
  }

  return (
    <div className="pickerGrid">
      {names.map((name) => (
        <span key={name}>{name}</span>
      ))}
    </div>
  );
}

function ScoreEditor({
  match,
  onSave,
}: {
  match: Match;
  onSave: (
    match: Match,
    homeScore: string,
    awayScore: string,
    homePenalty: string,
    awayPenalty: string,
  ) => void | Promise<void>;
}) {
  const [homeScore, setHomeScore] = useState(toScoreInput(match.home_score));
  const [awayScore, setAwayScore] = useState(toScoreInput(match.away_score));
  const [homePenalty, setHomePenalty] = useState(
    toScoreInput(match.home_penalty),
  );
  const [awayPenalty, setAwayPenalty] = useState(
    toScoreInput(match.away_penalty),
  );

  const groupStage = isGroupStage(match);
  const canHavePenalties = !groupStage;

  useEffect(() => {
    setHomeScore(toScoreInput(match.home_score));
    setAwayScore(toScoreInput(match.away_score));
    setHomePenalty(toScoreInput(match.home_penalty));
    setAwayPenalty(toScoreInput(match.away_penalty));
  }, [
    match.home_score,
    match.away_score,
    match.home_penalty,
    match.away_penalty,
  ]);

  return (
    <div className="scoreCard">
      <div className="scoreCardHeader">
        <span className="scoreCardTitle">Update Score</span>
        <span className="scoreCardStage">{match.stage}</span>
      </div>

      <div className="scoreTeams">
        <label className="scoreTeam">
          <span className="teamLabel">{match.home_team}</span>
          <input
            className="scoreInput"
            inputMode="numeric"
            min="0"
            value={homeScore}
            onChange={(event) => setHomeScore(event.target.value)}
            placeholder="0"
          />
        </label>

        <div className="scoreDivider">FT</div>

        <label className="scoreTeam">
          <span className="teamLabel">{match.away_team}</span>
          <input
            className="scoreInput"
            inputMode="numeric"
            min="0"
            value={awayScore}
            onChange={(event) => setAwayScore(event.target.value)}
            placeholder="0"
          />
        </label>
      </div>

      {canHavePenalties && (
        <div className="penaltyPanel">
          <div className="penaltyHeader">
            <span>Penalty Shootout</span>
            <small>Only use if tied after extra time</small>
          </div>

          <div className="penaltyInputs">
            <label className="penaltyTeam">
              <span>{match.home_team}</span>
              <input
                className="penaltyInput"
                inputMode="numeric"
                min="0"
                value={homePenalty}
                onChange={(event) => setHomePenalty(event.target.value)}
                placeholder="—"
              />
            </label>

            <span className="penaltyColon">:</span>

            <label className="penaltyTeam">
              <span>{match.away_team}</span>
              <input
                className="penaltyInput"
                inputMode="numeric"
                min="0"
                value={awayPenalty}
                onChange={(event) => setAwayPenalty(event.target.value)}
                placeholder="—"
              />
            </label>
          </div>
        </div>
      )}

      <div className="scoreActions">
        <button
          className="mini"
          onClick={() =>
            onSave(
              match,
              homeScore,
              awayScore,
              canHavePenalties ? homePenalty : "",
              canHavePenalties ? awayPenalty : "",
            )
          }
        >
          Save Score
        </button>

        <button
          className="mini ghostMini"
          onClick={() => {
            setHomeScore("");
            setAwayScore("");
            setHomePenalty("");
            setAwayPenalty("");
            onSave(match, "", "", "", "");
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}