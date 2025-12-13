import { google } from "googleapis";
import { normalizeDate } from "@/lib/utils";
import { v4 as uuidv4 } from 'uuid';

// Sheet and range constants
/** Name of the daily schedule sheet */
const SHEET_DAILY_SCHEDULE = "Daily schedule";
/** Name of the marketplace sheet */
const SHEET_MARKETPLACE = "Marketplace";
/** Name of the user mapping sheet */
const SHEET_USER_MAPPING = "User mapping";
/** Name of the tournament sheet */
const SHEET_TOURNAMENT = "Tournament";
/** Range for the schedule (update as needed for new rows) */
const RANGE_SCHEDULE = `${SHEET_DAILY_SCHEDULE}!B5:D`;
/** Range for the marketplace sheet (now includes ID column) */
const RANGE_SLOTS = `${SHEET_MARKETPLACE}!A:K`;
/** Range for the user mapping sheet */
const RANGE_USER_MAPPING = `${SHEET_USER_MAPPING}!A2:E`;
/** Range for the tournament sheet (4 columns, 5 rows: team names + 4 players each) */
const RANGE_TOURNAMENT = `${SHEET_TOURNAMENT}!A1:D5`;
/** The starting row for the schedule (for C column updates) */
const SCHEDULE_START_ROW = 5;

// Settlement Batch and Pairing Interfaces
export interface SettlementBatch {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
  status: 'active' | 'settled';
  createdAt: string;
  settledAt?: string;
  linkedSlotsCount?: number;
}

export interface SettlementPairing {
  id: string;
  batchId: string;
  creditorPlayer: string;
  debtorPlayer: string;
  amount: number;
  status: 'pending' | 'completed';
  createdAt: string;
  completedAt?: string;
}

/**
 * Generates a unique ID for a slot
 */
function generateSlotId(): string {
  return uuidv4();
}

export async function getGoogleSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!email || !key || !sheetId) {
    throw new Error("Missing Google Sheets environment variables");
  }
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

/**
 * Fetches the schedule from the Google Sheet.
 */
export async function getSchedule() {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE_SCHEDULE });
  return res.data.values;
}

/**
 * Fetches the user mapping from the Google Sheet.
 */
export async function getUserMapping() {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  // Read all rows from A2:E (skip header, includes smartSettle column)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_USER_MAPPING,
  });
  const values = res.data.values || [];
  // Convert to mapping: { [playerName]: { email, color, role, smartSettle } }
  const mapping: Record<string, { email: string; color?: string; role?: string; smartSettle: boolean }> = {};
  for (const row of values) {
    if (row[0] && row[1]) {
      mapping[row[0]] = { 
        email: row[1], 
        color: row[2], 
        role: row[3], 
        smartSettle: row[4] !== 'false' && row[4] !== 'FALSE' && row[4] !== false // Default to true unless explicitly false
      };
    }
  }
  return mapping;
}

export async function offerSlotForGrabs({ date, time, player }: { date: string; time: string; player: string }) {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const now = new Date().toISOString();
  const slotId = generateSlotId();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE_SLOTS,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[slotId, date, time, player, 'offered', 'no', '', '', '', now]],
    },
  });
  return { success: true, slotId };
}

