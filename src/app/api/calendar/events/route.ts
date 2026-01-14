import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCalendarClient,
  refreshAccessToken,
  listUpcomingEvents,
} from '@/lib/google-calendar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Helper to get valid tokens
async function getValidTokens(userId: string) {
  const { data: tokens, error } = await supabaseAdmin
    .from('google_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !tokens) {
    return null;
  }

  const expiresAt = new Date(tokens.expires_at);
  const now = new Date();

  if (expiresAt <= now) {
    try {
      const newTokens = await refreshAccessToken(tokens.refresh_token);
      await supabaseAdmin
        .from('google_oauth_tokens')
        .update({
          access_token: newTokens.access_token,
          expires_at: new Date(newTokens.expiry_date).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      return {
        ...tokens,
        access_token: newTokens.access_token,
      };
    } catch (error) {
      console.error('Error refreshing token:', error);
      return null;
    }
  }

  return tokens;
}

// GET /api/calendar/events - Get upcoming events from Google Calendar
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get valid tokens
    const tokens = await getValidTokens(user.id);
    if (!tokens) {
      return NextResponse.json(
        { error: 'Google Calendar not connected', needsAuth: true },
        { status: 401 }
      );
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const maxResults = parseInt(searchParams.get('maxResults') || '100');
    const timeMin = searchParams.get('timeMin') || new Date().toISOString();
    const timeMax = searchParams.get('timeMax');

    // Create calendar client
    const calendar = createCalendarClient(tokens.access_token, tokens.refresh_token);

    // Get events
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax: timeMax || undefined,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    // Get all tasks with google_calendar_event_id to map them
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, google_calendar_event_id, status')
      .not('google_calendar_event_id', 'is', null);

    const taskMap = new Map(tasks?.map(t => [t.google_calendar_event_id, t]) || []);

    // Format events
    const formattedEvents = events.map(event => ({
      id: event.id,
      title: event.summary || 'Untitled',
      description: event.description,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      allDay: !event.start?.dateTime,
      color: event.colorId,
      htmlLink: event.htmlLink,
      status: event.status,
      // Link to task if exists
      taskId: taskMap.get(event.id)?.id || null,
      taskStatus: taskMap.get(event.id)?.status || null,
      isFromApp: event.description?.includes('Synced from Parallel Task') || taskMap.has(event.id),
    }));

    return NextResponse.json({ events: formattedEvents });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
