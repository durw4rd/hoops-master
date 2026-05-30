/**
 * Available users for adding to a crew.
 *
 * GET /api/groups/[groupId]/members/available
 *   Returns player profiles (seeded or onboarded) who are NOT already active
 *   members. Seeded players can be added before they have signed in.
 *   Accessible to crew managers (Capo / King).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager } from '@/lib/apiGuards';
import { getGroupMembers } from '@/lib/queries/groups';
import { listUsers } from '@/lib/queries/users';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const [allUsers, members] = await Promise.all([listUsers(), getGroupMembers(groupId)]);
    const activeEmails = new Set(
      members.filter((m) => m.status === 'active').map((m) => m.userEmail.toLowerCase())
    );

    const available = allUsers
      .filter((u) => !activeEmails.has(u.email.toLowerCase()))
      .map((u) => ({
        email: u.email,
        displayName: u.displayName || u.email.split('@')[0],
        onboarded: u.onboarded,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({ success: true, data: available });
  } catch (error) {
    console.error('Error listing available users:', error);
    return NextResponse.json({ error: 'Failed to list available users' }, { status: 500 });
  }
}
