/**
 * Google Drive Service
 * 
 * Handles creation of group spreadsheets in the designated Drive folder.
 */

import { google } from 'googleapis';
import { GROUP_SHEET_HEADERS } from './types';

/**
 * Get authenticated Google Drive client
 */
async function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error('Missing Google service account credentials');
  }

  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });

  await auth.authorize();
  
  return {
    drive: google.drive({ version: 'v3', auth }),
    sheets: google.sheets({ version: 'v4', auth }),
  };
}

/**
 * Get the folder ID from environment
 */
function getFolderId(): string {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID environment variable is not set');
  }
  return folderId;
}

/**
 * Get the template spreadsheet ID from environment
 */
function getTemplateId(): string {
  const templateId = process.env.GOOGLE_TEMPLATE_SHEET_ID;
  if (!templateId) {
    throw new Error('GOOGLE_TEMPLATE_SHEET_ID environment variable is not set. Please create a template spreadsheet and add its ID to .env.local');
  }
  return templateId;
}

/**
 * Create a new spreadsheet for a group by copying the template
 * This avoids quota issues with creating new files
 */
export async function createGroupSpreadsheet(groupName: string): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
}> {
  const { drive, sheets } = await getDriveClient();
  const folderId = getFolderId();
  const templateId = getTemplateId();

  // Step 1: Copy the template spreadsheet to the folder
  const copiedFile = await drive.files.copy({
    fileId: templateId,
    requestBody: {
      name: `Hoops Master - ${groupName}`,
      parents: [folderId],
    },
    fields: 'id',
  });

  const spreadsheetId = copiedFile.data.id;
  if (!spreadsheetId) {
    throw new Error('Failed to copy template spreadsheet - no ID returned');
  }

  // Step 2: Initialize the sheets with headers (in case template doesn't have them)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        {
          range: 'Events!A1',
          values: [GROUP_SHEET_HEADERS.Events],
        },
        {
          range: 'EventAttendees!A1',
          values: [GROUP_SHEET_HEADERS.EventAttendees],
        },
        {
          range: 'Transactions!A1',
          values: [GROUP_SHEET_HEADERS.Transactions],
        },
      ],
    },
  });

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  };
}

/**
 * Delete a group spreadsheet (for cleanup)
 */
export async function deleteGroupSpreadsheet(spreadsheetId: string): Promise<void> {
  const { drive } = await getDriveClient();

  await drive.files.delete({
    fileId: spreadsheetId,
  });
}

/**
 * Rename a group spreadsheet
 */
export async function renameGroupSpreadsheet(
  spreadsheetId: string,
  newGroupName: string
): Promise<void> {
  const { drive } = await getDriveClient();

  await drive.files.update({
    fileId: spreadsheetId,
    requestBody: {
      name: `Hoops Master - ${newGroupName}`,
    },
  });
}

