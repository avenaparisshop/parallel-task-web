// Task status types
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';

// Priority levels: 0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent
export type TaskPriority = 0 | 1 | 2 | 3 | 4;

// User roles
export type UserRole = 'owner' | 'admin' | 'member';

// User type
export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at?: string;
}

// Project type
export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  created_by: string;
  created_at: string;
  updated_at?: string;
}

// Project member type
export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: UserRole;
  user?: User;
  created_at: string;
}

// Task label type
export interface TaskLabel {
  id: string;
  name: string;
  color: string;
  project_id: string;
  created_at: string;
}

// Subtask type - has same properties as a task but belongs to a parent task
export interface Subtask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  task_id: string;
  assigned_to?: string;
  assignee?: User;
  due_date?: string;
  due_time?: string;
  duration?: number;
  position: number;
  created_at: string;
  updated_at?: string;
}

// Task type
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  project_id: string;
  assigned_to?: string;
  assignee?: User;
  created_by: string;
  creator?: User;
  labels?: TaskLabel[];
  subtasks?: Subtask[];
  due_date?: string;
  due_time?: string; // Format: "HH:mm"
  duration?: number; // Duration in minutes
  google_calendar_event_id?: string;
  position?: number;
  created_at: string;
  updated_at?: string;
}

// Status labels with colors
export const STATUS_LABELS: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  backlog: { label: 'Backlog', color: '#6B6B6B', bgColor: 'rgba(107, 107, 107, 0.15)' },
  todo: { label: 'Todo', color: '#A0A0A0', bgColor: 'rgba(160, 160, 160, 0.15)' },
  in_progress: { label: 'In Progress', color: '#5E5CE6', bgColor: 'rgba(94, 92, 230, 0.15)' },
  done: { label: 'Done', color: '#34D399', bgColor: 'rgba(52, 211, 153, 0.15)' },
  cancelled: { label: 'Cancelled', color: '#EF4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
};

// Priority labels with icons and colors
export const PRIORITY_LABELS: Record<TaskPriority, { label: string; color: string; icon: string }> = {
  0: { label: 'No priority', color: '#6B6B6B', icon: 'minus' },
  1: { label: 'Low', color: '#A0A0A0', icon: 'signal-low' },
  2: { label: 'Medium', color: '#FBBF24', icon: 'signal-medium' },
  3: { label: 'High', color: '#F97316', icon: 'signal-high' },
  4: { label: 'Urgent', color: '#EF4444', icon: 'alert-circle' },
};

// Role labels
export const ROLE_LABELS: Record<UserRole, { label: string; description: string }> = {
  owner: { label: 'Owner', description: 'Full access, can delete project' },
  admin: { label: 'Admin', description: 'Can manage members and settings' },
  member: { label: 'Member', description: 'Can create and edit tasks' },
};

// Status order for kanban board
export const STATUS_ORDER: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];

// Create task input type
export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  project_id: string;
  assigned_to?: string;
  created_by: string;
  due_date?: string;
  due_time?: string;
  duration?: number;
  labels?: string[];
}

// Update task input type
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  duration?: number | null;
  labels?: string[];
}
