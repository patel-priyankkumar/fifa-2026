import { NextResponse } from "next/server";
import { readMatches } from "@/lib/jsonStore";
import { getMemberScoreDetails, readMemberFiles } from "@/lib/scoring";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const matches = await readMatches();
    const members = await readMemberFiles();

    const member = members.find((member) => member.id === id);

    if (!member) {
      return NextResponse.json(
        {
          error: "Member not found",
          id,
          availableIds: members.map((member) => member.id),
        },
        { status: 404 },
      );
    }

    const details = getMemberScoreDetails(member, matches);

    return NextResponse.json(details);
  } catch (error) {
    console.error("GET /api/admin/entrants/[id] failed:", error);

    return NextResponse.json(
      { error: "Could not load member score sheet" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Applicants now come from data/members-JSON/*.json. Delete the player JSON file from that folder.",
    },
    { status: 400 },
  );
}