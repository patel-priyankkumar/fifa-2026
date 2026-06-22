# FIFA 2026

A Vercel-ready single-page Next.js app for the FIFA 2026 pool.

## What it does

- Public view-only leaderboard
- Admin login with static password
- Admin can add applicants: `Name`, `Team`, `Paid`
- Admin can update match scores
- Points update automatically and leaderboard sorts automatically
- Big featured section shows today's matches; if there are no matches today, it shows the next match day
- Each side of the featured match shows the people who picked that team
- Payouts are calculated at the end: $30 per paid entry, 80% to 1st place, 20% to 2nd place

## JSON storage

This version uses exactly two JSON data files:

```text
data/matches.json
data/people.json
```

`data/matches.json` contains the FIFA 2026 match schedule and score/status fields.

`data/people.json` contains the applicants:

```json
[
  {
    "id": "example-id",
    "name": "Aniket",
    "team": "Canada",
    "paid": true,
    "created_at": "2026-06-10T00:00:00.000Z"
  }
]
```

## Important Vercel note

Vercel does **not** permanently save edits made directly to files on its serverless filesystem. To keep this JSON-based and still save data on Vercel, this app writes changes back to your GitHub repo using the GitHub Contents API.

That means:

- Public visitors read the JSON data through the app.
- Admin updates scores/applicants from the website.
- The app commits those updates back into `data/matches.json` and `data/people.json` in GitHub.
- Vercel keeps showing the saved data.

When running locally without GitHub env variables, it writes directly to the local JSON files.

## Scoring used in this version

Because the requested public table is only `Name / Team / Points`, this app treats every applicant as picking/owning one FIFA team.

Points are calculated from that team's completed matches:

- Win = 3 points
- Draw = 1 point
- Loss = 0 points

## Vercel setup

### 1. Push this project to GitHub

You already did this step.

### 2. Create a GitHub token

Create a fine-grained GitHub personal access token for this repository with:

- Repository access: only this repository
- Permissions: `Contents` -> `Read and write`

Keep the token private. Do not commit it to GitHub.

### 3. Add environment variables in Vercel

In Vercel, open your project:

`Settings -> Environment Variables`

Add these:

```env
ADMIN_PASSWORD="svp6931"
ADMIN_SESSION_SECRET="make-this-a-long-random-string"
GITHUB_TOKEN="your-github-token"
GITHUB_REPO="your-github-username-or-org/your-repo-name"
GITHUB_BRANCH="main"
```

Example:

```env
GITHUB_REPO="aniket/svp-sports-fifa-2026"
GITHUB_BRANCH="main"
```

After adding env variables, redeploy the project.

### 4. Deploy to Vercel

In Vercel:

`Add New -> Project -> Import your GitHub repository -> Deploy`

### 5. Open the admin panel

Open your deployed site, click `Admin Login`, and use:

```text
svp6931
```


## Flags, grids, penalties, and live score sync

This version includes:

- Country flags beside teams throughout the app.
- Card/grid layout for the leaderboard and pickers instead of a plain list.
- Separate penalty fields for each match. If a tied knockout match has penalties entered, the penalty winner gets the win points instead of both sides getting draw points.
- Optional admin button: `Sync Free Live Scores`. It reads from a free World Cup 2026 JSON API and updates `data/matches.json` when score changes are found.

By default, live sync uses:

```env
LIVE_SCORES_URL="https://worldcup26.ir/get/games"
```

You can leave this unset and the app will use that default. Manual score entry always remains available in case the free source changes, becomes unavailable, or is delayed.

## Admin usage

- Add applicants from the admin panel.
- Enter the exact FIFA team name, for example `Canada`, `USA`, `Brazil`, `Germany`.
- Update match scores in the `Match Scores` section.
- Once both scores are entered, the match is marked completed and points update.
- Clear either score to return the match to scheduled.

## Local development

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

Local changes update the JSON files directly if `GITHUB_TOKEN` and `GITHUB_REPO` are not set.

## Notes

- Times are shown in `America/Toronto` time.
- Knockout matches use placeholders like `W101`, `L101`, etc. You can manually edit `data/matches.json` later when the real teams are known.