export async function claimSlotById({ slotId, claimer }: { slotId: string; claimer: string }) {
  const { row, rowNumber } = await findSlotById(slotId);
  
  const date = row[1]; // Date column (B)
  const time = row[2]; // Time column (C)
  const player = row[3]; // Player column (D)
  const status = row[4]; // Status column (E)
  
  if (status !== 'offered') {
    throw new Error('Slot must be offered to be claimed');
  }
  
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const now = new Date().toISOString();
  
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `${SHEET_MARKETPLACE}!E${rowNumber}`,
          values: [['claimed']],
        },
        {
          range: `${SHEET_MARKETPLACE}!I${rowNumber}`,
          values: [[claimer]],
        },
        {
          range: `${SHEET_MARKETPLACE}!J${rowNumber}`,
          values: [[now]],
        },
      ],
    },
  });

  // --- Update Daily schedule sheet ---
  const scheduleRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_SCHEDULE,
  });
  const scheduleRows = scheduleRes.data.values || [];

  // Helper to parse session details from column B
  function parseSessionDetails(details: string) {
    // Format: 'DD.MM / weekDay / HH:MM - HH:MM'
    const [datePart, , timePart] = details.split(' / ');
    return { date: datePart.trim(), time: timePart.trim() };
  }

  // Find the first row that matches date and time
  let found = false;
  for (let i = 0; i < scheduleRows.length; i++) {
    const [details, playerList] = scheduleRows[i];
    if (!details) continue;
    const { date: rowDate, time: rowTime } = parseSessionDetails(details);
    if (normalizeDate(rowDate) === normalizeDate(date) && rowTime === time) {
      // Update player list: remove offering player, add claimer
      let players = (playerList || '').split(',').map((p: string) => p.trim()).filter(Boolean);
      const playerIdx = players.findIndex((p: string) => p.toLowerCase() === player.toLowerCase());
      if (playerIdx !== -1) {
        players.splice(playerIdx, 1, claimer); // Replace offering player with claimer
      } else {
        players.push(claimer); // If not found, just add
      }
      // Write back the updated player list
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_DAILY_SCHEDULE}!C${i + SCHEDULE_START_ROW}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[players.join(', ')]],
        },
      });
      found = true;
      break;
    }
  }
  // Optionally, could throw if not found, but for now just proceed

  return { success: true };
}

export async function claimFreeSpot({ date, time, claimer }: { date: string; time: string; claimer: string }) {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const now = new Date().toISOString();
  const slotId = generateSlotId();
  
  // Add new entry to Marketplace for the claimed free spot
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE_SLOTS,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[slotId, date, time, 'free spot', 'claimed', 'no', '', '', claimer, now]],
    },
  });
  
  // Also update the Daily schedule sheet to add the claimer to the session's player list
  const scheduleRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_SCHEDULE,
  });
  const scheduleRows = scheduleRes.data.values || [];
  
  // Helper to parse session details from column B
  function parseSessionDetails(details: string) {
    // Format: 'DD.MM / weekDay / HH:MM - HH:MM'
    const [datePart, , timePart] = details.split(' / ');
    return { date: datePart.trim(), time: timePart.trim() };
  }
  
  for (let i = 0; i < scheduleRows.length; i++) {
    const [details, playerList] = scheduleRows[i];
    if (!details) continue;
    const { date: rowDate, time: rowTime } = parseSessionDetails(details);
    if (normalizeDate(rowDate) === normalizeDate(date) && rowTime === time) {
      // Append the claimer to the player list
      let players = (playerList || '').split(',').map((p: string) => p.trim()).filter(Boolean);
      players.push(claimer);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_DAILY_SCHEDULE}!C${i + SCHEDULE_START_ROW}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[players.join(', ')]],
        },
      });
      break;
    }
  }
  
  return { success: true, slotId };
}

export async function retractSlotById({ slotId }: { slotId: string }) {
  const { row, rowNumber } = await findSlotById(slotId);
  
  const status = row[4]; // Status column (E)
  if (status !== 'offered') {
    throw new Error('Slot must be offered to be retracted');
  }
  
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const now = new Date().toISOString();
  
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `${SHEET_MARKETPLACE}!E${rowNumber}`,
          values: [['retracted']],
        },
        {
          range: `${SHEET_MARKETPLACE}!I${rowNumber}`,
          values: [['']],
        },
        {
          range: `${SHEET_MARKETPLACE}!J${rowNumber}`,
          values: [[now]],
        },
      ],
    },
  });
  return { success: true };
}



export async function settleSlotById({ slotId, requestingUser, adminMode = false }: { slotId: string; requestingUser: string; adminMode?: boolean }) {
  const { row, rowNumber } = await findSlotById(slotId);
  
  const date = row[1]; // Date column (B)
  const time = row[2]; // Time column (C)
  const player = row[3]; // Player column (D)
  const status = row[4]; // Status column (E)
  const swapRequested = row[5]; // SwapRequested column (F)
  const settled = row[10]; // Settled column (K)
  
  // Validate that slot can be settled
  if (!['claimed', 'reassigned', 'admin-reassigned'].includes(status)) {
    throw new Error('Slot must be claimed, reassigned, or admin-reassigned to be settled');
  }
  
  // Exclude swapped slots
  if (swapRequested === 'yes') {
    throw new Error('Swapped slots cannot be settled');
  }
  
  // Check if slot is in the past
  const [day, month] = date.split('.').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const slotDate = new Date(new Date().getFullYear(), month - 1, day, hour, minute);
  const now = new Date();
  
  if (slotDate > now) {
    throw new Error('Only past slots can be settled');
  }
  
  // Check permissions - only original owner or admin can settle
  if (!adminMode && requestingUser !== player) {
    throw new Error('Only the original slot owner or admins can settle slots');
  }
  
  const newSettledValue = settled === 'yes' ? 'no' : 'yes';
  
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `${SHEET_MARKETPLACE}!K${rowNumber}`,
          values: [[newSettledValue]],
        },
      ],
    },
  });
  return { success: true, settled: newSettledValue === 'yes' };
}

