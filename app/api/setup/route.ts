/**
 * Initial Setup API
 *
 * POST /api/setup - Bootstrap the first admin user in Neon.
 * GET  /api/setup - Report whether setup has been completed.
 *
 * Security: POST only works while the users table is empty (first-time setup).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

async function userCount(): Promise<number> {
  const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM users`);
  return (result.rows?.[0] as { count: number } | undefined)?.count ?? 0;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, displayName } = body;
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if ((await userCount()) > 0) {
      return NextResponse.json(
        { error: 'Setup already completed. Users table is not empty.' },
        { status: 403 }
      );
    }

    const normalized = String(email).toLowerCase();
    const [user] = await db
      .insert(users)
      .values({
        email: normalized,
        displayName: displayName || normalized.split('@')[0],
        globalRole: 'admin',
      })
      .returning();

    return NextResponse.json({
      success: true,
      message: 'Setup completed successfully',
      user: {
        email: user.email,
        displayName: user.displayName,
        globalRole: user.globalRole,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: 'Setup failed', details: String(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const count = await userCount();
    return NextResponse.json({
      setupComplete: count > 0,
      userCount: count,
      message: count > 0 ? 'Setup already completed' : 'Setup required - POST { email, displayName }',
    });
  } catch (error) {
    return NextResponse.json({ setupComplete: false, reason: String(error) });
  }
}
