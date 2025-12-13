/**
 * Group Events API
 * 
 * GET /api/groups/[groupId]/events - List events for a group
 * POST /api/groups/[groupId]/events - Create a new event
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGroupById, getGroupMember, isGroupAdmin } from '@/lib/masterSheet';
import { getEvents, createEvent, getEventAttendees } from '@/lib/groupSheet';
import { CreateEventRequest, EventWithAttendees } from '@/lib/types';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

/**
 * GET /api/groups/[groupId]/events - List events for a group
 * 
 * Query params:
 * - from: Start date (YYYY-MM-DD), defaults to today
 * - to: End date (YYYY-MM-DD), defaults to 30 days from now
 * - includePast: Include past events (default: false)
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

    const { groupId } = await params;
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

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const includePast = searchParams.get('includePast') === 'true';
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');

    // Get all events from the group's spreadsheet
    const allEvents = await getEvents(group.spreadsheetId);

    // Filter events
    const today = new Date().toISOString().split('T')[0];
    let filteredEvents = allEvents.filter(event => {
      // Filter out cancelled events unless specifically requested
      if (event.status === 'cancelled') return false;
      
      // Filter by date range
      if (!includePast && event.date < today) return false;
      if (fromDate && event.date < fromDate) return false;
      if (toDate && event.date > toDate) return false;
      
      return true;
    });

    // Sort by date and time
    filteredEvents.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });

    // Enrich with attendee counts
    const eventsWithCounts = await Promise.all(
      filteredEvents.map(async (event) => {
        const attendees = await getEventAttendees(group.spreadsheetId, event.eventId);
        const confirmedCount = attendees.filter(a => a.status === 'confirmed').length;
        const offeredCount = attendees.filter(a => a.status === 'offered').length;
        
        return {
          ...event,
          attendeeCount: confirmedCount,
          offeredCount,
          availableSpots: event.totalSpots - confirmedCount,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: eventsWithCounts,
      count: eventsWithCounts.length,
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Calculate signup open timestamp based on type and value
 */
function calculateSignupOpensAt(
  eventDate: string,
  eventStartTime: string,
  signupOpenType: 'immediate' | 'relative' | 'absolute',
  signupOpenValue?: number | string
): string {
  if (signupOpenType === 'immediate') {
    return '1970-01-01T00:00:00.000Z'; // Always open
  }
  
  if (signupOpenType === 'relative' && typeof signupOpenValue === 'number') {
    // signupOpenValue = days before event
    const eventDateTime = new Date(`${eventDate}T${eventStartTime}`);
    eventDateTime.setDate(eventDateTime.getDate() - signupOpenValue);
    return eventDateTime.toISOString();
  }
  
  if (signupOpenType === 'absolute' && typeof signupOpenValue === 'string') {
    // signupOpenValue = ISO date string
    return new Date(signupOpenValue).toISOString();
  }
  
  return '1970-01-01T00:00:00.000Z'; // Default: immediate
}

/**
 * POST /api/groups/[groupId]/events - Create a new event
 * 
 * Body: { date, startTime, endTime, totalSpots, slotCost, location?, description?, eventType?, signupOpenType?, signupOpenValue? }
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

    const { groupId } = await params;
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
        { error: 'Only group admins can create events' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { 
      date, startTime, endTime, totalSpots, slotCost, 
      location, description, eventType,
      signupOpenType = 'immediate', signupOpenValue 
    } = body;

    // Validate required fields
    if (!date || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'date, startTime, and endTime are required' },
        { status: 400 }
      );
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'date must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return NextResponse.json(
        { error: 'startTime and endTime must be in HH:MM format' },
        { status: 400 }
      );
    }

    // Calculate signup opens timestamp
    const signupOpensAt = calculateSignupOpensAt(date, startTime, signupOpenType, signupOpenValue);

    // Create the event
    const event = await createEvent(
      group.spreadsheetId,
      {
        date,
        startTime,
        endTime,
        totalSpots: totalSpots || group.defaultEventSpots,
        slotCost: slotCost || 0,
        location,
        description,
        eventType,
        signupOpensAt,
      },
      userEmail
    );

    return NextResponse.json({
      success: true,
      data: event,
      message: 'Event created successfully',
    });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      { error: 'Failed to create event', details: String(error) },
      { status: 500 }
    );
  }
}

