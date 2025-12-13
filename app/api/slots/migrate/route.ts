import { NextResponse } from "next/server";
import { migrateExistingSlots } from "@/lib/googleSheets";

export async function POST(req: Request) {
  try {
    const result = await migrateExistingSlots();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
} 