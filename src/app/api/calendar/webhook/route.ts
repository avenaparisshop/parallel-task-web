import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCalendarClient,
  getCalendarEvent,
  refreshAccessToken,
} from '@/lib/google-calendar';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST /api/calendar/webhook - Handle Google Calendar push notifications
export async function POST(request: NextRequest) {
  try {
    // Google sends these headers for push notifications
    const channelId = request.headers.get('x-goog-channel-id');
    const resourceState = request.headers.get('x-goog-resource-state');
    const resourceId = request.headers.get('x-goog-resource-id');

    console.log('Webhook received:', { channelId, resourceState, resourceId });

    // For sync state, just acknowledge
    if (resourceState === 'sync') {
      return NextResponse.json({ received: true });
    }

    // For exists state, we need to check what changed
    if (resourceState === 'exists' && channelId) {
      // Get the user associated with this channel
      const { data: watchData } = await supabaseAdmin
        .from('calendar_watches')
        .select('user_id')
        .eq('channel_id', channelId)
        .single();

      if (watchData) {
        // Queue a sync check for this user
        await supabaseAdmin.from('calendar_sync_queue').insert({
          user_id: watchData.user_id,
          action: 'check_updates',
          created_at: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ received: true });
  }
}

// GET /api/calendar/webhook - Endpoint for manual sync check
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'Webhook endpoint active' });
}
