import { NextRequest, NextResponse } from 'next/server';
import { getAllSlots, getUserMapping } from '@/lib/googleSheets';
import { SettlementCalculator } from '@/lib/settlementCalculator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerName: string }> }
) {
  try {
    const { playerName } = await params;
    const decodedPlayerName = decodeURIComponent(playerName);

    // Get all slots and user mapping
    const [slots, userMapping] = await Promise.all([
      getAllSlots(),
      getUserMapping()
    ]);

    // Convert user mapping to the expected format
    const userPreferences: { [playerName: string]: { smartSettle: boolean; email: string; color?: string; role?: string } } = {};
    for (const [name, userData] of Object.entries(userMapping)) {
      userPreferences[name] = {
        smartSettle: userData.smartSettle,
        email: userData.email,
        color: userData.color,
        role: userData.role
      };
    }

    // Calculate settlements
    const allSettlements = SettlementCalculator.calculateSettlements(slots, userPreferences);

    // Get credit breakdown
    const creditBreakdown = SettlementCalculator.getCreditBreakdown(slots, userPreferences);

    // Filter settlements for this specific player
    const playerSettlements = allSettlements.filter(
      debt => debt.fromPlayer === decodedPlayerName || debt.toPlayer === decodedPlayerName
    );

    // Get player summary
    const summary = SettlementCalculator.getPlayerSettlementSummary(decodedPlayerName, creditBreakdown.playerCredits);

    // Get user preference for this player
    const userPreference = userPreferences[decodedPlayerName];

    // Get player's credit details
    const playerCredit = creditBreakdown.playerCredits.find(c => c.playerName === decodedPlayerName);

    return NextResponse.json({
      success: true,
      data: {
        playerName: decodedPlayerName,
        settlements: playerSettlements,
        summary,
        playerCredit: playerCredit || {
          playerName: decodedPlayerName,
          credits: 0,
          slotsGivenAway: 0,
          slotsClaimed: 0
        },
        userPreference: {
          smartSettle: userPreference?.smartSettle ?? true,
          email: userPreference?.email,
          color: userPreference?.color,
          role: userPreference?.role
        }
      }
    });
  } catch (error) {
    console.error('Error getting player settlement data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get player settlement data',
        data: {
          playerName: 'unknown',
          settlements: [],
          summary: { owes: 0, owed: 0, netAmount: 0 },
          playerCredit: null,
          userPreference: null
        }
      }, 
      { status: 500 }
    );
  }
}