/**
 * Finds a slot by its unique ID
 */
export async function findSlotById(slotId: string) {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_SLOTS,
  });
  const values = res.data.values || [];
  const header = values[0];
  const rows = values.slice(1);
  const idx = rows.findIndex(row => row[0] === slotId);
  if (idx === -1) throw new Error('Slot not found');
  return { row: rows[idx], rowNumber: idx + 2, header };
}

/**
 * Migrates existing slots to include unique IDs
 * This function adds IDs to slots that don't have them
 */
export async function migrateExistingSlots() {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  
  // Read all existing slots
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_SLOTS,
  });
  const values = res.data.values || [];
  const header = values[0];
  const rows = values.slice(1);
  
  // Generate IDs for slots that don't have them
  const updates: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Check if slot already has an ID (column A)
    if (!row[0] || row[0] === '') {
      const newId = generateSlotId();
      updates.push({
        range: `${SHEET_MARKETPLACE}!A${i + 2}`, // +2 for header and 1-based index
        values: [[newId]]
      });
    }
  }
  
  // Apply all updates
  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates
      }
    });
  }
  
  return { success: true, updatedCount: updates.length };
}

export async function updateExpiredSlots(expiredSlots: any[]) {
  if (!expiredSlots || !Array.isArray(expiredSlots) || expiredSlots.length === 0) {
    return { success: true, message: "No slots to update" };
  }

  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  
  // Read the current slots data to find row numbers
  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE_SLOTS,
    });
  } catch (error) {
    console.error('Error calling Google Sheets API:', error);
    throw new Error('Failed to read sheet data');
  }

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    throw new Error('No data found');
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  // Find column indices
  const dateColIndex = headers.findIndex((h: string) => h === 'Date');
  const timeColIndex = headers.findIndex((h: string) => h === 'Time');
  const playerColIndex = headers.findIndex((h: string) => h === 'Player');
  const statusColIndex = headers.findIndex((h: string) => h === 'Status');

  if (dateColIndex === -1 || timeColIndex === -1 || playerColIndex === -1 || statusColIndex === -1) {
    throw new Error('Required columns not found');
  }

  const updates: any[] = [];

  // For each expired slot, find the corresponding row and update it
  expiredSlots.forEach((slot: any) => {
    const rowIndex = dataRows.findIndex((row: any[]) => {
      const rowDate = row[dateColIndex];
      const rowTime = row[timeColIndex];
      const rowPlayer = row[playerColIndex];
      const rowStatus = row[statusColIndex];
      
      return normalizeDate(rowDate) === normalizeDate(slot.Date) && 
             rowTime === slot.Time && 
             rowPlayer === slot.Player &&
             rowStatus === 'offered';
    });

    if (rowIndex !== -1) {
      const columnLetter = String.fromCharCode(65 + statusColIndex);
      const range = `${SHEET_MARKETPLACE}!${columnLetter}${rowIndex + 2}`;
      
      updates.push({
        range: range,
        values: [['expired']]
      });
    }
  });

  // Apply all updates if there are any
  if (updates.length > 0) {
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates
        }
      });
    } catch (error) {
      console.error('Error updating sheet:', error);
      throw new Error('Failed to update sheet data');
    }
  }

  return { 
    success: true, 
    updatedCount: updates.length,
    message: `Updated ${updates.length} slots to expired status`
  };
}

