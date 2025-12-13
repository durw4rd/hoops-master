/**
 * Groups API
 * 
 * GET /api/groups - List current user's groups
 * POST /api/groups - Create a new group
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { 
  getUserByEmail, 
  getUserGroups, 
  createGroup, 
  addGroupMember,
  getGroupById,
} from '@/lib/masterSheet';
import { createGroupSpreadsheet } from '@/lib/driveService';
import { CreateGroupRequest, GroupVisibility } from '@/lib/types';

/**
 * GET /api/groups - List current user's groups with full details
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    // Get user's group memberships
    const memberships = await getUserGroups(session.user.email);
    
    // Fetch full group details for each membership
    const groups = await Promise.all(
      memberships.map(async (membership) => {
        const group = await getGroupById(membership.groupId);
        return group;
      })
    );

    // Filter out any null/undefined groups (shouldn't happen but be safe)
    const validGroups = groups.filter((g): g is NonNullable<typeof g> => g != null);

    return NextResponse.json({
      success: true,
      data: validGroups,
    });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/groups - Create a new group
 * 
 * Body: { name, description, visibility, defaultEventSpots, spreadsheetId? }
 * 
 * If spreadsheetId is provided, uses that existing spreadsheet.
 * Otherwise, tries to create one automatically (may fail due to quota).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;

    // Check if user exists and is allowed to create groups
    const user = await getUserByEmail(userEmail);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found. Please sign in again.' },
        { status: 404 }
      );
    }

    // Only admin users can create groups (for now)
    if (user.globalRole !== 'admin') {
      return NextResponse.json(
        { error: 'Only admin users can create groups' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, description, visibility, defaultEventSpots, spreadsheetId: providedSpreadsheetId } = body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      );
    }

    let spreadsheetId: string;
    let spreadsheetUrl: string;

    if (providedSpreadsheetId) {
      // Use the provided spreadsheet ID
      spreadsheetId = providedSpreadsheetId;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      console.log(`Using provided spreadsheet: ${spreadsheetId}`);
      
      // Initialize the spreadsheet with headers
      const { initializeGroupSpreadsheet } = await import('@/lib/groupSheet');
      await initializeGroupSpreadsheet(spreadsheetId);
    } else {
      // Try to create automatically
      try {
        console.log(`Creating spreadsheet for group: ${name}`);
        const result = await createGroupSpreadsheet(name);
        spreadsheetId = result.spreadsheetId;
        spreadsheetUrl = result.spreadsheetUrl;
        console.log(`Spreadsheet created: ${spreadsheetId}`);
      } catch (createError) {
        console.error('Auto-creation failed:', createError);
        return NextResponse.json({
          error: 'Could not auto-create spreadsheet. Please create one manually.',
          instructions: [
            '1. Create a new Google Spreadsheet in your Hoops Master folder',
            '2. Create 3 sheets (tabs): Events, EventAttendees, Transactions',
            '3. Share it with the service account email as Editor',
            '4. Copy the spreadsheet ID from the URL',
            '5. Include "spreadsheetId" in your request body',
          ],
          details: String(createError),
        }, { status: 500 });
      }
    }

    // Create the group record in master sheet
    const group = await createGroup(
      {
        name: name.trim(),
        description: description || '',
        visibility: (visibility as GroupVisibility) || 'private',
        defaultEventSpots: defaultEventSpots || 10,
        spreadsheetId,
      },
      userEmail
    );

    // Add the creator as an admin member
    await addGroupMember(group.groupId, userEmail, 'admin');

    return NextResponse.json({
      success: true,
      data: {
        ...group,
        spreadsheetUrl,
      },
      message: 'Group created successfully',
    });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json(
      { error: 'Failed to create group', details: String(error) },
      { status: 500 }
    );
  }
}

