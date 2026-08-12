/**
 * Crew banner upload
 *
 * POST /api/groups/banner - uploads an image to Vercel Blob and returns its URL.
 *
 * Auth:
 *  - With a `groupId` (editing an existing crew): requires Crew Capo/King.
 *  - Without a `groupId` (during crew creation): requires app-admin (same gate
 *    as creating a crew).
 */

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAuth, requireCrewManager } from '@/lib/apiGuards';
import { isAppAdminRole } from '@/lib/roles';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const groupId = formData.get('groupId');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Authorize: crew managers for an existing crew, otherwise app-admins.
    if (typeof groupId === 'string' && groupId.length > 0) {
      const managerCtx = await requireCrewManager(groupId);
      if (managerCtx instanceof NextResponse) return managerCtx;
    } else {
      const allowed = isAppAdminRole(ctx.user.globalRole);
      if (!allowed) {
        return NextResponse.json(
          { error: 'You do not have permission to upload a crew banner' },
          { status: 403 }
        );
      }
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Banner must be 5MB or smaller' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const key = `crew-banners/${crypto.randomUUID()}.${ext}`;

    const blob = await put(key, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ success: true, url: blob.url });
  } catch (error) {
    console.error('Error uploading crew banner:', error);
    return NextResponse.json(
      { error: 'Failed to upload banner', details: String(error) },
      { status: 500 }
    );
  }
}
