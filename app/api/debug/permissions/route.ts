/**
 * Debug Permissions API
 * 
 * GET /api/debug/permissions - Test service account permissions
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  try {
    // Check environment variables
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;
    const masterSheetId = process.env.GOOGLE_MASTER_SHEET_ID;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    results.envVars = {
      serviceAccountEmail: email ? `${email.substring(0, 20)}...` : 'MISSING',
      privateKey: key ? `${key.substring(0, 50)}...` : 'MISSING',
      masterSheetId: masterSheetId || 'MISSING',
      folderId: folderId || 'MISSING',
    };

    if (!email || !key) {
      return NextResponse.json({
        ...results,
        error: 'Missing credentials',
      }, { status: 500 });
    }

    // Test authentication
    const auth = new google.auth.JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });

    try {
      await auth.authorize();
      results.authTest = '✅ Authentication successful';
    } catch (authError) {
      results.authTest = `❌ Authentication failed: ${String(authError)}`;
      return NextResponse.json(results, { status: 500 });
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Test 1: Read from master sheet
    if (masterSheetId) {
      try {
        await sheets.spreadsheets.get({ spreadsheetId: masterSheetId });
        results.masterSheetRead = '✅ Can read master spreadsheet';
      } catch (e) {
        results.masterSheetRead = `❌ Cannot read master spreadsheet: ${String(e)}`;
      }
    }

    // Test 2: Check folder access
    if (folderId) {
      try {
        const folder = await drive.files.get({ fileId: folderId, fields: 'id,name' });
        results.folderAccess = `✅ Can access folder: ${folder.data.name}`;
      } catch (e) {
        results.folderAccess = `❌ Cannot access folder: ${String(e)}`;
      }
    }

    // Test 3: Try to create a test spreadsheet using Sheets API
    try {
      const testSheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `Test - Delete Me - ${Date.now()}`,
          },
        },
      });
      
      const testSheetId = testSheet.data.spreadsheetId;
      results.createViaSheets = `✅ Can create via Sheets API (created: ${testSheetId})`;

      // Clean up
      if (testSheetId) {
        try {
          await drive.files.delete({ fileId: testSheetId });
        } catch (e) {
          // ignore cleanup errors
        }
      }
    } catch (e) {
      results.createViaSheets = `❌ Cannot create via Sheets API: ${String(e)}`;
    }

    // Test 4: Try to copy a template spreadsheet (the actual method we'll use)
    const templateId = process.env.GOOGLE_TEMPLATE_SHEET_ID;
    if (templateId && folderId) {
      try {
        const copiedFile = await drive.files.copy({
          fileId: templateId,
          requestBody: {
            name: `Test Copy - Delete Me - ${Date.now()}`,
            parents: [folderId],
          },
          fields: 'id',
        });
        
        const testFileId = copiedFile.data.id;
        results.copyTemplate = `✅ Can copy template spreadsheet (created: ${testFileId})`;

        // Clean up
        if (testFileId) {
          try {
            await drive.files.delete({ fileId: testFileId });
            results.cleanup = '✅ Cleaned up test file';
          } catch (e) {
            results.cleanup = `⚠️ Created but couldn't delete: ${testFileId}`;
          }
        }
      } catch (e) {
        results.copyTemplate = `❌ Cannot copy template: ${String(e)}`;
      }
    } else if (!templateId) {
      results.copyTemplate = '⚠️ GOOGLE_TEMPLATE_SHEET_ID not set - please create a template and add the ID to .env.local';
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    return NextResponse.json({
      ...results,
      error: String(error),
    }, { status: 500 });
  }
}

