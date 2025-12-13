/**
 * Master Spreadsheet Operations
 * 
 * Handles all operations on the master spreadsheet:
 * - AppUsers: User registration and lookup
 * - Groups: Group CRUD operations
 * - GroupMembers: User-Group membership management
 */

import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import {
  AppUser,
  Group,
  GroupMember,
  GlobalRole,
  GroupVisibility,
  GroupStatus,
  GroupRole,
  MemberStatus,
  AppUserRow,
  GroupRow,
  GroupMemberRow,
  MASTER_SHEET_HEADERS,
  GroupMembership,
} from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SHEET_APP_USERS = 'AppUsers';
const SHEET_GROUPS = 'Groups';
const SHEET_GROUP_MEMBERS = 'GroupMembers';

// =============================================================================
// GOOGLE SHEETS CLIENT
// =============================================================================

/**
 * Get authenticated Google Sheets client for master spreadsheet
 */
export async function getMasterSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_MASTER_SHEET_ID;

  if (!email || !key || !sheetId) {
    throw new Error('Missing Google Sheets environment variables (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_MASTER_SHEET_ID)');
  }

  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Get the master spreadsheet ID from environment
 */
function getMasterSpreadsheetId(): string {
  const sheetId = process.env.GOOGLE_MASTER_SHEET_ID;
  if (!sheetId) {
    throw new Error('GOOGLE_MASTER_SHEET_ID environment variable is not set');
  }
  return sheetId;
}

// =============================================================================
// SHEET INITIALIZATION
// =============================================================================

/**
 * Initialize master spreadsheet with headers if needed
 */
export async function initializeMasterSpreadsheet(): Promise<void> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  // Check and add headers for each sheet
  const sheetsToInit = [
    { name: SHEET_APP_USERS, headers: MASTER_SHEET_HEADERS.AppUsers },
    { name: SHEET_GROUPS, headers: MASTER_SHEET_HEADERS.Groups },
    { name: SHEET_GROUP_MEMBERS, headers: MASTER_SHEET_HEADERS.GroupMembers },
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
        console.log(`Initialized headers for ${sheet.name}`);
      }
    } catch (error) {
      console.error(`Error initializing ${sheet.name}:`, error);
      throw error;
    }
  }
}

// =============================================================================
// APP USERS OPERATIONS
// =============================================================================

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_APP_USERS}!A:D`,
  });

  const rows = response.data.values || [];
  
  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as AppUserRow;
    if (row[0]?.toLowerCase() === email.toLowerCase()) {
      return {
        email: row[0],
        displayName: row[1] || '',
        globalRole: (row[2] as GlobalRole) || 'user',
        createdAt: row[3] || new Date().toISOString(),
      };
    }
  }

  return null;
}

/**
 * Create a new user
 */
export async function createUser(user: Omit<AppUser, 'createdAt'>): Promise<AppUser> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const now = new Date().toISOString();
  const newUser: AppUser = {
    ...user,
    createdAt: now,
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_APP_USERS}!A:D`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[newUser.email, newUser.displayName, newUser.globalRole, newUser.createdAt]],
    },
  });

  return newUser;
}

/**
 * Get or create user (upsert on login)
 */
export async function getOrCreateUser(email: string, displayName: string): Promise<AppUser> {
  const existingUser = await getUserByEmail(email);
  
  if (existingUser) {
    return existingUser;
  }

  return createUser({
    email,
    displayName,
    globalRole: 'user',
  });
}

/**
 * Update user global role
 */
export async function updateUserGlobalRole(email: string, globalRole: GlobalRole): Promise<AppUser | null> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_APP_USERS}!A:D`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as AppUserRow;
    if (row[0]?.toLowerCase() === email.toLowerCase()) {
      // Update globalRole in column C (index 2)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_APP_USERS}!C${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[globalRole]],
        },
      });

      return {
        email: row[0],
        displayName: row[1] || '',
        globalRole,
        createdAt: row[3] || new Date().toISOString(),
      };
    }
  }

  return null;
}

// =============================================================================
// GROUPS OPERATIONS
// =============================================================================

/**
 * Generate unique invite code
 */
function generateInviteCode(): string {
  return uuidv4().substring(0, 8).toUpperCase();
}

/**
 * Get group by ID
 */
export async function getGroupById(groupId: string): Promise<Group | null> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUPS}!A:J`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as GroupRow;
    if (row[0] === groupId) {
      return parseGroupRow(row);
    }
  }

  return null;
}

