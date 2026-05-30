/**
 * Round-Robin Roster API (admin only for PUT)
 *
 * GET /api/groups/[groupId]/roster - current roster order
 * PUT /api/groups/[groupId]/roster - set/reorder roster
 *   Body: { entries: [{ userEmail, isActive }] } in display order
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember, requireGroupAdmin } from '@/lib/apiGuards';
import { getRoster, setRoster, type RosterInput } from '@/lib/queries/roundRobin';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const roster = await getRoster(groupId);
    return NextResponse.json({ success: true, data: roster });
  } catch (error) {
    console.error('Error fetching roster:', error);
    return NextResponse.json({ error: 'Failed to fetch roster' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireGroupAdmin(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const entries = body?.entries;
    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: 'entries array is required' }, { status: 400 });
    }
    const normalized: RosterInput[] = entries.map((e: { userEmail: string; isActive?: boolean }) => ({
      userEmail: e.userEmail,
      isActive: e.isActive !== false,
    }));
    const roster = await setRoster(groupId, normalized);
    return NextResponse.json({ success: true, data: roster, message: 'Roster updated' });
  } catch (error) {
    console.error('Error updating roster:', error);
    return NextResponse.json({ error: 'Failed to update roster' }, { status: 500 });
  }
}