export async function getAvailableSlots() {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_SLOTS,
  });
  const values = res.data.values || [];
  const header = values[0];
  const rows = values.slice(1);
  // Only slots with Status='offered'
  return rows.filter(row => row[3] === 'offered').map(row => {
    const slot: Record<string, string> = {};
    header.forEach((col, i) => { slot[col] = row[i] || ''; });
    return slot;
  });
}

export async function getAllSlots() {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_SLOTS,
  });
  const values = res.data.values || [];
  const header = values[0];
  const rows = values.slice(1);
  return rows.map(row => {
    const slot: Record<string, string> = {};
    header.forEach((col, i) => { slot[col] = row[i] || ''; });
    return slot;
  });
}

export async function acceptSlotSwapById({ slotId, acceptingPlayer }: { slotId: string; acceptingPlayer: string }) {
  const { row, rowNumber } = await findSlotById(slotId);
  
  const date = row[1]; // Date column (B)
  const time = row[2]; // Time column (C)
  const player = row[3]; // Player column (D)
  const status = row[4]; // Status column (E)
  const swapRequested = row[5]; // SwapRequested column (F)
  const requestedDate = row[6]; // RequestedDate column (G)
  const requestedTime = row[7]; // RequestedTime column (H)
  
  if (status !== 'offered' || swapRequested !== 'yes') {
    throw new Error('Slot must be offered with swap requested to accept swap');
  }
  
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const now = new Date().toISOString();
  
  // Update Status (E), ClaimedBy (I), Timestamp (J)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${SHEET_MARKETPLACE}!E${rowNumber}`, values: [['claimed']] },
        { range: `${SHEET_MARKETPLACE}!I${rowNumber}`, values: [[acceptingPlayer]] },
        { range: `${SHEET_MARKETPLACE}!J${rowNumber}`, values: [[now]] },
      ],
    },
  });

  // --- Swap players in Daily schedule sheet ---
  const scheduleRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_SCHEDULE,
  });
  const scheduleRows = scheduleRes.data.values || [];

  // Helper to parse session details from column B
  function parseSessionDetails(details: string) {
    // Format: 'DD.MM / weekDay / HH:MM - HH:MM'
    const [datePart, , timePart] = details.split(' / ');
    return { date: datePart.trim(), time: timePart.trim() };
  }

  let offerRowIdx = -1;
  let requestRowIdx = -1;
  let offerPlayers: string[] = [];
  let requestPlayers: string[] = [];

  for (let i = 0; i < scheduleRows.length; i++) {
    const [details, playerList] = scheduleRows[i];
    if (!details) continue;
    const { date: rowDate, time: rowTime } = parseSessionDetails(details);
    if (normalizeDate(rowDate) === normalizeDate(date) && rowTime === time) {
      offerRowIdx = i;
      offerPlayers = (playerList || '').split(',').map((p: string) => p.trim()).filter(Boolean);
    }
    if (normalizeDate(rowDate) === normalizeDate(requestedDate) && rowTime === requestedTime) {
      requestRowIdx = i;
      requestPlayers = (playerList || '').split(',').map((p: string) => p.trim()).filter(Boolean);
    }
  }
  if (offerRowIdx === -1 || requestRowIdx === -1) throw new Error('Session(s) not found in schedule');

  // Remove offering player from their slot, add accepting player (replace one instance, or add if not found)
  const offerIdx = offerPlayers.findIndex(p => p.toLowerCase() === player.toLowerCase());
  if (offerIdx !== -1) {
    offerPlayers.splice(offerIdx, 1, acceptingPlayer);
  } else {
    offerPlayers.push(acceptingPlayer);
  }
  // In the target session, replace one instance of accepting player with offering player (or add if not found)
  const acceptIdx = requestPlayers.findIndex(p => p.toLowerCase() === acceptingPlayer.toLowerCase());
  if (acceptIdx !== -1) {
    requestPlayers.splice(acceptIdx, 1, player);
  } else {
    requestPlayers.push(player);
  }

  // Write back the updated player lists
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_DAILY_SCHEDULE}!C${offerRowIdx + SCHEDULE_START_ROW}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[offerPlayers.join(', ')]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_DAILY_SCHEDULE}!C${requestRowIdx + SCHEDULE_START_ROW}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[requestPlayers.join(', ')]] },
  });

  return { success: true };
}

