import { NextRequest, NextResponse } from 'next/server';
import { markSettlementTransactionCompleted, getUserMapping } from '@/lib/googleSheets';

export async function POST(request: NextRequest) {
  try {
    // Get the user's email from the request headers
    const userEmail = request.headers.get('x-user-email');
    
    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: 'User authentication required' },
        { status: 401 }
      );
    }
    
    const { pairingId, batchId, creditorPlayer, debtorPlayer } = await request.json();
    
    if (!pairingId || !batchId || !creditorPlayer || !debtorPlayer) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: pairingId, batchId, creditorPlayer, debtorPlayer' },
        { status: 400 }
      );
    }
    
    // Get user mapping to find the player name from email
    const userMapping = await getUserMapping();
    const playerName = Object.keys(userMapping).find(
      key => userMapping[key].email === userEmail
    );
    
    if (!playerName) {
      return NextResponse.json(
        { success: false, error: 'User not found in player mapping' },
        { status: 400 }
      );
    }
    
    const result = await markSettlementTransactionCompleted({
      pairingId,
      batchId,
      creditorPlayer,
      debtorPlayer,
      completedBy: playerName
    });
    
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error marking settlement transaction as completed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark transaction as completed' },
      { status: 500 }
    );
  }
}
