import { NextResponse } from "next/server";
import { requestSlotSwapFromSchedule, acceptSlotSwapById } from "@/lib/googleSheets";

export async function POST(req: Request) {
  try {
    const { date, time, player, requestedDate, requestedTime } = await req.json();
    
    if (!date || !time || !player || !requestedDate || !requestedTime) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    const result = await requestSlotSwapFromSchedule({ date, time, player, requestedDate, requestedTime });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { slotId, acceptingPlayer } = await req.json();
    if (!slotId || !acceptingPlayer) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await acceptSlotSwapById({ slotId, acceptingPlayer });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
} 