import { NextRequest, NextResponse } from 'next/server';
import { markBatchAsSettled, getUserMapping } from '@/lib/googleSheets';

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
    
    const { batchId } = await request.json();
    
    if (!batchId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: batchId' },
        { status: 400 }
      );
    }
    
    const result = await markBatchAsSettled(batchId);
    
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error marking batch as settled:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark batch as settled' },
      { status: 500 }
    );
  }
}
