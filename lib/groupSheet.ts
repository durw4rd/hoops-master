/**
 * Group Spreadsheet Operations
 * 
 * Handles all operations on per-group spreadsheets:
 * - Events: Event CRUD operations
 * - EventAttendees: Attendee management
 * - Transactions: Transaction recording
 */

import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import {
  Event,
  EventAttendee,
  Transaction,
  EventType,
  EventStatus,
  AttendeeStatus,
  TransactionType,
  EventRow,
  EventAttendeeRow,
  TransactionRow,
  GROUP_SHEET_HEADERS,
  EventWithAttendees,
} from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SHEET_EVENTS = 'Events';
const SHEET_EVENT_ATTENDEES = 'EventAttendees';
const SHEET_TRANSACTIONS = 'Transactions';

// =============================================================================
// GOOGLE SHEETS CLIENT
// =============================================================================

/**
 * Get authenticated Google Sheets client for a group spreadsheet
 */
export async function getGroupSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error('Missing Google Sheets environment variables');
  }

  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

// =============================================================================
// SHEET INITIALIZATION
// =============================================================================

/**
 * Initialize a new group spreadsheet with required sheets and headers
 */
export async function initializeGroupSpreadsheet(spreadsheetId: string): Promise<void> {
  const sheets = await getGroupSheetsClient();

  // Check and add headers for each sheet
  const sheetsToInit = [
    { name: SHEET_EVENTS, headers: GROUP_SHEET_HEADERS.Events },
    { name: SHEET_EVENT_ATTENDEES, headers: GROUP_SHEET_HEADERS.EventAttendees },
    { name: SHEET_TRANSACTIONS, headers: GROUP_SHEET_HEADERS.Transactions },
  ];

  for (const sheet of sheetsToInit) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheet.name}!A1:1`,
      });

      const firstRow = response.data.values?.[0];
      
      // If no header row or empty, add headers
      if (!firstRow || firstRow.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheet.name}!A1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [sheet.headers],
          },
        });
        console.log(`Initialized headers for ${sheet.name} in group spreadsheet`);
      }
    } catch (error) {
      console.error(`Error initializing ${sheet.name}:`, error);
      throw error;
    }
  }
}

// =============================================================================
// EVENTS OPERATIONS
// =============================================================================

/**
 * Get all events for a group
 */
export async function getEvents(spreadsheetId: string): Promise<Event[]> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_EVENTS}!A:M`,
  });

  const rows = response.data.values || [];
  const events: Event[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as EventRow;
    if (row[0]) { // Has eventId
      events.push(parseEventRow(row));
    }
  }

  return events;
}

/**
 * Get event by ID
 */
export async function getEventById(spreadsheetId: string, eventId: string): Promise<Event | null> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_EVENTS}!A:M`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as EventRow;
    if (row[0] === eventId) {
      return parseEventRow(row);
    }
  }

  return null;
}

/**
 * Get events by date range
 */
export async function getEventsByDateRange(
  spreadsheetId: string,
  startDate: string,
  endDate: string
): Promise<Event[]> {
  const events = await getEvents(spreadsheetId);
  
  return events.filter(event => {
    return event.date >= startDate && event.date <= endDate && event.status !== 'cancelled';
  });
}

/**
 * Create a new event
 */
export async function createEvent(
  spreadsheetId: string,
  data: {
    date: string;
    startTime: string;
    endTime: string;
    totalSpots: number;
    slotCost: number;
    location?: string;
    description?: string;
    eventType?: EventType;
    signupOpensAt?: string;
  },
  createdBy: string
): Promise<Event> {
  const sheets = await getGroupSheetsClient();

  const now = new Date().toISOString();
  // Default: signup opens immediately (use epoch start as "always open")
  const signupOpensAt = data.signupOpensAt || '1970-01-01T00:00:00.000Z';
  
  const event: Event = {
    eventId: uuidv4(),
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    totalSpots: data.totalSpots,
    slotCost: data.slotCost,
    location: data.location || '',
    description: data.description || '',
    eventType: data.eventType || 'regular',
    status: 'scheduled',
    signupOpensAt,
    createdBy,
    createdAt: now,
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_EVENTS}!A:M`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        event.eventId,
        event.date,
        event.startTime,
        event.endTime,
        event.totalSpots.toString(),
        event.slotCost.toString(),
        event.location,
        event.description,
        event.eventType,
        event.status,
        event.signupOpensAt,
        event.createdBy,
        event.createdAt,
      ]],
    },
  });

  return event;
}

/**
 * Bulk create events (for recurring events)
 */
