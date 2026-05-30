/**
 * Onboarding API
 *
 * POST /api/user/onboard - Set the signed-in user's username (first-login).
 *   Body: { username: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { completeOnboarding } from '@/lib/queries/users';

const MAX_USERNAME = 30;

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';

    if (username.length < 2) {
      return NextResponse.json(
        { error: 'Username must be at least 2 characters' },
        { status: 400 }
      );
    }
    if (username.length > MAX_USERNAME) {
      return NextResponse.json(
        { error: `Username must be at most ${MAX_USERNAME} characters` },
        { status: 400 }
      );
    }

    const row = await completeOnboarding(ctx.user.id, username);
    return NextResponse.json({
      success: true,
      data: { displayName: row.displayName, onboarded: row.onboarded },
    });
  } catch (error) {
    console.error('Error during onboarding:', error);
    return NextResponse.json(
      { error: 'Failed to save username', details: String(error) },
      { status: 500 }
    );
  }
}
