import { NextResponse } from "next/server";
import { getSchedule, getUserMapping } from "@/lib/googleSheets";

export async function GET() {
  try {
    const data = await getSchedule();
    const userMapping = await getUserMapping();
    return NextResponse.json({ data, userMapping });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
} 