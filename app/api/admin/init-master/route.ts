/**
 * Initialize Master Spreadsheet API
 * 
 * POST /api/admin/init-master - Initialize headers in master spreadsheet sheets
 * 
 * This endpoint should be called once to set up the column headers in the
 * AppUsers, Groups, and GroupMembers sheets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { initializeMasterSpreadsheet } from '@/lib/masterSheet';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated session
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    // Initialize the master spreadsheet with headers
    await initializeMasterSpreadsheet();

    return NextResponse.json({
      success: true,
      message: 'Master spreadsheet initialized with headers for AppUsers, Groups, and GroupMembers sheets',
    });
  } catch (error) {
    console.error('Error initializing master spreadsheet:', error);
    return NextResponse.json(
      { error: 'Failed to initialize master spreadsheet', details: String(error) },
      { status: 500 }
    );
  }
}