export async function bulkCreateEvents(
  spreadsheetId: string,
  events: Array<{
    date: string;
    startTime: string;
    endTime: string;
    totalSpots: number;
    slotCost: number;
    location?: string;
    description?: string;
    eventType?: EventType;
    signupOpensAt?: string;
  }>,
  createdBy: string
): Promise<Event[]> {
  const sheets = await getGroupSheetsClient();

  const now = new Date().toISOString();
  const createdEvents: Event[] = events.map(data => ({
    eventId: uuidv4(),
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    totalSpots: data.totalSpots,
    slotCost: data.slotCost,
    location: data.location || '',
    description: data.description || '',
    eventType: data.eventType || 'regular',
    status: 'scheduled',
    signupOpensAt: data.signupOpensAt || '1970-01-01T00:00:00.000Z',
    createdBy,
    createdAt: now,
  }));

  const rows = createdEvents.map(event => [
    event.eventId,
    event.date,
    event.startTime,
    event.endTime,
    event.totalSpots.toString(),
    event.slotCost.toString(),
    event.location,
    event.description,
    event.eventType,
    event.status,
    event.signupOpensAt,
    event.createdBy,
    event.createdAt,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_EVENTS}!A:M`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows,
    },
  });

  return createdEvents;
}

/**
 * Update event status
 */
export async function updateEventStatus(
  spreadsheetId: string,
  eventId: string,
  status: EventStatus
): Promise<Event | null> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_EVENTS}!A:M`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as EventRow;
    if (row[0] === eventId) {
      // Update status in column J (index 9)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_EVENTS}!J${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[status]],
        },
      });

      return {
        ...parseEventRow(row),
        status,
      };
    }
  }

  return null;
}

/**
 * Parse event row into Event object
 */
function parseEventRow(row: EventRow): Event {
  return {
    eventId: row[0],
    date: row[1] || '',
    startTime: row[2] || '',
    endTime: row[3] || '',
    totalSpots: parseInt(row[4]) || 0,
    slotCost: parseFloat(row[5]) || 0,
    location: row[6] || '',
    description: row[7] || '',
    eventType: (row[8] as EventType) || 'regular',
    status: (row[9] as EventStatus) || 'scheduled',
    signupOpensAt: row[10] || '',
    createdBy: row[11] || '',
    createdAt: row[12] || new Date().toISOString(),
  };
}

// =============================================================================
// EVENT ATTENDEES OPERATIONS
// =============================================================================

/**
 * Get all attendees for an event
 */
export async function getEventAttendees(spreadsheetId: string, eventId: string): Promise<EventAttendee[]> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_EVENT_ATTENDEES}!A:H`,
  });

  const rows = response.data.values || [];
  const attendees: EventAttendee[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as EventAttendeeRow;
    if (row[1] === eventId) {
      attendees.push(parseEventAttendeeRow(row));
    }
  }

  return attendees;
}

/**
 * Get attendee by ID
 */
export async function getAttendeeById(spreadsheetId: string, attendeeId: string): Promise<EventAttendee | null> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_EVENT_ATTENDEES}!A:H`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as EventAttendeeRow;
    if (row[0] === attendeeId) {
      return parseEventAttendeeRow(row);
    }
  }

  return null;
}

/**
 * Get user's attendance for an event
 */
export async function getUserEventAttendance(
  spreadsheetId: string,
  eventId: string,
  userEmail: string
): Promise<EventAttendee | null> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_EVENT_ATTENDEES}!A:H`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as EventAttendeeRow;
    if (row[1] === eventId && row[2]?.toLowerCase() === userEmail.toLowerCase()) {
      return parseEventAttendeeRow(row);
    }
  }

  return null;
}

/**
 * Add attendee to event (claim spot)
 */
export async function addEventAttendee(
  spreadsheetId: string,
  eventId: string,
  userEmail: string,
  assignedBy?: string
): Promise<EventAttendee> {
  const sheets = await getGroupSheetsClient();

  const now = new Date().toISOString();
  const attendee: EventAttendee = {
    attendeeId: uuidv4(),
    eventId,
    userEmail,
    originalUserEmail: userEmail,
    status: 'confirmed',
    offeredAt: null,
    assignedBy: assignedBy || null,
    assignedAt: now,
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_EVENT_ATTENDEES}!A:H`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        attendee.attendeeId,
        attendee.eventId,
        attendee.userEmail,
        attendee.originalUserEmail,
        attendee.status,
        attendee.offeredAt || '',
        attendee.assignedBy || '',
        attendee.assignedAt,
      ]],
    },
  });

  return attendee;
}

/**
 * Update attendee status (for offering spot)
 */
