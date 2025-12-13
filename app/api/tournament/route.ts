import { NextRequest, NextResponse } from 'next/server';
import { getTournamentTeams } from '@/lib/googleSheets';

export async function GET(request: NextRequest) {
  try {
    const tournamentData = await getTournamentTeams();
    
    return NextResponse.json({
      success: true,
      teams: tournamentData.teams
    });
  } catch (error) {
    console.error('Error fetching tournament data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch tournament data',
        teams: []
      },
      { status: 500 }
    );
  }
}
