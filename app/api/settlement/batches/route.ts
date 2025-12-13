import { NextRequest, NextResponse } from 'next/server';
import { 
  createSettlementBatch, 
  getSettlementBatches,
  getBatchSlots,
  createSettlementPairings,
  getSettlementPairings,
  markBatchAsSettled,
  getUserMapping
} from '@/lib/googleSheets';

export async function GET() {
  try {
    const batches = await getSettlementBatches();
    
    // Calculate total slots and amounts for each batch
    const enrichedBatches = await Promise.all(
      batches.map(async (batch) => {
        const slots = await getBatchSlots(batch.id);
        const totalAmount = slots.reduce((sum, slot) => sum + slot.amount, 0);
        
        return {
          ...batch,
          totalSlots: slots.length,
          totalAmount: parseFloat(totalAmount.toFixed(2))
        };
      })
    );
    
    return NextResponse.json({
      success: true,
      data: enrichedBatches
    });
  } catch (error) {
    console.error('Error fetching settlement batches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settlement batches' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the user's email from the request headers (same pattern as admin-reassign)
    const userEmail = request.headers.get('x-user-email');
    
    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: 'User authentication required' },
        { status: 401 }
      );
    }
    
    // Check if user is admin
    const userMapping = await getUserMapping();
    const user = Object.entries(userMapping).find(([_, data]) => data.email === userEmail);
    
    if (!user || user[1].role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }
    
    const { name, fromDate, toDate } = await request.json();
    
    if (!name || !fromDate || !toDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, fromDate, toDate' },
        { status: 400 }
      );
    }
    
    const result = await createSettlementBatch({ name, fromDate, toDate });
    
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating settlement batch:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create settlement batch' },
      { status: 500 }
    );
  }
}
