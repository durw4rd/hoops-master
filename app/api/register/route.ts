import { NextRequest, NextResponse } from "next/server";
import { getGoogleSheetsClient } from "@/lib/googleSheets";

const USER_MAPPING_SHEET = "User mapping";

export async function POST(req: NextRequest) {
  try {
    const { name, email } = await req.json();
    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    if (name.trim().includes(" ")) {
      return NextResponse.json({ error: "Name must be a single word (no spaces)." }, { status: 400 });
    }
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;

    // Fetch all names from column A
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${USER_MAPPING_SHEET}!A:A`,
    });
    const names = (res.data.values || []).map(row => row[0]?.trim()).filter(Boolean);
    const lowerName = name.trim().toLowerCase();
    const lowerNames = names.map(n => n.toLowerCase());
    if (lowerNames.includes(lowerName)) {
      return NextResponse.json({ error: "This name is already taken. Gotta choose a different name." }, { status: 400 });
    }

    // Find the first empty row
    const rowCount = res.data.values ? res.data.values.length : 0;
    const nextRow = rowCount + 1; // 1-based index, +1 for next empty row

    // Write name to column A and email to column B in the same row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${USER_MAPPING_SHEET}!A${nextRow}:B${nextRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[name, email]],
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unknown error." }, { status: 500 });
  }
} 