/**
 * Get group by invite code
 */
export async function getGroupByInviteCode(inviteCode: string): Promise<Group | null> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUPS}!A:J`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as GroupRow;
    if (row[8]?.toUpperCase() === inviteCode.toUpperCase()) {
      return parseGroupRow(row);
    }
  }

  return null;
}

/**
 * Get all public groups
 */
export async function getPublicGroups(): Promise<Group[]> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUPS}!A:J`,
  });

  const rows = response.data.values || [];
  const groups: Group[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as GroupRow;
    if (row[3] === 'public' && row[9] === 'active') {
      groups.push(parseGroupRow(row));
    }
  }

  return groups;
}

/**
 * Create a new group
 */
export async function createGroup(
  data: {
    name: string;
    description: string;
    visibility: GroupVisibility;
    defaultEventSpots: number;
    spreadsheetId: string;
  },
  createdBy: string
): Promise<Group> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const now = new Date().toISOString();
  const group: Group = {
    groupId: uuidv4(),
    name: data.name,
    description: data.description,
    visibility: data.visibility,
    spreadsheetId: data.spreadsheetId,
    defaultEventSpots: data.defaultEventSpots,
    createdBy,
    createdAt: now,
    inviteCode: generateInviteCode(),
    status: 'active',
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_GROUPS}!A:J`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        group.groupId,
        group.name,
        group.description,
        group.visibility,
        group.spreadsheetId,
        group.defaultEventSpots.toString(),
        group.createdBy,
        group.createdAt,
        group.inviteCode,
        group.status,
      ]],
    },
  });

  return group;
}

/**
 * Update group status
 */
export async function updateGroupStatus(groupId: string, status: GroupStatus): Promise<Group | null> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUPS}!A:J`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as GroupRow;
    if (row[0] === groupId) {
      // Update status in column J (index 9)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_GROUPS}!J${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[status]],
        },
      });

      return {
        ...parseGroupRow(row),
        status,
      };
    }
  }

  return null;
}

/**
 * Update group settings
 */
export async function updateGroup(
  groupId: string, 
  updates: { 
    visibility?: GroupVisibility; 
    description?: string;
    defaultEventSpots?: number;
  }
): Promise<Group | null> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUPS}!A:J`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as GroupRow;
    if (row[0] === groupId) {
      const currentGroup = parseGroupRow(row);
      
      // Apply updates
      const updatedGroup: Group = {
        ...currentGroup,
        visibility: updates.visibility ?? currentGroup.visibility,
        description: updates.description ?? currentGroup.description,
        defaultEventSpots: updates.defaultEventSpots ?? currentGroup.defaultEventSpots,
      };

      // Update the row (columns C, D, F for description, visibility, defaultEventSpots)
      // Column C (index 2) = description
      // Column D (index 3) = visibility
      // Column F (index 5) = defaultEventSpots
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_GROUPS}!C${i + 1}:F${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            updatedGroup.description,
            updatedGroup.visibility,
            updatedGroup.spreadsheetId,
            updatedGroup.defaultEventSpots.toString(),
          ]],
        },
      });

      return updatedGroup;
    }
  }

  return null;
}

/**
 * Parse a group row into Group object
 */
function parseGroupRow(row: GroupRow): Group {
  return {
    groupId: row[0],
    name: row[1] || '',
    description: row[2] || '',
    visibility: (row[3] as GroupVisibility) || 'private',
    spreadsheetId: row[4] || '',
    defaultEventSpots: parseInt(row[5]) || 10,
    createdBy: row[6] || '',
    createdAt: row[7] || new Date().toISOString(),
    inviteCode: row[8] || '',
    status: (row[9] as GroupStatus) || 'active',
  };
}

// =============================================================================
// GROUP MEMBERS OPERATIONS
// =============================================================================

/**
 * Get member by group and email
 */
export async function getGroupMember(groupId: string, userEmail: string): Promise<GroupMember | null> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUP_MEMBERS}!A:F`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as GroupMemberRow;
    if (row[0] === groupId && row[1]?.toLowerCase() === userEmail.toLowerCase()) {
      return parseGroupMemberRow(row);
    }
  }

  return null;
}