export async function requestSlotSwapFromSchedule({ date, time, player, requestedDate, requestedTime }: { date: string; time: string; player: string; requestedDate: string; requestedTime: string; }) {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const now = new Date().toISOString();
  const slotId = generateSlotId();
  
  // First, create a marketplace entry for the slot being offered for swap
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE_SLOTS,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[slotId, date, time, player, 'offered', 'yes', requestedDate, requestedTime, '', now]],
    },
  });
  
  return { success: true, slotId };
}

// Tournament Teams Types and Functions
export interface TournamentTeam {
  name: string;
  players: string[];
}

export interface TournamentData {
  teams: TournamentTeam[];
}

/**
 * Fetches the tournament teams from the Google Sheet.
 * Returns the team structure with team names and player lists.
 */
export async function getTournamentTeams(): Promise<TournamentData> {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
    
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE_TOURNAMENT,
    });
    
    const values = res.data.values || [];
    
    if (values.length === 0) {
      console.warn('Tournament sheet is empty or not found');
      return { teams: [] };
    }
    
    // Parse the tournament data
    // Row 0: Team names (A1:D1)
    // Rows 1-4: Player names (A2:D5)
    const teamNames = values[0] || [];
    const playerRows = values.slice(1, 5) || [];
    
    const teams: TournamentTeam[] = [];
    
    // Process each column (team)
    for (let colIndex = 0; colIndex < 4; colIndex++) {
      const teamName = teamNames[colIndex] || `Team ${String.fromCharCode(65 + colIndex)}`; // A, B, C, D
      const players: string[] = [];
      
      // Get players for this team (column)
      for (let rowIndex = 0; rowIndex < 4; rowIndex++) {
        const playerRow = playerRows[rowIndex] || [];
        const player = playerRow[colIndex];
        if (player && player.trim()) {
          players.push(player.trim());
        }
      }
      
      if (players.length > 0) {
        teams.push({
          name: teamName,
          players: players
        });
      }
    }
    
    return { teams };
  } catch (error) {
    console.error('Error fetching tournament teams:', error);
    return { teams: [] };
  }
}

/**
 * Updates a user's smartSettle preference in the Google Sheet.
 */
export async function updateUserSettlementPreference({ playerName, smartSettle }: { playerName: string; smartSettle: boolean }) {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  
  // First, find the row number for this player
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_USER_MAPPING,
  });
  
  const values = res.data.values || [];
  const playerRowIndex = values.findIndex(row => row[0] === playerName);
  
  if (playerRowIndex === -1) {
    throw new Error(`Player ${playerName} not found in user mapping`);
  }
  
  // Update the smartSettle column (E column, 5th column, index 4)
  const actualRowNumber = playerRowIndex + 2; // +2 because we start from A2 and arrays are 0-indexed
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_USER_MAPPING}!E${actualRowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[smartSettle.toString()]],
    },
  });
  
  return { success: true };
}



/**
 * Mark settlement as complete and update related marketplace slots
 */
export async function markSettlementComplete({ fromPlayer, toPlayer, relatedSlotIds }: { 
  fromPlayer: string; 
  toPlayer: string; 
  relatedSlotIds: string[] 
}) {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  
  // Get all slots to find the ones that need to be marked as settled
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_SLOTS,
  });
  
  const values = res.data.values || [];
  const header = values[0];
  const rows = values.slice(1);
  
  // Find slots that are part of this settlement
  const updates: any[] = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const slotId = row[0]; // ID column
    const originalPlayer = row[3]; // Player column
    const claimedBy = row[8]; // ClaimedBy column
    const settled = row[10]; // Settled column
    
    // Check if this slot is part of the settlement and not already settled
    if (relatedSlotIds.includes(slotId) && 
        originalPlayer === fromPlayer && 
        claimedBy === toPlayer && 
        settled !== 'yes') {
      
      updates.push({
        range: `${SHEET_MARKETPLACE}!K${i + 2}`, // K column (Settled), +2 for header and 1-based index
        values: [['yes']]
      });
    }
  }
  
  // Apply all updates
  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates
      }
    });
  }
  
  return { success: true, updatedSlots: updates.length };
}

// Settlement Types and Interfaces
export interface PlayerCredit {
  playerName: string;
  credits: number; // Positive = money owed to player, Negative = player owes money
  slotsGivenAway: number;
  slotsClaimed: number;
  slotsSettled: number; // Count of slots already marked as settled
  slotsGivenAway1h: number;
  slotsGivenAway2h: number;
  slotsClaimed1h: number;
  slotsClaimed2h: number;
}