export async function updateAttendeeStatus(
  spreadsheetId: string,
  attendeeId: string,
  status: AttendeeStatus
): Promise<{ attendee: EventAttendee; rowNumber: number } | null> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_EVENT_ATTENDEES}!A:H`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as EventAttendeeRow;
    if (row[0] === attendeeId) {
      const now = new Date().toISOString();
      const offeredAt = status === 'offered' ? now : '';

      // Update status (column E) and offeredAt (column F)
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            {
              range: `${SHEET_EVENT_ATTENDEES}!E${i + 1}`,
              values: [[status]],
            },
            {
              range: `${SHEET_EVENT_ATTENDEES}!F${i + 1}`,
              values: [[offeredAt]],
            },
          ],
        },
      });

      return {
        attendee: {
          ...parseEventAttendeeRow(row),
          status,
          offeredAt: status === 'offered' ? now : null,
        },
        rowNumber: i + 1,
      };
    }
  }

  return null;
}

/**
 * Transfer attendee spot to another user (for claiming offered spot)
 */
export async function transferAttendeeSpot(
  spreadsheetId: string,
  attendeeId: string,
  newUserEmail: string
): Promise<EventAttendee | null> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_EVENT_ATTENDEES}!A:H`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as EventAttendeeRow;
    if (row[0] === attendeeId) {
      // Update userEmail (column C), status (column E), and clear offeredAt (column F)
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            {
              range: `${SHEET_EVENT_ATTENDEES}!C${i + 1}`,
              values: [[newUserEmail]],
            },
            {
              range: `${SHEET_EVENT_ATTENDEES}!E${i + 1}`,
              values: [['confirmed']],
            },
            {
              range: `${SHEET_EVENT_ATTENDEES}!F${i + 1}`,
              values: [['']],
            },
          ],
        },
      });

      return {
        ...parseEventAttendeeRow(row),
        userEmail: newUserEmail,
        status: 'confirmed',
        offeredAt: null,
      };
    }
  }

  return null;
}

/**
 * Get event with attendees
 */
export async function getEventWithAttendees(spreadsheetId: string, eventId: string): Promise<EventWithAttendees | null> {
  const event = await getEventById(spreadsheetId, eventId);
  if (!event) return null;

  const attendees = await getEventAttendees(spreadsheetId, eventId);
  
  const confirmedCount = attendees.filter(a => a.status === 'confirmed').length;
  const offeredCount = attendees.filter(a => a.status === 'offered').length;

  return {
    ...event,
    attendees,
    availableSpots: event.totalSpots - confirmedCount,
    offeredSpots: offeredCount,
  };
}

/**
 * Parse event attendee row into EventAttendee object
 */
function parseEventAttendeeRow(row: EventAttendeeRow): EventAttendee {
  return {
    attendeeId: row[0],
    eventId: row[1] || '',
    userEmail: row[2] || '',
    originalUserEmail: row[3] || '',
    status: (row[4] as AttendeeStatus) || 'confirmed',
    offeredAt: row[5] || null,
    assignedBy: row[6] || null,
    assignedAt: row[7] || new Date().toISOString(),
  };
}

// =============================================================================
// TRANSACTIONS OPERATIONS
// =============================================================================

/**
 * Create a transaction record
 */
export async function createTransaction(
  spreadsheetId: string,
  data: {
    eventId: string;
    attendeeId: string;
    type: TransactionType;
    fromUserEmail: string | null;
    toUserEmail: string;
    amount: number;
    notes?: string;
  }
): Promise<Transaction> {
  const sheets = await getGroupSheetsClient();

  const now = new Date().toISOString();
  const transaction: Transaction = {
    transactionId: uuidv4(),
    eventId: data.eventId,
    attendeeId: data.attendeeId,
    type: data.type,
    fromUserEmail: data.fromUserEmail,
    toUserEmail: data.toUserEmail,
    amount: data.amount,
    timestamp: now,
    settledAt: null,
    notes: data.notes || '',
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TRANSACTIONS}!A:J`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        transaction.transactionId,
        transaction.eventId,
        transaction.attendeeId,
        transaction.type,
        transaction.fromUserEmail || '',
        transaction.toUserEmail,
        transaction.amount.toString(),
        transaction.timestamp,
        transaction.settledAt || '',
        transaction.notes,
      ]],
    },
  });

  return transaction;
}

/**
 * Get all transactions for a group
 */
export async function getTransactions(spreadsheetId: string): Promise<Transaction[]> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TRANSACTIONS}!A:J`,
  });

  const rows = response.data.values || [];
  const transactions: Transaction[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as TransactionRow;
    if (row[0]) {
      transactions.push(parseTransactionRow(row));
    }
  }

  return transactions;
}

/**
 * Get unsettled transactions
 */
export async function getUnsettledTransactions(spreadsheetId: string): Promise<Transaction[]> {
  const transactions = await getTransactions(spreadsheetId);
  return transactions.filter(t => !t.settledAt);
}

/**
 * Mark transaction as settled
 */
export async function settleTransaction(
  spreadsheetId: string,
  transactionId: string
): Promise<Transaction | null> {
  const sheets = await getGroupSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TRANSACTIONS}!A:J`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as TransactionRow;
    if (row[0] === transactionId) {
      const now = new Date().toISOString();

      // Update settledAt in column I (index 8)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_TRANSACTIONS}!I${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[now]],
        },
      });

      return {
        ...parseTransactionRow(row),
        settledAt: now,
      };
    }
  }

  return null;
}

/**
 * Parse transaction row into Transaction object
 */
function parseTransactionRow(row: TransactionRow): Transaction {
  return {
    transactionId: row[0],
    eventId: row[1] || '',
    attendeeId: row[2] || '',
    type: (row[3] as TransactionType) || 'claim',
    fromUserEmail: row[4] || null,
    toUserEmail: row[5] || '',
    amount: parseFloat(row[6]) || 0,
    timestamp: row[7] || new Date().toISOString(),
    settledAt: row[8] || null,
    notes: row[9] || '',
  };
}

