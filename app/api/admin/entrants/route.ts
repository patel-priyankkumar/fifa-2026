// entrants/route.ts
import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    { error: "Applicants now come from data/members-JSON/*.json. Add player JSON files to that folder." },
    { status: 400 },
  );
}
