/**
 * Initial Setup API
 * 
 * POST /api/setup - Bootstrap the system with first admin user
 * 
 * This endpoint:
 * 1. Initializes spreadsheet headers
 * 2. Creates the first admin user
 * 
 * Security: Only works if AppUsers sheet is empty (first-time setup)
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { MASTER_SHEET_HEADERS } from '@/lib/types';

const SHEET_APP_USERS = 'AppUsers';
const SHEET_GROUPS = 'Groups';
const SHEET_GROUP_MEMBERS = 'GroupMembers';

async function getSetupSheetsClient() {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, displayName } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const spreadsheetId = process.env.GOOGLE_MASTER_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_MASTER_SHEET_ID not configured' },
        { status: 500 }
      );
    }

    const sheets = await getSetupSheetsClient();

    // Step 1: Check if AppUsers sheet has any data (beyond headers)
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_APP_USERS}!A:D`,
    });

    const rows = existingData.data.values || [];
    
    // If there's more than 1 row (header + data), setup already completed
    if (rows.length > 1) {
      return NextResponse.json(
        { error: 'Setup already completed. AppUsers sheet is not empty.' },
        { status: 403 }
      );
    }

    // Step 2: Initialize headers for all sheets
    const sheetsToInit = [
      { name: SHEET_APP_USERS, headers: MASTER_SHEET_HEADERS.AppUsers },
      { name: SHEET_GROUPS, headers: MASTER_SHEET_HEADERS.Groups },
      { name: SHEET_GROUP_MEMBERS, headers: MASTER_SHEET_HEADERS.GroupMembers },
    ];

    for (const sheet of sheetsToInit) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheet.name}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [sheet.headers],
        },
      });
    }

    // Step 3: Create the first admin user
    const now = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_APP_USERS}!A:D`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[email, displayName || email.split('@')[0], 'admin', now]],
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Setup completed successfully',
      user: {
        email,
        displayName: displayName || email.split('@')[0],
        globalRole: 'admin',
        createdAt: now,
      },
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: 'Setup failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to check setup status
export async function GET(request: NextRequest) {
  try {
    const spreadsheetId = process.env.GOOGLE_MASTER_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({
        setupComplete: false,
        reason: 'GOOGLE_MASTER_SHEET_ID not configured',
      });
    }

    const sheets = await getSetupSheetsClient();

    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_APP_USERS}!A:D`,
    });

    const rows = existingData.data.values || [];
    const hasUsers = rows.length > 1;

    return NextResponse.json({
      setupComplete: hasUsers,
      userCount: Math.max(0, rows.length - 1),
      message: hasUsers 
        ? 'Setup already completed' 
        : 'Setup required - POST to /api/setup with { email, displayName }',
    });
  } catch (error) {
    return NextResponse.json({
      setupComplete: false,
      reason: String(error),
    });
  }
}

