import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCalendarClient,
  updateCalendarEvent,
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

// PATCH /api/tasks/[taskId] - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
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

    const { taskId } = params;
    const updates = await request.json();

    // Update task in database
    const { data: task, error: updateError } = await supabaseAdmin
      .from('tasks')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating task:', updateError);
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }

    // If task is synced with Google Calendar, update the event too
    if (task.google_calendar_event_id) {
      const tokens = await getValidTokens(user.id);
      if (tokens) {
        try {
          const calendar = createCalendarClient(tokens.access_token, tokens.refresh_token);
          await updateCalendarEvent(calendar, task.google_calendar_event_id, {
            id: task.id,
            title: task.title,
            description: task.description,
            dueDate: task.due_date,
            status: task.status,
            priority: task.priority,
          });
        } catch (err) {
          console.error('Error updating calendar event:', err);
          // Don't fail the request if calendar update fails
        }
      }
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Error in PATCH /api/tasks/[taskId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/tasks/[taskId] - Get a task
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
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

    const { taskId } = params;

    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Error in GET /api/tasks/[taskId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
