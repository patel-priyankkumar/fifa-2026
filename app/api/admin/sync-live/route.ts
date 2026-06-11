import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { readMatches, writeMatches } from "@/lib/jsonStore";
import { syncLiveScores } from "@/lib/liveSync";

export const dynamic = "force-dynamic";

export async function POST() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const matches = await readMatches();
    const synced = await syncLiveScores(matches);
    if (synced.result.updated > 0) {
      await writeMatches(synced.matches);
    }
    return NextResponse.json(synced.result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not sync live scores.",
      },
      { status: 500 },
    );
  }
}