export interface SimplifiedDebt {
  fromPlayer: string;
  toPlayer: string;
  amount: number;
  description: string;
}

export interface UserSettlementPreferences {
  [playerName: string]: {
    smartSettle: boolean;
    email: string;
    color?: string;
    role?: string;
  };
}

/**
 * Get all settlement batches from the Settlement Batches sheet
 */
export async function getSettlementBatches(): Promise<SettlementBatch[]> {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
    
    // Read the Settlement Batches sheet
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Settlement Batches!A:H',
    });
    
    const values = res.data.values || [];
    if (values.length < 2) {
      return [];
    }
    
    const header = values[0];
    const rows = values.slice(1);
    
    // Map columns according to the updated structure:
    // A: Batch ID, B: Batch Name, C: Date Range From, D: Date Range To, E: Status, F: Created At, G: Completed At, H: Created By
    const batches: SettlementBatch[] = rows.map(row => ({
      id: row[0] || '',
      name: row[1] || `Settlement Batch ${row[0] || ''}`,
      fromDate: row[2] || '',
      toDate: row[3] || '',
      status: (row[4] as 'active' | 'settled') || 'active',
      createdAt: row[5] || new Date().toISOString(),
      settledAt: row[6] || undefined,
      linkedSlotsCount: 0 // Will be calculated separately
    }));
    
    // If no batches found, return the default batch
    if (batches.length === 0) {
      const defaultBatch: SettlementBatch = {
        id: 'default-batch',
        name: 'All Time Settlements',
        fromDate: '2024-01-01',
        toDate: new Date().toISOString().split('T')[0],
        status: 'active',
        createdAt: new Date('2024-01-01').toISOString()
      };
      return [defaultBatch];
    }
    
    return batches;
  } catch (error) {
    console.error('Error reading settlement batches from spreadsheet:', error);
    // Fallback to default batch
    const defaultBatch: SettlementBatch = {
      id: 'default-batch',
      name: 'All Time Settlements',
      fromDate: '2024-01-01',
      toDate: new Date().toISOString().split('T')[0],
      status: 'active',
      createdAt: new Date('2024-01-01').toISOString()
    };
    return [defaultBatch];
  }
}

/**
 * Create a new settlement batch and update the marketplace sheet
 */
export async function createSettlementBatch({ name, fromDate, toDate }: { 
  name: string; 
  fromDate: string; 
  toDate: string; 
}): Promise<SettlementBatch> {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  
  // Parse dates and find slots that fall within the date range
  const fromDateObj = new Date(fromDate);
  const toDateObj = new Date(toDate);
  
  // Get all slots to find ones within the date range
  const allSlots = await getAllSlots();
  
  // Filter slots within the date range that are eligible for settlement
  const eligibleSlots = allSlots.filter(slot => {
    if (!slot.Date || !slot.Status) return false;
    
    // Only include claimed, reassigned, or admin-reassigned slots
    if (!['claimed', 'reassigned', 'admin-reassigned'].includes(slot.Status)) return false;
    
    // Exclude swapped slots
    if (slot.SwapRequested === 'yes') return false;
    
    // Exclude already settled slots
    if (slot.Settled === 'yes') return false;
    
    // Parse the date from DD.MM format
    const [day, month] = slot.Date.split('.').map(Number);
    if (isNaN(day) || isNaN(month)) return false;
    
    const slotDate = new Date(new Date().getFullYear(), month - 1, day);
    return slotDate >= fromDateObj && slotDate <= toDateObj;
  });
  
  const batchId = generateSlotId();
  const now = new Date().toISOString();
  
  // Update the marketplace sheet to assign batch IDs to eligible slots
  if (eligibleSlots.length > 0) {
    const updates: any[] = [];
    
    for (const slot of eligibleSlots) {
      if (slot.ID) {
        // Find the row number for this slot
        const { rowNumber } = await findSlotById(slot.ID);
        
        // Update the Batch ID column (L column, 12th column)
        updates.push({
          range: `${SHEET_MARKETPLACE}!L${rowNumber}`,
          values: [[batchId]]
        });
      }
    }
    
    // Apply all updates
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });
    }
  }
  
  const batch: SettlementBatch = {
    id: batchId,
    name,
    fromDate,
    toDate,
    status: 'active',
    createdAt: now,
    linkedSlotsCount: eligibleSlots.length
  };
  
  return batch;
}

