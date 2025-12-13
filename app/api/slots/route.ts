import { NextResponse } from "next/server";
import { getAvailableSlots, offerSlotForGrabs, claimSlotById, claimFreeSpot, retractSlotById, getAllSlots } from "@/lib/googleSheets";

export async function GET() {
  try {
    const slots = await getAllSlots();
    return NextResponse.json({ slots });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { date, time, player } = await req.json();
    if (!date || !time || !player) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await offerSlotForGrabs({ date, time, player });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { slotId, date, time, claimer } = await req.json();
    
    // If slotId is provided, claim an existing offered slot
    if (slotId) {
      if (!slotId || !claimer) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
      const result = await claimSlotById({ slotId, claimer });
      return NextResponse.json(result);
    } 
    // If date and time are provided, claim a free spot
    else if (date && time && claimer) {
      const result = await claimFreeSpot({ date, time, claimer });
      return NextResponse.json(result);
    } 
    else {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { slotId } = await req.json();
    if (!slotId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await retractSlotById({ slotId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

 