/**
 * Get all members of a group
 */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUP_MEMBERS}!A:F`,
  });

  const rows = response.data.values || [];
  const members: GroupMember[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as GroupMemberRow;
    if (row[0] === groupId) {
      members.push(parseGroupMemberRow(row));
    }
  }

  return members;
}

/**
 * Get all groups for a user
 */
export async function getUserGroups(userEmail: string): Promise<GroupMembership[]> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  // Get all memberships for this user
  const membersResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUP_MEMBERS}!A:F`,
  });

  const memberRows = membersResponse.data.values || [];
  const userMemberships: GroupMemberRow[] = [];
  
  for (let i = 1; i < memberRows.length; i++) {
    const row = memberRows[i] as GroupMemberRow;
    if (row[1]?.toLowerCase() === userEmail.toLowerCase() && row[5] === 'active') {
      userMemberships.push(row);
    }
  }

  if (userMemberships.length === 0) {
    return [];
  }

  // Get all groups to map names
  const groupsResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUPS}!A:J`,
  });

  const groupRows = groupsResponse.data.values || [];
  const groupMap = new Map<string, Group>();
  
  for (let i = 1; i < groupRows.length; i++) {
    const row = groupRows[i] as GroupRow;
    groupMap.set(row[0], parseGroupRow(row));
  }

  // Build membership list
  const memberships: GroupMembership[] = [];
  for (const memberRow of userMemberships) {
    const group = groupMap.get(memberRow[0]);
    if (group && group.status === 'active') {
      memberships.push({
        groupId: memberRow[0],
        groupName: group.name,
        groupRole: (memberRow[2] as GroupRole) || 'member',
        status: (memberRow[5] as MemberStatus) || 'active',
      });
    }
  }

  return memberships;
}

/**
 * Add member to group
 */
export async function addGroupMember(
  groupId: string,
  userEmail: string,
  groupRole: GroupRole,
  invitedBy?: string
): Promise<GroupMember> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  // Check if already a member
  const existingMember = await getGroupMember(groupId, userEmail);
  if (existingMember) {
    throw new Error('User is already a member of this group');
  }

  const now = new Date().toISOString();
  const member: GroupMember = {
    groupId,
    userEmail,
    groupRole,
    joinedAt: now,
    invitedBy: invitedBy || null,
    status: 'active',
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_GROUP_MEMBERS}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        member.groupId,
        member.userEmail,
        member.groupRole,
        member.joinedAt,
        member.invitedBy || '',
        member.status,
      ]],
    },
  });

  return member;
}

/**
 * Update member group role
 */
export async function updateGroupMemberRole(
  groupId: string,
  userEmail: string,
  groupRole: GroupRole
): Promise<GroupMember | null> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUP_MEMBERS}!A:F`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as GroupMemberRow;
    if (row[0] === groupId && row[1]?.toLowerCase() === userEmail.toLowerCase()) {
      // Update groupRole in column C (index 2)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_GROUP_MEMBERS}!C${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[groupRole]],
        },
      });

      return {
        ...parseGroupMemberRow(row),
        groupRole,
      };
    }
  }

  return null;
}

/**
 * Update member status
 */
export async function updateGroupMemberStatus(
  groupId: string,
  userEmail: string,
  status: MemberStatus
): Promise<GroupMember | null> {
  const sheets = await getMasterSheetsClient();
  const spreadsheetId = getMasterSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_GROUP_MEMBERS}!A:F`,
  });

  const rows = response.data.values || [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as GroupMemberRow;
    if (row[0] === groupId && row[1]?.toLowerCase() === userEmail.toLowerCase()) {
      // Update status in column F (index 5)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_GROUP_MEMBERS}!F${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[status]],
        },
      });

      return {
        ...parseGroupMemberRow(row),
        status,
      };
    }
  }

  return null;
}

/**
 * Check if user is admin of a group
 */
export async function isGroupAdmin(groupId: string, userEmail: string): Promise<boolean> {
  const member = await getGroupMember(groupId, userEmail);
  return member?.groupRole === 'admin' && member?.status === 'active';
}

/**
 * Parse a group member row into GroupMember object
 */
function parseGroupMemberRow(row: GroupMemberRow): GroupMember {
  return {
    groupId: row[0],
    userEmail: row[1] || '',
    groupRole: (row[2] as GroupRole) || 'member',
    joinedAt: row[3] || new Date().toISOString(),
    invitedBy: row[4] || null,
    status: (row[5] as MemberStatus) || 'active',
  };
}