/**
 * Get slots for a specific batch
 */
export async function getBatchSlots(batchId: string): Promise<any[]> {
  if (batchId === 'default-batch') {
    // For the default batch, return all eligible slots
    const allSlots = await getAllSlots();
    
    return allSlots
      .filter(slot => 
        slot.Status === 'claimed' || 
        slot.Status === 'reassigned' || 
        slot.Status === 'admin-reassigned'
      );
  }
  
  // For specific batches, filter by batch ID
  const allSlots = await getAllSlots();
  
  return allSlots
    .filter(slot => slot.BatchID === batchId);
}

/**
 * Create settlement pairings for a batch
 */
export async function createSettlementPairings(batchId: string): Promise<{ success: boolean; pairings: SettlementPairing[] }> {
  try {
    // Get all slots for this batch
    const batchSlots = await getBatchSlots(batchId);
    
    if (batchSlots.length === 0) {
      return { success: true, pairings: [] };
    }
    
    // Get user preferences for smart settlement
    const userMapping = await getUserMapping();
    const userPreferences: UserSettlementPreferences = {};
    
    for (const [playerName, userData] of Object.entries(userMapping)) {
      userPreferences[playerName] = {
        smartSettle: userData.smartSettle,
        email: userData.email,
        color: userData.color,
        role: userData.role
      };
    }
    
    // Get all slots to calculate settlements
    const allSlots = await getAllSlots();
    
    // For specific batches, filter slots by batch ID
    let slotsToCalculate = allSlots;
    if (batchId !== 'default-batch') {
      slotsToCalculate = allSlots.filter(slot => slot.BatchID === batchId);
    }
    
    // Calculate settlements using the existing calculator
    const { SettlementCalculator } = await import('./settlementCalculator');
    const settlements = SettlementCalculator.calculateSettlements(slotsToCalculate, userPreferences);
    
    // Convert settlements to pairings
    const pairings: SettlementPairing[] = settlements.map((settlement, index) => ({
      id: `pairing-${batchId}-${index}`,
      batchId,
      creditorPlayer: settlement.toPlayer,
      debtorPlayer: settlement.fromPlayer,
      amount: settlement.amount,
      status: 'pending',
      createdAt: new Date().toISOString()
    }));
    
    return { success: true, pairings };
  } catch (error) {
    console.error('Error creating settlement pairings:', error);
    return { success: false, pairings: [] };
  }
}

/**
 * Get settlement pairings for a batch from the Settlement Pairings sheet
 */
export async function getSettlementPairings(batchId: string): Promise<SettlementPairing[]> {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
    
    // Read the Settlement Pairings sheet
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Settlement Pairings!A:I',
    });
    
    const values = res.data.values || [];
    if (values.length < 2) {
      return [];
    }
    
    const header = values[0];
    const rows = values.slice(1);
    
    // Filter pairings by batch ID and map columns according to the plan:
    // A: Pairing ID, B: Batch ID, C: Creditor, D: Debtors (comma-separated), E: Total Amount, F: Status, G: Created At, H: Completed At, I: Notes
    const pairings: SettlementPairing[] = rows
      .filter(row => row[1] === batchId) // Filter by Batch ID (column B)
      .map(row => {
        // Parse debtors from comma-separated string
        const debtors = row[3] ? row[3].split(',').map((d: string) => d.trim()) : [];
        
        // For now, create individual pairings for each debtor (this can be enhanced later)
        return debtors.map((debtor: string, index: number) => ({
          id: `${row[0]}-${index}`, // Pairing ID + index for uniqueness
          batchId: row[1] || '',
          creditorPlayer: row[2] || '',
          debtorPlayer: debtor,
          amount: parseFloat(row[4]) / debtors.length || 0, // Distribute total amount equally
          status: (row[5] as 'pending' | 'completed') || 'pending',
          createdAt: row[6] || new Date().toISOString(),
          completedAt: row[7] || undefined
        }));
      })
      .flat(); // Flatten the array of arrays
    
    return pairings;
  } catch (error) {
    console.error('Error getting settlement pairings:', error);
    return [];
  }
}

