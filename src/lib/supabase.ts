import { createClient } from '@supabase/supabase-js';
import { User, Project, Task, ProjectMember, TaskLabel, CreateTaskInput, UpdateTaskInput } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============ Auth Functions ============

export async function signUp(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

// ============ User Functions ============

export async function getUserProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
  return data;
}

export async function updateUserProfile(userId: string, updates: Partial<User>) {
  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ Project Functions ============

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getProject(projectId: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    console.error('Error fetching project:', error);
    return null;
  }
  return data;
}

export async function createProject(project: Omit<Project, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProject(projectId: string, updates: Partial<Project>) {
  const { data, error } = await supabase
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProject(projectId: string) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) throw error;
}

// ============ Project Members Functions ============

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select(`
      *,
      user:users(*)
    `)
    .eq('project_id', projectId);

  if (error) throw error;
  return data || [];
}

export async function addProjectMember(projectId: string, userId: string, role: 'admin' | 'member') {
  const { data, error } = await supabase
    .from('project_members')
    .insert({ project_id: projectId, user_id: userId, role })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProjectMemberRole(memberId: string, role: 'admin' | 'member') {
  const { data, error } = await supabase
    .from('project_members')
    .update({ role })
    .eq('id', memberId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeProjectMember(memberId: string) {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('id', memberId);

  if (error) throw error;
}

// ============ Task Functions ============

export async function getTasks(projectId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getTask(taskId: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error) {
    console.error('Error fetching task:', error);
    return null;
  }

  return data;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const { labels, ...taskData } = input;

  console.log('[createTask] Creating task with data:', taskData);

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...taskData,
      status: input.status || 'todo',
      priority: input.priority || 0,
    })
    .select()
    .single();

  console.log('[createTask] Result:', { data, error });

  if (error) throw error;

  return data;
}

export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
  const { labels, ...taskData } = input;

  console.log('[updateTask] Updating task:', taskId, 'with data:', taskData);

  const { data, error } = await supabase
    .from('tasks')
    .update({ ...taskData, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .single();

  console.log('[updateTask] Result:', { data, error });

  if (error) throw error;

  // Update labels if provided
  if (labels !== undefined) {
    // Remove existing labels
    await supabase.from('task_labels').delete().eq('task_id', taskId);

    // Add new labels
    if (labels.length > 0) {
      await supabase
        .from('task_labels')
        .insert(labels.map(labelId => ({ task_id: taskId, label_id: labelId })));
    }
  }

  return data;
}

export async function deleteTask(taskId: string) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw error;
}

export async function updateTaskPosition(taskId: string, newStatus: string, newPosition: number) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: newStatus,
      position: newPosition,
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ Label Functions ============

export async function getLabels(projectId: string): Promise<TaskLabel[]> {
  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('project_id', projectId)
    .order('name');

  if (error) throw error;
  return data || [];
}

export async function createLabel(projectId: string, name: string, color: string): Promise<TaskLabel> {
  const { data, error } = await supabase
    .from('labels')
    .insert({ project_id: projectId, name, color })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteLabel(labelId: string) {
  const { error } = await supabase
    .from('labels')
    .delete()
    .eq('id', labelId);

  if (error) throw error;
}

// ============ Google Calendar Sync ============

export async function linkGoogleCalendarEvent(taskId: string, eventId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      google_calendar_event_id: eventId,
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function unlinkGoogleCalendarEvent(taskId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      google_calendar_event_id: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get Google Calendar connection status
export async function getGoogleCalendarStatus() {
  const session = await getSession();
  if (!session) return { connected: false };

  const response = await fetch('/api/calendar/status', {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    return { connected: false };
  }

  return response.json();
}

// Connect to Google Calendar (get auth URL)
export async function connectGoogleCalendar(): Promise<string | null> {
  const session = await getSession();
  if (!session) {
    console.error('[connectGoogleCalendar] No session found');
    return null;
  }

  console.log('[connectGoogleCalendar] Fetching auth URL...');

  const response = await fetch('/api/auth/google', {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[connectGoogleCalendar] API error:', response.status, errorText);
    return null;
  }

  const data = await response.json();
  console.log('[connectGoogleCalendar] Got auth URL:', data.url);
  return data.url;
}

// Disconnect Google Calendar
export async function disconnectGoogleCalendar(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  const response = await fetch('/api/calendar/status', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  return response.ok;
}

// Sync task to Google Calendar
export async function syncTaskToCalendar(taskId: string, action: 'sync' | 'delete' = 'sync'): Promise<{
  success: boolean;
  action?: string;
  eventId?: string;
  needsAuth?: boolean;
  error?: string;
}> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Not authenticated' };
  }

  const response = await fetch('/api/calendar/sync', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskId, action }),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      success: false,
      needsAuth: data.needsAuth,
      error: data.error,
    };
  }

  return data;
}

// Remove sync from task
export async function unsyncTaskFromCalendar(taskId: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  const response = await fetch(`/api/calendar/sync?taskId=${taskId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  return response.ok;
}
