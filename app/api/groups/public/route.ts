/**
 * Public Groups API
 *
 * GET /api/groups/public - List all public groups (for discovery)
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { getPublicGroups } from '@/lib/queries/groups';

export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const groups = await getPublicGroups();
    const publicGroups = groups.map((group) => ({
      groupId: group.groupId,
      name: group.name,
      description: group.description,
      visibility: group.visibility,
      defaultEventSpots: group.defaultEventSpots,
      createdAt: group.createdAt,
      status: group.status,
      bannerUrl: group.bannerUrl,
      bannerOrientation: group.bannerOrientation,
    }));
    return NextResponse.json({ success: true, data: publicGroups });
  } catch (error) {
    console.error('Error fetching public groups:', error);
    return NextResponse.json({ error: 'Failed to fetch public groups' }, { status: 500 });
  }
}
