/**
 * Groups API
 *
 * GET  /api/groups - List current user's groups
 * POST /api/groups - Create a new group (app-admin gated via DB role OR LD flag)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { createGroup, getUserGroupRecords } from '@/lib/queries/groups';
import { isAppAdmin } from '@/lib/launchdarkly';

export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const groups = await getUserGroupRecords(ctx.user.email);
    return NextResponse.json({ success: true, data: groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  try {
    // App-admin gate: DB global_role === 'admin' OR present in LD `app-admins` flag.
    const allowed = await isAppAdmin(ctx.user.email, ctx.user.globalRole);
    if (!allowed) {
      return NextResponse.json(
        { error: 'You do not have permission to create crews' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      description,
      bannerUrl,
      bannerOrientation,
      visibility,
      defaultEventSpots,
      defaultSlotCost,
      defaultPricingMode,
      defaultTotalCost,
      timezone,
      roundRobinSlide,
    } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    const group = await createGroup(
      {
        name: name.trim(),
        description: description || '',
        bannerUrl: bannerUrl || undefined,
        bannerOrientation: bannerOrientation === 'portrait' ? 'portrait' : 'landscape',
        visibility: visibility || 'private',
        defaultEventSpots: defaultEventSpots || 10,
        defaultSlotCost: defaultSlotCost ?? 0,
        defaultPricingMode:
          defaultPricingMode === 'split_total' ? 'split_total' : 'per_spot',
        defaultTotalCost: defaultTotalCost ?? 0,
        timezone: timezone || undefined,
        roundRobinSlide: roundRobinSlide ?? 1,
      },
      ctx.user.id
    );

    return NextResponse.json({
      success: true,
      data: group,
      message: 'Group created successfully',
    });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json(
      { error: 'Failed to create group', details: String(error) },
      { status: 500 }
    );
  }
}
