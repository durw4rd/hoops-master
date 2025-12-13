/**
 * Reassign Event Spot API (Admin)
 * 
 * POST /api/groups/[groupId]/events/[eventId]/reassign - Reassign a spot to another user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGroupById, getGroupMember, isGroupAdmin, getUserByEmail } from '@/lib/masterSheet';
import {
  getEventById,
  getEventAttendees,
  getAttendeeById,
  addEventAttendee,
  transferAttendeeSpot,
  createTransaction,
} from '@/lib/groupSheet';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

/**
 * POST /api/groups/[groupId]/events/[eventId]/reassign
 * 
 * Body: { attendeeId?: string, fromUserEmail?: string, toUserEmail: string }
 * - attendeeId: The specific attendee record to reassign
 * - fromUserEmail: Alternative way to specify whose spot to reassign
 * - toUserEmail: The user to assign the spot to
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
    const adminEmail = session.user.email;

    // Get the group
    const group = await getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check if user is group admin
    const isAdmin = await isGroupAdmin(groupId, adminEmail);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only group admins can reassign spots' },
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

    // Parse request body
    const body = await request.json();
    const { attendeeId, fromUserEmail, toUserEmail } = body;

    if (!toUserEmail) {
      return NextResponse.json(
        { error: 'toUserEmail is required' },
        { status: 400 }
      );
    }

    // Verify target user exists and is a group member
    const targetUser = await getUserByEmail(toUserEmail);
    if (!targetUser) {
      return NextResponse.json(
        { error: 'Target user not found in the system' },
        { status: 404 }
      );
    }

    const targetMember = await getGroupMember(groupId, toUserEmail);
    if (!targetMember || targetMember.status !== 'active') {
      return NextResponse.json(
        { error: 'Target user is not an active member of this group' },
        { status: 400 }
      );
    }

    const spreadsheetId = group.spreadsheetId;

    // Check if target user is already attending
    const attendees = await getEventAttendees(spreadsheetId, eventId);
    const targetAlreadyAttending = attendees.find(
      a => a.userEmail.toLowerCase() === toUserEmail.toLowerCase() && a.status === 'confirmed'
    );

    if (targetAlreadyAttending) {
      return NextResponse.json(
        { error: 'Target user is already attending this event' },
        { status: 409 }
      );
    }

    let targetAttendeeId: string;
    let previousHolder: string | null = null;

    if (attendeeId) {
      // Reassign specific attendee record
      const attendee = await getAttendeeById(spreadsheetId, attendeeId);
      if (!attendee || attendee.eventId !== eventId) {
        return NextResponse.json(
          { error: 'Attendee record not found for this event' },
          { status: 404 }
        );
      }
      targetAttendeeId = attendeeId;
      previousHolder = attendee.userEmail;

      // Transfer the spot
      await transferAttendeeSpot(spreadsheetId, attendeeId, toUserEmail);
    } else if (fromUserEmail) {
      // Find attendee by email
      const attendee = attendees.find(
        a => a.userEmail.toLowerCase() === fromUserEmail.toLowerCase()
      );
      if (!attendee) {
        return NextResponse.json(
          { error: 'User is not attending this event' },
          { status: 404 }
        );
      }
      targetAttendeeId = attendee.attendeeId;
      previousHolder = attendee.userEmail;

      // Transfer the spot
      await transferAttendeeSpot(spreadsheetId, attendee.attendeeId, toUserEmail);
    } else {
      // Create new spot for the user
      const confirmedCount = attendees.filter(a => a.status === 'confirmed').length;
      if (confirmedCount >= event.totalSpots) {
        return NextResponse.json(
          { error: 'No available spots. Specify attendeeId or fromUserEmail to reassign an existing spot.' },
          { status: 400 }
        );
      }

      const newAttendee = await addEventAttendee(spreadsheetId, eventId, toUserEmail, adminEmail);
      targetAttendeeId = newAttendee.attendeeId;
    }

    // Create transaction record
    await createTransaction(spreadsheetId, {
      eventId,
      attendeeId: targetAttendeeId,
      type: 'admin-reassign',
      fromUserEmail: previousHolder,
      toUserEmail,
      amount: event.slotCost,
      notes: `Admin reassignment by ${adminEmail}`,
    });

    return NextResponse.json({
      success: true,
      message: previousHolder 
        ? `Spot reassigned from ${previousHolder} to ${toUserEmail}`
        : `Spot assigned to ${toUserEmail}`,
      data: {
        eventId,
        attendeeId: targetAttendeeId,
        previousHolder,
        newHolder: toUserEmail,
      },
    });
  } catch (error) {
    console.error('Error reassigning spot:', error);
    return NextResponse.json(
      { error: 'Failed to reassign spot', details: String(error) },
      { status: 500 }
    );
  }
}

