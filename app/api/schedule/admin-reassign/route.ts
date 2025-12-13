import { NextRequest, NextResponse } from "next/server";
import { getGoogleSheetsClient } from "@/lib/googleSheets";
import { normalizeDate } from "@/lib/utils";
import { v4 as uuidv4 } from 'uuid';

const SCHEDULE_SHEET = "Daily schedule";
const SLOTS_SHEET = "Marketplace";

export async function POST(req: NextRequest) {
  try {
    const { date, time, fromPlayer, toPlayer } = await req.json();
    
    if (!date || !time || !fromPlayer || !toPlayer) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Get the user's email from the request headers
    const userEmail = req.headers.get('x-user-email');
    
    if (!userEmail) {
      return NextResponse.json({ error: "User authentication required." }, { status: 401 });
    }

    // Admin validation is handled by the client-side LaunchDarkly 'admin-mode' flag
    // This endpoint will only be called when admin mode is enabled

    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;

    // 1. Update the schedule: remove fromPlayer, add toPlayer for the session
    // Fetch the schedule rows - start from B5 but no upper limit
    const scheduleRange = `${SCHEDULE_SHEET}!B5:C`;
    
    const scheduleRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: scheduleRange,
    });
    const scheduleRows = scheduleRes.data.values || [];

    // Find the row for the session
    let sessionRowIdx = -1;
    let players: string[] = [];
    
    for (let i = 0; i < scheduleRows.length; i++) {
      const [details, playerList] = scheduleRows[i];
      if (!details) continue;
      
      // Format: 'DD.MM / weekDay / HH:MM - HH:MM'
      const [rowDate, , rowTime] = details.split(' / ');
      
      const normalizedRowDate = normalizeDate(rowDate?.trim());
      const normalizedRequestDate = normalizeDate(date);
      const rowTimeTrimmed = rowTime?.trim();
      const requestTimeTrimmed = time?.trim();
      
      if (normalizedRowDate === normalizedRequestDate && rowTimeTrimmed === requestTimeTrimmed) {
        sessionRowIdx = i;
        players = (playerList || '').split(',').map((p: string) => p.trim()).filter(Boolean);
        break;
      }
    }
    
    if (sessionRowIdx === -1) {
      return NextResponse.json({ error: "Session not found in schedule." }, { status: 404 });
    }

    // Remove fromPlayer, add toPlayer (replace exactly one instance)
    const playerIdx = players.findIndex(p => p.toLowerCase() === fromPlayer.toLowerCase());
    if (playerIdx !== -1) {
      players.splice(playerIdx, 1, toPlayer); // Replace exactly one instance
    } else {
      players.push(toPlayer); // If not found, just add
    }

    // Write back the updated player list
    // Since we're fetching from B5:C, we need to add 5 to get the actual row number
    const actualRowNumber = sessionRowIdx + 5;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SCHEDULE_SHEET}!C${actualRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[players.join(', ')]] },
    });

    // 2. Add entry to Marketplace with status 'admin-reassigned'
    const now = new Date().toISOString();
    const slotId = uuidv4();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SLOTS_SHEET}!A:K`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[slotId, date, time, fromPlayer, 'admin-reassigned', '', '', '', toPlayer, now]],
      },
    });

    return NextResponse.json({ 
      success: true,
      message: `Admin reassignment completed: ${fromPlayer} → ${toPlayer}`,
      adminUser: userEmail
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unknown error." }, { status: 500 });
  }
} 