/**
 * Mark a batch as settled and update all related marketplace slots
 */
export async function markBatchAsSettled(batchId: string): Promise<{ success: boolean }> {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
    
    // Get all slots for this batch
    const batchSlots = await getBatchSlots(batchId);
    
    if (batchSlots.length === 0) {
      return { success: true };
    }
    
    // Update all slots in the batch to mark them as settled
    const updates: any[] = [];
    
    for (const slotInfo of batchSlots) {
      const { rowNumber } = await findSlotById(slotInfo.ID);
      
      // Update the Settled column (K column, 11th column)
      updates.push({
        range: `${SHEET_MARKETPLACE}!K${rowNumber}`,
        values: [['yes']]
      });
    }
    
    // Apply all updates
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error marking batch as settled:', error);
    return { success: false };
  }
}

/**
 * Mark a settlement transaction as completed
 */
export async function markSettlementTransactionCompleted({ 
  pairingId, 
  batchId, 
  creditorPlayer, 
  debtorPlayer,
  completedBy
}: { 
  pairingId: string; 
  batchId: string; 
  creditorPlayer: string; 
  debtorPlayer: string; 
  completedBy: string;
}): Promise<{ success: boolean }> {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
    
    // Read the Settlement Pairings sheet to find the pairing
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Settlement Pairings!A:I',
    });
    
    const values = res.data.values || [];
    if (values.length < 2) {
      return { success: false };
    }
    
    const header = values[0];
    const rows = values.slice(1);
    
    // Find the pairing row by matching creditor and debtor
    let pairingRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row[1] === batchId && row[2] === creditorPlayer && row[3]?.includes(debtorPlayer)) {
        pairingRowIndex = i + 2; // +2 because we skipped header and we need 1-based index
        break;
      }
    }
    
    if (pairingRowIndex === -1) {
      console.error('Pairing not found in spreadsheet');
      return { success: false };
    }
    
    // Update the Status column (F column, 6th column) to 'completed'
    // and Completed At column (H column, 8th column) to current timestamp
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `Settlement Pairings!F${pairingRowIndex}`,
            values: [['completed']]
          },
          {
            range: `Settlement Pairings!H${pairingRowIndex}`,
            values: [[new Date().toISOString()]]
          }
        ]
      }
    });
    
    // Create a new record in the Settlement Transactions sheet
    // Columns: A: Transaction ID, B: Pairing ID, C: From Player, D: To Player, E: Amount, F: Status, G: Completed At, H: Completed By, I: Notes
    const transactionId = generateSlotId(); // Reuse the ID generation function
    const now = new Date().toISOString();
    
    // Get the amount from the pairing row (column E, 5th column)
    const amount = parseFloat(rows[pairingRowIndex - 2][4]) || 0;
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Settlement Transactions!A:I',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          transactionId,           // Transaction ID
          pairingId,               // Pairing ID
          debtorPlayer,            // From Player (debtor pays)
          creditorPlayer,          // To Player (creditor receives)
          amount,                  // Amount
          'completed',             // Status
          now,                     // Completed At
          completedBy,             // Completed By (who marked it as settled)
          ''                       // Notes (empty for now)
        ]]
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error marking settlement transaction as completed:', error);
    return { success: false };
  }
}

/**
 * Get settlement transactions for a batch
 */
export async function getSettlementTransactions(batchId: string): Promise<any[]> {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
    
    // Read the Settlement Transactions sheet
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Settlement Transactions!A:I',
    });
    
    const values = res.data.values || [];
    if (values.length < 2) {
      return [];
    }
    
    const header = values[0];
    const rows = values.slice(1);
    
    // Filter transactions by batch ID (via pairing ID lookup)
    // For now, return all transactions - this could be enhanced to filter by batch
    const transactions = rows.map(row => ({
      transactionId: row[0],
      pairingId: row[1],
      fromPlayer: row[2],
      toPlayer: row[3],
      amount: parseFloat(row[4]) || 0,
      status: row[5],
      completedAt: row[6],
      completedBy: row[7],
      notes: row[8]
    }));
    
    return transactions;
  } catch (error) {
    console.error('Error getting settlement transactions:', error);
    return [];
  }
}
