import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readMatches } from "@/lib/jsonStore";
import { readMemberFiles } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const matches = await readMatches();
  const members = await readMemberFiles();
  return NextResponse.json({
    ok: true,
    message: `Data ready: ${matches.length} matches and ${members.length} member prediction files.`,
    matches: matches.length,
    members: members.length,
  });
}
