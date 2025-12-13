/**
 * Individual Event API
 * 
 * GET /api/groups/[groupId]/events/[eventId] - Get event with attendees
 * PATCH /api/groups/[groupId]/events/[eventId] - Update event (admin only)
 * DELETE /api/groups/[groupId]/events/[eventId] - Cancel event (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGroupById, getGroupMember, isGroupAdmin } from '@/lib/masterSheet';
import { getEventWithAttendees, updateEventStatus } from '@/lib/groupSheet';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

/**
 * GET /api/groups/[groupId]/events/[eventId] - Get event with attendees
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // Get the event with attendees
    const event = await getEventWithAttendees(group.spreadsheetId, eventId);
    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Check if current user is attending
    const userAttendance = event.attendees.find(
      a => a.userEmail.toLowerCase() === userEmail.toLowerCase()
    );

    return NextResponse.json({
      success: true,
      data: {
        ...event,
        isAttending: !!userAttendance,
        myAttendance: userAttendance || null,
      },
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    return NextResponse.json(
      { error: 'Failed to fetch event', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/groups/[groupId]/events/[eventId] - Cancel event (admin only)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // Check if user is group admin
    const isAdmin = await isGroupAdmin(groupId, userEmail);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only group admins can cancel events' },
        { status: 403 }
      );
    }

    // Cancel the event (mark as cancelled, don't delete)
    const updatedEvent = await updateEventStatus(group.spreadsheetId, eventId, 'cancelled');

    if (!updatedEvent) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Event cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling event:', error);
    return NextResponse.json(
      { error: 'Failed to cancel event', details: String(error) },
      { status: 500 }
    );
  }
}

