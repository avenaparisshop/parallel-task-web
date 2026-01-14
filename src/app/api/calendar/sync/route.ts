import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCalendarClient,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  refreshAccessToken,
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

  // Check if token is expired
  const expiresAt = new Date(tokens.expires_at);
  const now = new Date();

  if (expiresAt <= now) {
    // Refresh the token
    try {
      const newTokens = await refreshAccessToken(tokens.refresh_token);

      // Update tokens in database
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

// POST /api/calendar/sync - Sync a task to Google Calendar
export async function POST(request: NextRequest) {
  try {
    console.log('[Calendar Sync] Starting sync request');

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      console.log('[Calendar Sync] No auth header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log('[Calendar Sync] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Calendar Sync] User authenticated:', user.id);

    const body = await request.json();
    const { taskId, action } = body;

    console.log('[Calendar Sync] Task ID:', taskId, 'Action:', action);

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    // Get valid tokens
    const tokens = await getValidTokens(user.id);
    if (!tokens) {
      console.log('[Calendar Sync] No valid tokens found for user');
      return NextResponse.json(
        { error: 'Google Calendar not connected', needsAuth: true },
        { status: 401 }
      );
    }

    console.log('[Calendar Sync] Got valid Google tokens');

    // Get task data (use admin client to bypass RLS)
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    console.log('[Calendar Sync] Task fetch result:', { task: task?.title, error: taskError });

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Create calendar client
    const calendar = createCalendarClient(tokens.access_token, tokens.refresh_token);

    let eventId = task.google_calendar_event_id;

    // Handle different actions
    if (action === 'delete' && eventId) {
      // Delete event from calendar
      await deleteCalendarEvent(calendar, eventId);

      // Remove event ID from task
      await supabaseAdmin
        .from('tasks')
        .update({
          google_calendar_event_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      // Log action
      await supabaseAdmin.from('calendar_sync_log').insert({
        user_id: user.id,
        task_id: taskId,
        event_id: eventId,
        action: 'delete',
        status: 'success',
      });

      return NextResponse.json({ success: true, action: 'deleted' });
    }

    const taskEvent = {
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.due_date,
      dueTime: task.due_time,
      duration: task.duration,
      status: task.status,
      priority: task.priority,
    };

    if (eventId) {
      // Update existing event
      console.log('[Calendar Sync] Updating existing event:', eventId);
      await updateCalendarEvent(calendar, eventId, taskEvent);

      // Log action
      await supabaseAdmin.from('calendar_sync_log').insert({
        user_id: user.id,
        task_id: taskId,
        event_id: eventId,
        action: 'update',
        status: 'success',
      });

      console.log('[Calendar Sync] Event updated successfully');
      return NextResponse.json({ success: true, action: 'updated', eventId });
    } else {
      // Create new event
      console.log('[Calendar Sync] Creating new calendar event');
      eventId = await createCalendarEvent(calendar, taskEvent);
      console.log('[Calendar Sync] Event created with ID:', eventId);

      // Update task with event ID
      await supabaseAdmin
        .from('tasks')
        .update({
          google_calendar_event_id: eventId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      // Log action
      await supabaseAdmin.from('calendar_sync_log').insert({
        user_id: user.id,
        task_id: taskId,
        event_id: eventId,
        action: 'create',
        status: 'success',
      });

      console.log('[Calendar Sync] Sync completed successfully');
      return NextResponse.json({ success: true, action: 'created', eventId });
    }
  } catch (error) {
    console.error('[Calendar Sync] Error syncing to calendar:', error);
    return NextResponse.json(
      { error: 'Failed to sync to calendar', details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/calendar/sync - Remove sync from a task
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    // Get task
    const { data: task } = await supabase
      .from('tasks')
      .select('google_calendar_event_id')
      .eq('id', taskId)
      .single();

    if (task?.google_calendar_event_id) {
      // Get tokens and delete event
      const tokens = await getValidTokens(user.id);
      if (tokens) {
        const calendar = createCalendarClient(tokens.access_token, tokens.refresh_token);
        try {
          await deleteCalendarEvent(calendar, task.google_calendar_event_id);
        } catch (e) {
          // Event might already be deleted
          console.log('Event already deleted or not found');
        }
      }
    }

    // Remove event ID from task
    await supabaseAdmin
      .from('tasks')
      .update({
        google_calendar_event_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing sync:', error);
    return NextResponse.json(
      { error: 'Failed to remove sync' },
      { status: 500 }
    );
  }
}
