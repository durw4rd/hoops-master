import { NextRequest, NextResponse } from 'next/server';
import { updateUserSettlementPreference, getUserMapping } from '@/lib/googleSheets';

export async function GET(request: NextRequest) {
  try {
    const userMapping = await getUserMapping();
    
    // Convert user mapping to the expected format
    const userPreferences: { [playerName: string]: { smartSettle: boolean; email: string; color?: string; role?: string } } = {};
    for (const [playerName, userData] of Object.entries(userMapping)) {
      userPreferences[playerName] = {
        smartSettle: userData.smartSettle,
        email: userData.email,
        color: userData.color,
        role: userData.role
      };
    }

    return NextResponse.json({
      success: true,
      data: userPreferences
    });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user preferences' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerName, smartSettle } = body;

    // Validate input
    if (!playerName || typeof smartSettle !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Invalid input. playerName and smartSettle (boolean) are required.' },
        { status: 400 }
      );
    }

    // Update user preference
    await updateUserSettlementPreference({ playerName, smartSettle });

    return NextResponse.json({
      success: true,
      data: {
        playerName,
        smartSettle,
        message: `Updated smartSettle preference for ${playerName} to ${smartSettle}`
      }
    });
  } catch (error) {
    console.error('Error updating player preference:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update player preference' },
      { status: 500 }
    );
  }
}
