/**
 * Profile picture ("piece") upload
 *
 * POST /api/user/piece - uploads an image to Vercel Blob and returns its URL.
 * Any authenticated user can upload their own piece.
 */

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAuth } from '@/lib/apiGuards';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
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
      return NextResponse.json({ error: 'Piece must be 5MB or smaller' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const key = `pieces/${crypto.randomUUID()}.${ext}`;

    const blob = await put(key, file, { access: 'public', contentType: file.type });

    return NextResponse.json({ success: true, url: blob.url });
  } catch (error) {
    console.error('Error uploading piece:', error);
    return NextResponse.json(
      { error: 'Failed to upload piece', details: String(error) },
      { status: 500 }
    );
  }
}
