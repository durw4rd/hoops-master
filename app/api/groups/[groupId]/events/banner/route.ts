/**
 * Event banner upload
 *
 * POST /api/groups/[groupId]/events/banner - uploads an image to Vercel Blob.
 * Requires Crew Capo/King.
 */

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireCrewManager } from '@/lib/apiGuards';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
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
    const key = `event-banners/${crypto.randomUUID()}.${ext}`;

    const blob = await put(key, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ success: true, url: blob.url });
  } catch (error) {
    console.error('Error uploading event banner:', error);
    return NextResponse.json(
      { error: 'Failed to upload banner', details: String(error) },
      { status: 500 }
    );
  }
}
