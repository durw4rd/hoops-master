import { NextRequest, NextResponse } from 'next/server';
import { getAllSlots, getUserMapping } from '@/lib/googleSheets';
import { SettlementCalculator } from '@/lib/settlementCalculator';

export async function GET(request: NextRequest) {
  try {
    // Get all slots and user mapping
    const [slots, userMapping] = await Promise.all([
      getAllSlots(),
      getUserMapping()
    ]);

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

    // Calculate settlements using simplified approach
    const settlements = SettlementCalculator.calculateSettlements(slots, userPreferences);

    // Get credit breakdown for summary
    const creditBreakdown = SettlementCalculator.getCreditBreakdown(slots, userPreferences);

    // Calculate summary statistics
    const totalDebt = settlements.reduce((sum, debt) => sum + debt.amount, 0);
    const uniquePlayers = new Set([
      ...settlements.map(d => d.fromPlayer),
      ...settlements.map(d => d.toPlayer)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        settlements,
        playerCredits: creditBreakdown.playerCredits,
        summary: {
          totalDebt: parseFloat(totalDebt.toFixed(2)),
          numberOfTransactions: settlements.length,
          numberOfPlayers: uniquePlayers.size,
          totalSlots: creditBreakdown.summary.totalSlots,
          eligibleSlots: creditBreakdown.summary.eligibleSlots,
          totalCredits: parseFloat(creditBreakdown.summary.totalCredits.toFixed(2)),
          totalDebits: parseFloat(creditBreakdown.summary.totalDebits.toFixed(2)),
          netBalance: parseFloat(creditBreakdown.summary.netBalance.toFixed(2)),
          calculatedAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error calculating settlements:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to calculate settlements',
        data: {
          settlements: [],
          playerCredits: [],
          summary: {
            totalDebt: 0,
            numberOfTransactions: 0,
            numberOfPlayers: 0,
            totalSlots: 0,
            eligibleSlots: 0,
            totalCredits: 0,
            totalDebits: 0,
            netBalance: 0,
            calculatedAt: new Date().toISOString()
          }
        }
      }, 
      { status: 500 }
    );
  }
}
