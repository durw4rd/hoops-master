import { NextRequest, NextResponse } from "next/server";
import { updateExpiredSlots } from "@/lib/googleSheets";

export async function POST(req: NextRequest) {
  try {
    const { expiredSlots } = await req.json();
    const result = await updateExpiredSlots(expiredSlots);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating expired slots:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message || 'Failed to update expired slots' 
    });
  }
} 