import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google-calendar';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET /api/auth/google - Redirect to Google OAuth
export async function GET(request: NextRequest) {
  console.log('[/api/auth/google] Request received');

  try {
    // Get user from authorization header
    const authHeader = request.headers.get('authorization');
    console.log('[/api/auth/google] Auth header present:', !!authHeader);

    if (!authHeader) {
      console.log('[/api/auth/google] No auth header, returning 401');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('[/api/auth/google] Auth error or no user:', error);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[/api/auth/google] User authenticated:', user.id);

    // Generate auth URL with user ID as state
    const authUrl = getAuthUrl(user.id);
    console.log('[/api/auth/google] Generated auth URL:', authUrl);

    return NextResponse.json({ url: authUrl });
  } catch (error) {
    console.error('[/api/auth/google] Error generating auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}
