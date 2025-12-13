/**
 * Retract Offered Spot API
 * 
 * POST /api/groups/[groupId]/events/[eventId]/retract - Retract your offered spot
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGroupById, getGroupMember } from '@/lib/masterSheet';
import {
  getEventById,
  getUserEventAttendance,
  updateAttendeeStatus,
  createTransaction,
} from '@/lib/groupSheet';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

/**
 * POST /api/groups/[groupId]/events/[eventId]/retract - Retract your offered spot
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    const { groupId, eventId } = await params;
    const userEmail = session.user.email;

    // Get the group
    const group = await getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check if user is a member
    const member = await getGroupMember(groupId, userEmail);
    if (!member || member.status !== 'active') {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      );
    }

    // Get the event
    const event = await getEventById(group.spreadsheetId, eventId);
    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Get user's attendance
    const attendance = await getUserEventAttendance(group.spreadsheetId, eventId, userEmail);
    if (!attendance) {
      return NextResponse.json(
        { error: 'You are not attending this event' },
        { status: 404 }
      );
    }

    if (attendance.status !== 'offered') {
      return NextResponse.json(
        { error: 'Your spot is not currently offered' },
        { status: 400 }
      );
    }

    // Update status back to confirmed
    const result = await updateAttendeeStatus(group.spreadsheetId, attendance.attendeeId, 'confirmed');
    if (!result) {
      return NextResponse.json(
        { error: 'Failed to retract offer' },
        { status: 500 }
      );
    }

    // Create transaction record
    await createTransaction(group.spreadsheetId, {
      eventId,
      attendeeId: attendance.attendeeId,
      type: 'retract',
      fromUserEmail: userEmail,
      toUserEmail: userEmail,
      amount: 0,
      notes: 'Retracted offered spot',
    });

    return NextResponse.json({
      success: true,
      message: 'Your spot offer has been retracted',
      data: result.attendee,
    });
  } catch (error) {
    console.error('Error retracting offer:', error);
    return NextResponse.json(
      { error: 'Failed to retract offer', details: String(error) },
      { status: 500 }
    );
  }
}

