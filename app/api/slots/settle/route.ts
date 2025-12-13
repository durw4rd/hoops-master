import { NextResponse } from "next/server";
import { settleSlotById } from "@/lib/googleSheets";

export async function PATCH(req: Request) {
  try {
    const { slotId, requestingUser, adminMode } = await req.json();
    if (!slotId || !requestingUser) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await settleSlotById({ slotId, requestingUser, adminMode });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
} 