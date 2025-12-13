/**
 * Claim Event Spot API
 * 
 * POST /api/groups/[groupId]/events/[eventId]/claim - Claim an available or offered spot
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGroupById, getGroupMember } from '@/lib/masterSheet';
import {
  getEventById,
  getEventAttendees,
  getUserEventAttendance,
  addEventAttendee,
  transferAttendeeSpot,
  updateAttendeeStatus,
  createTransaction,
} from '@/lib/groupSheet';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

/**
 * POST /api/groups/[groupId]/events/[eventId]/claim
 * 
 * Body: { attendeeId?: string }
 * - If attendeeId is provided, claims that specific offered spot
 * - If not provided, claims a new available spot
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
        { error: 'Cannot claim spots for past events' },
        { status: 400 }
      );
    }

    // Check if event is cancelled
    if (event.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This event has been cancelled' },
        { status: 400 }
      );
    }

    // Check if signup is open
    // Handle empty, invalid, or epoch dates as "always open"
    const isSignupOpen = () => {
      if (!event.signupOpensAt || event.signupOpensAt.trim() === '') {
        return true;
      }
      
      const signupDate = new Date(event.signupOpensAt);
      
      // Invalid date = always open
      if (isNaN(signupDate.getTime())) {
        return true;
      }
      
      // Epoch or very early date (before 2000) = always open
      if (signupDate.getFullYear() < 2000) {
        return true;
      }
      
      return signupDate <= new Date();
    };
    
    if (!isSignupOpen()) {
      const signupOpensAt = new Date(event.signupOpensAt);
      return NextResponse.json(
        { 
          error: 'Signup is not open yet', 
          signupOpensAt: event.signupOpensAt,
          message: `Signup opens ${signupOpensAt.toLocaleString()}` 
        },
        { status: 400 }
      );
    }

    // Check if user is already attending
    const existingAttendance = await getUserEventAttendance(group.spreadsheetId, eventId, userEmail);
    if (existingAttendance && existingAttendance.status === 'confirmed') {
      return NextResponse.json(
        { error: 'You are already attending this event' },
        { status: 409 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { attendeeId } = body;

    const spreadsheetId = group.spreadsheetId;

    if (attendeeId) {
      // Claiming an offered spot
      const attendees = await getEventAttendees(spreadsheetId, eventId);
      const offeredSpot = attendees.find(
        a => a.attendeeId === attendeeId && a.status === 'offered'
      );

      if (!offeredSpot) {
        return NextResponse.json(
          { error: 'This spot is no longer available' },
          { status: 404 }
        );
      }

      const previousHolder = offeredSpot.userEmail;

      // Transfer the spot
      await transferAttendeeSpot(spreadsheetId, attendeeId, userEmail);

      // Create transaction record
      await createTransaction(spreadsheetId, {
        eventId,
        attendeeId,
        type: 'claim',
        fromUserEmail: previousHolder,
        toUserEmail: userEmail,
        amount: event.slotCost,
        notes: 'Claimed offered spot',
      });

      return NextResponse.json({
        success: true,
        message: 'Successfully claimed the offered spot',
        data: {
          eventId,
          attendeeId,
          previousHolder,
        },
      });
    } else {
      // Claiming a new available spot
      const attendees = await getEventAttendees(spreadsheetId, eventId);
      const confirmedCount = attendees.filter(a => a.status === 'confirmed').length;

      if (confirmedCount >= event.totalSpots) {
        return NextResponse.json(
          { error: 'No available spots for this event' },
          { status: 400 }
        );
      }

      // Add as new attendee
      const newAttendee = await addEventAttendee(spreadsheetId, eventId, userEmail);

      // Create transaction record
      await createTransaction(spreadsheetId, {
        eventId,
        attendeeId: newAttendee.attendeeId,
        type: 'claim',
        fromUserEmail: null, // Free spot
        toUserEmail: userEmail,
        amount: event.slotCost,
        notes: 'Claimed available spot',
      });

      return NextResponse.json({
        success: true,
        message: 'Successfully claimed a spot',
        data: newAttendee,
      });
    }
  } catch (error) {
    console.error('Error claiming spot:', error);
    return NextResponse.json(
      { error: 'Failed to claim spot', details: String(error) },
      { status: 500 }
    );
  }
}

