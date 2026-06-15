import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Live score sync is not enabled in this version. Update scores manually in Admin." }, { status: 400 });
}
