/**
 * Bulk Create Events API
 * 
 * POST /api/groups/[groupId]/events/bulk - Create multiple recurring events
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGroupById, isGroupAdmin } from '@/lib/masterSheet';
import { bulkCreateEvents } from '@/lib/groupSheet';
import { EventType } from '@/lib/types';

interface RouteParams {
  params: Promise<{ groupId: string }>;
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
    return '1970-01-01T00:00:00.000Z';
  }
  
  if (signupOpenType === 'relative' && typeof signupOpenValue === 'number') {
    const eventDateTime = new Date(`${eventDate}T${eventStartTime}`);
    eventDateTime.setDate(eventDateTime.getDate() - signupOpenValue);
    return eventDateTime.toISOString();
  }
  
  if (signupOpenType === 'absolute' && typeof signupOpenValue === 'string') {
    return new Date(signupOpenValue).toISOString();
  }
  
  return '1970-01-01T00:00:00.000Z';
}

/**
 * Generate dates for recurring events
 */
function generateRecurringDates(
  startDate: string,
  endDate: string,
  dayOfWeek: number
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Find the first occurrence of the target day
  let current = new Date(start);
  while (current.getDay() !== dayOfWeek) {
    current.setDate(current.getDate() + 1);
  }

  // Generate all dates
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7); // Add 7 days for weekly
  }

  return dates;
}

/**
 * POST /api/groups/[groupId]/events/bulk - Create multiple recurring events
 * 
 * Body: {
 *   startDate: "YYYY-MM-DD",     // First possible date
 *   endDate: "YYYY-MM-DD",       // Last possible date
 *   dayOfWeek: 0-6,              // 0=Sunday, 1=Monday, ..., 6=Saturday
 *   startTime: "HH:MM",
 *   endTime: "HH:MM",
 *   totalSpots: number,
 *   slotCost: number,
 *   location?: string,
 *   description?: string,
 *   eventType?: "regular" | "tournament" | "special"
 * }
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
      startDate,
      endDate,
      dayOfWeek,
      startTime,
      endTime,
      totalSpots,
      slotCost,
      location,
      description,
      eventType,
      signupOpenType = 'immediate',
      signupOpenValue,
    } = body;

    // Validate required fields
    if (!startDate || !endDate || dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'startDate, endDate, dayOfWeek, startTime, and endTime are required' },
        { status: 400 }
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json(
        { error: 'startDate and endDate must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Validate dayOfWeek
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json(
        { error: 'dayOfWeek must be 0-6 (Sunday-Saturday)' },
        { status: 400 }
      );
    }

    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return NextResponse.json(
        { error: 'startTime and endTime must be in HH:MM format' },
        { status: 400 }
      );
    }

    // Generate dates for the recurring events
    const dates = generateRecurringDates(startDate, endDate, dayOfWeek);

    if (dates.length === 0) {
      return NextResponse.json(
        { error: 'No dates found in the specified range for the given day of week' },
        { status: 400 }
      );
    }

    // Create event data for each date
    const eventsToCreate = dates.map(date => ({
      date,
      startTime,
      endTime,
      totalSpots: totalSpots || group.defaultEventSpots,
      slotCost: slotCost || 0,
      location,
      description,
      eventType: eventType as EventType,
      signupOpensAt: calculateSignupOpensAt(date, startTime, signupOpenType, signupOpenValue),
    }));

    // Bulk create the events
    const createdEvents = await bulkCreateEvents(
      group.spreadsheetId,
      eventsToCreate,
      userEmail
    );

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return NextResponse.json({
      success: true,
      data: createdEvents,
      count: createdEvents.length,
      message: `Created ${createdEvents.length} events for ${dayNames[dayOfWeek]}s from ${startDate} to ${endDate}`,
    });
  } catch (error) {
    console.error('Error creating bulk events:', error);
    return NextResponse.json(
      { error: 'Failed to create events', details: String(error) },
      { status: 500 }
    );
  }
}

