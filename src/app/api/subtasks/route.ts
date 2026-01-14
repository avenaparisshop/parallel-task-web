import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET /api/subtasks?task_id=xxx - Get subtasks for a task
// GET /api/subtasks?project_id=xxx - Get all subtasks for all tasks in a project
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const taskId = request.nextUrl.searchParams.get('task_id');
    const projectId = request.nextUrl.searchParams.get('project_id');

    if (!taskId && !projectId) {
      return NextResponse.json({ error: 'task_id or project_id is required' }, { status: 400 });
    }

    if (taskId) {
      // Fetch subtasks for a specific task
      const { data: subtasks, error } = await supabaseAdmin
        .from('subtasks')
        .select('*')
        .eq('task_id', taskId)
        .order('position', { ascending: true });

      if (error) {
        throw error;
      }

      return NextResponse.json(subtasks || []);
    } else {
      // Fetch all subtasks for all tasks in a project
      // First get all task IDs for this project
      const { data: tasks, error: tasksError } = await supabaseAdmin
        .from('tasks')
        .select('id')
        .eq('project_id', projectId);

      if (tasksError) {
        throw tasksError;
      }

      if (!tasks || tasks.length === 0) {
        return NextResponse.json([]);
      }

      const taskIds = tasks.map(t => t.id);

      const { data: subtasks, error } = await supabaseAdmin
        .from('subtasks')
        .select('*')
        .in('task_id', taskIds)
        .order('position', { ascending: true });

      if (error) {
        throw error;
      }

      return NextResponse.json(subtasks || []);
    }
  } catch (error) {
    console.error('Error fetching subtasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subtasks' },
      { status: 500 }
    );
  }
}

// POST /api/subtasks - Create a new subtask
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { task_id, title, description, status, priority, assigned_to, due_date, due_time, duration } = body;

    if (!task_id || !title) {
      return NextResponse.json({ error: 'task_id and title are required' }, { status: 400 });
    }

    // Get the max position for this task
    const { data: maxPosResult } = await supabaseAdmin
      .from('subtasks')
      .select('position')
      .eq('task_id', task_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const nextPosition = (maxPosResult?.position ?? -1) + 1;

    const { data: subtask, error } = await supabaseAdmin
      .from('subtasks')
      .insert({
        task_id,
        title,
        description: description || null,
        status: status || 'todo',
        priority: priority ?? 0,
        assigned_to: assigned_to || null,
        due_date: due_date || null,
        due_time: due_time || null,
        duration: duration || null,
        position: nextPosition,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(subtask);
  } catch (error) {
    console.error('Error creating subtask:', error);
    return NextResponse.json(
      { error: 'Failed to create subtask' },
      { status: 500 }
    );
  }
}

// PATCH /api/subtasks - Update a subtask
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, description, status, priority, assigned_to, due_date, due_time, duration, position } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to || null;
    if (due_date !== undefined) updates.due_date = due_date || null;
    if (due_time !== undefined) updates.due_time = due_time || null;
    if (duration !== undefined) updates.duration = duration || null;
    if (position !== undefined) updates.position = position;

    const { data: subtask, error } = await supabaseAdmin
      .from('subtasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(subtask);
  } catch (error) {
    console.error('Error updating subtask:', error);
    return NextResponse.json(
      { error: 'Failed to update subtask' },
      { status: 500 }
    );
  }
}

// DELETE /api/subtasks?id=xxx - Delete a subtask
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('subtasks')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting subtask:', error);
    return NextResponse.json(
      { error: 'Failed to delete subtask' },
      { status: 500 }
    );
  }
}
