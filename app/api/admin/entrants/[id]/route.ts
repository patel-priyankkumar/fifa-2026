import { NextResponse } from "next/server";
export async function DELETE() {
  return NextResponse.json(
    { error: "Applicants now come from data/members-JSON/*.json. Delete the player JSON file from that folder." },
    { status: 400 },
  );
}
