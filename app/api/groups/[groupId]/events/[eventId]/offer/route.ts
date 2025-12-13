/**
 * Offer Event Spot API
 * 
 * POST /api/groups/[groupId]/events/[eventId]/offer - Offer your spot for others to claim
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
 * POST /api/groups/[groupId]/events/[eventId]/offer - Offer your spot
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

    // Check if event is in the future
    const eventDate = new Date(`${event.date}T${event.startTime}`);
    if (eventDate < new Date()) {
      return NextResponse.json(
        { error: 'Cannot offer spots for past events' },
        { status: 400 }
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

    if (attendance.status === 'offered') {
      return NextResponse.json(
        { error: 'Your spot is already offered' },
        { status: 409 }
      );
    }

    // Update status to offered
    const result = await updateAttendeeStatus(group.spreadsheetId, attendance.attendeeId, 'offered');
    if (!result) {
      return NextResponse.json(
        { error: 'Failed to offer spot' },
        { status: 500 }
      );
    }

    // Create transaction record
    await createTransaction(group.spreadsheetId, {
      eventId,
      attendeeId: attendance.attendeeId,
      type: 'offer',
      fromUserEmail: userEmail,
      toUserEmail: userEmail, // Still the holder until claimed
      amount: 0,
      notes: 'Spot offered for grabs',
    });

    return NextResponse.json({
      success: true,
      message: 'Your spot is now available for others to claim',
      data: result.attendee,
    });
  } catch (error) {
    console.error('Error offering spot:', error);
    return NextResponse.json(
      { error: 'Failed to offer spot', details: String(error) },
      { status: 500 }
    );
  }
}

