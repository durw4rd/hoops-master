import { NextRequest, NextResponse } from 'next/server';
import { 
  getSettlementPairings,
  createSettlementPairings,
  getUserMapping
} from '@/lib/googleSheets';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    
    if (!batchId) {
      return NextResponse.json(
        { success: false, error: 'batchId parameter is required' },
        { status: 400 }
      );
    }
    
    const pairings = await getSettlementPairings(batchId);
    
    return NextResponse.json({
      success: true,
      data: pairings
    });
  } catch (error) {
    console.error('Error fetching settlement pairings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settlement pairings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the user's email from the request headers (same pattern as other admin routes)
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
    
    const { batchId } = await request.json();
    
    if (!batchId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: batchId' },
        { status: 400 }
      );
    }
    
    const result = await createSettlementPairings(batchId);
    
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating settlement pairings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create settlement pairings' },
      { status: 500 }
    );
  }
}
