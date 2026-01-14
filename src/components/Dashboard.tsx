'use client';

import { useState, useEffect, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import {
  signOut,
  getProjects,
  getTasks,
  createProject,
  updateProject,
  deleteProject,
  createTask,
  updateTask,
  deleteTask,
  getProjectMembers,
  getSession,
} from '@/lib/supabase';
import { Task, Project, ProjectMember, STATUS_ORDER, STATUS_LABELS, TaskStatus, Subtask } from '@/types';
import TaskDetailModal from './TaskDetailModal';
import CalendarView from './CalendarView';
import {
  Plus,
  Search,
  LogOut,
  ChevronDown,
  ChevronRight,
  Calendar,
  Inbox,
  Settings,
  Loader2,
  Circle,
  CheckCircle2,
  Clock,
  XCircle,
  Filter,
  LayoutGrid,
  Star,
  MoreHorizontal,
  User as UserIcon,
  CalendarDays,
  Flag,
  Sun,
  Moon,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface DashboardProps {
  user: User;
}

type ViewMode = 'active' | 'backlog' | 'calendar';

// Status icons like Linear
const statusIcons: Record<TaskStatus, React.ReactNode> = {
  backlog: <Circle className="w-[18px] h-[18px] text-[#6B6B6B]" strokeWidth={1.5} />,
  todo: <Circle className="w-[18px] h-[18px] text-[#6B6B6B]" strokeWidth={1.5} />,
  in_progress: <Clock className="w-[18px] h-[18px] text-[#F59E0B]" strokeWidth={1.5} />,
  done: <CheckCircle2 className="w-[18px] h-[18px] text-[#5E5CE6]" strokeWidth={1.5} />,
  cancelled: <XCircle className="w-[18px] h-[18px] text-[#6B6B6B]" strokeWidth={1.5} />,
};

// Priority icons like Linear
const priorityIcons: Record<number, { icon: React.ReactNode; label: string }> = {
  0: { icon: <Flag className="w-4 h-4 text-[#6B6B6B]" strokeWidth={1.5} />, label: 'No priority' },
  1: { icon: <Flag className="w-4 h-4 text-[#6B6B6B]" strokeWidth={1.5} />, label: 'Low' },
  2: { icon: <Flag className="w-4 h-4 text-[#FBBF24]" strokeWidth={1.5} />, label: 'Medium' },
  3: { icon: <Flag className="w-4 h-4 text-[#F97316]" strokeWidth={1.5} />, label: 'High' },
  4: { icon: <Flag className="w-4 h-4 text-[#EF4444]" strokeWidth={1.5} />, label: 'Urgent' },
};

// Task row component like Linear
function TaskRow({
  task,
  taskId,
  onClick,
  onStatusChange,
  isSelected,
  onSelect,
}: {
  task: Task;
  taskId: string;
  onClick: () => void;
  onStatusChange: (status: TaskStatus) => void;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
}) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diff = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return { text: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), color: '#EF4444' };
    if (diff === 0) return { text: 'Today', color: '#F97316' };
    if (diff === 1) return { text: 'Tomorrow', color: '#FBBF24' };
    if (diff < 7) return { text: date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }), color: theme === 'dark' ? '#A0A0A0' : '#666666' };
    return { text: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), color: colors.textTertiary };
  };

  const dueDate = formatDate(task.due_date);

  return (
    <div
      className={`group flex items-center h-[44px] px-2 cursor-pointer transition-colors`}
      style={{
        borderBottom: `1px solid ${colors.borderLight}`,
        backgroundColor: isSelected ? (theme === 'dark' ? 'rgba(94, 92, 230, 0.15)' : 'rgba(94, 92, 230, 0.08)') : 'transparent',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        setIsHovered(true);
        if (!isSelected) e.currentTarget.style.backgroundColor = colors.bgActive;
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {/* Selection checkbox */}
      <div
        className={`w-5 h-5 mr-2 flex items-center justify-center rounded border transition-all cursor-pointer ${
          isSelected
            ? 'bg-[#5E5CE6] border-[#5E5CE6]'
            : isHovered
            ? theme === 'dark' ? 'border-[#555] hover:border-[#5E5CE6]' : 'border-gray-300 hover:border-[#5E5CE6]'
            : 'border-transparent'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(e);
        }}
        style={{ opacity: isSelected || isHovered ? 1 : 0 }}
      >
        {isSelected && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Priority indicator */}
      <div className="w-1 h-5 rounded-full mr-3" style={{
        backgroundColor: task.priority === 4 ? '#EF4444' : task.priority === 3 ? '#F97316' : task.priority === 2 ? '#FBBF24' : 'transparent'
      }} />

      {/* Status button */}
      <div className="relative mr-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className="rounded p-0.5 transition-colors"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {statusIcons[task.status]}
        </button>
        {showStatusMenu && (
          <div
            className="absolute left-0 top-full mt-1 rounded-lg shadow-xl z-50 py-1 min-w-[160px]"
            style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
          >
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                onClick={() => {
                  onStatusChange(status);
                  setShowStatusMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {statusIcons[status]}
                <span style={{ color: colors.text }}>{STATUS_LABELS[status].label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Task ID */}
      <span className="text-xs w-[70px] shrink-0 font-mono" style={{ color: colors.textMuted }}>
        {taskId}
      </span>

      {/* Title */}
      <span className="flex-1 text-sm truncate mr-4" style={{ color: colors.text }}>
        {task.title}
      </span>

      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex gap-1 mr-4">
          {task.labels.slice(0, 2).map((label) => (
            <span
              key={label.id}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Priority */}
      <div className="w-6 h-6 flex items-center justify-center mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {priorityIcons[task.priority]?.icon}
      </div>

      {/* Assignee */}
      {task.assignee ? (
        <div className="flex items-center gap-1 mr-4">
          <div className="w-5 h-5 rounded-full bg-[#5E5CE6]/20 flex items-center justify-center">
            <span className="text-[10px] font-medium text-[#5E5CE6]">
              {task.assignee.email?.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      ) : (
        <div className="w-5 h-5 mr-4" />
      )}

      {/* Due date */}
      {dueDate ? (
        <div className="flex items-center gap-1 text-xs min-w-[80px] justify-end" style={{ color: dueDate.color }}>
          <CalendarDays className="w-3.5 h-3.5" />
          <span>{dueDate.text}</span>
        </div>
      ) : (
        <div className="min-w-[80px]" />
      )}
    </div>
  );
}

// Status group header like Linear
function StatusGroup({
  status,
  count,
  children,
  defaultExpanded = true
}: {
  status: TaskStatus;
  count: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-4 py-2 w-full transition-colors"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <ChevronRight
          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
          style={{ color: colors.textTertiary }}
        />
        {statusIcons[status]}
        <span className="text-sm font-medium" style={{ color: colors.text }}>{STATUS_LABELS[status].label}</span>
        <span className="text-xs ml-1" style={{ color: colors.textTertiary }}>{count}</span>
      </button>
      {expanded && children}
    </div>
  );
}

// Theme colors
const themeColors = {
  dark: {
    bg: '#131313',
    bgHover: '#1C1C1C',
    bgActive: '#1E1E1E',
    surface: '#1C1C1C',
    border: '#2A2A2A',
    borderLight: '#252525',
    text: '#F0F0F0',
    textSecondary: '#A0A0A0',
    textTertiary: '#6B6B6B',
    textMuted: '#808080',
  },
  light: {
    bg: '#FFFFFF',
    bgHover: '#F5F5F5',
    bgActive: '#EEEEEE',
    surface: '#FAFAFA',
    border: '#E0E0E0',
    borderLight: '#EBEBEB',
    text: '#1A1A1A',
    textSecondary: '#666666',
    textTertiary: '#999999',
    textMuted: '#888888',
  },
};

export default function Dashboard({ user }: DashboardProps) {
  const { theme, toggleTheme } = useTheme();
  const colors = themeColors[theme];

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allSubtasks, setAllSubtasks] = useState<Subtask[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [taskCounter, setTaskCounter] = useState(1);

  // Project management states
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);

  // Multi-select states
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [lastSelectedTaskId, setLastSelectedTaskId] = useState<string | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // Fetch tasks when project changes
  useEffect(() => {
    if (selectedProject) {
      fetchTasks();
      fetchMembers();
      fetchAllSubtasks();
    }
  }, [selectedProject]);

  // Update task counter when tasks change
  useEffect(() => {
    if (tasks.length > 0) {
      setTaskCounter(tasks.length + 1);
    }
  }, [tasks]);

  const fetchProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data);
      if (data.length > 0 && !selectedProject) {
        setSelectedProject(data[0]);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    if (!selectedProject) return;
    try {
      const data = await getTasks(selectedProject.id);
      setTasks(data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchMembers = async () => {
    if (!selectedProject) return;
    try {
      const data = await getProjectMembers(selectedProject.id);
      setMembers(data);
    } catch (error: any) {
      // Table might not exist yet, silently ignore
      if (error?.code === 'PGRST205') {
        console.log('project_members table does not exist, skipping...');
        setMembers([]);
      } else {
        console.error('Error fetching members:', error);
      }
    }
  };

  const fetchAllSubtasks = async () => {
    if (!selectedProject) return;
    try {
      const session = await getSession();
      if (!session) return;

      // Fetch subtasks for all tasks in the current project
      const response = await fetch(`/api/subtasks?project_id=${selectedProject.id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAllSubtasks(data);
      }
    } catch (error) {
      console.error('Error fetching subtasks:', error);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const project = await createProject({
        name: newProjectName,
        created_by: user.id,
      });
      setProjects([project, ...projects]);
      setSelectedProject(project);
      setNewProjectName('');
      setCreatingProject(false);
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleUpdateProject = async (projectId: string) => {
    if (!editProjectName.trim()) return;
    try {
      console.log('[handleUpdateProject] Updating project:', projectId, 'with name:', editProjectName.trim());
      const updated = await updateProject(projectId, { name: editProjectName.trim() });
      console.log('[handleUpdateProject] Updated result:', updated);
      setProjects(projects.map((p) => (p.id === projectId ? { ...p, ...updated } : p)));
      if (selectedProject?.id === projectId) {
        setSelectedProject({ ...selectedProject, ...updated });
      }
      setEditingProjectId(null);
      setEditProjectName('');
      setShowProjectDropdown(false);
    } catch (error: any) {
      console.error('[handleUpdateProject] Error:', error);
      alert(`Failed to update project: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteConfirmProject) return;
    setDeletingProject(true);
    try {
      console.log('[handleDeleteProject] Deleting project:', deleteConfirmProject.id);
      await deleteProject(deleteConfirmProject.id);
      console.log('[handleDeleteProject] Project deleted successfully');
      const updatedProjects = projects.filter((p) => p.id !== deleteConfirmProject.id);
      setProjects(updatedProjects);
      if (selectedProject?.id === deleteConfirmProject.id) {
        setSelectedProject(updatedProjects[0] || null);
      }
      setDeleteConfirmProject(null);
    } catch (error: any) {
      console.error('[handleDeleteProject] Error:', error);
      alert(`Failed to delete project: ${error.message || 'Unknown error'}`);
    } finally {
      setDeletingProject(false);
    }
  };

  const startEditingProject = (project: Project) => {
    setEditingProjectId(project.id);
    setEditProjectName(project.name);
    setProjectMenuId(null);
  };

  const handleUpdateTask = async (taskId: string, updates: any) => {
    try {
      const updated = await updateTask(taskId, updates);
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
      setSelectedTask(null);

      // Sync to Google Calendar if task has a due date
      if (updated.due_date) {
        try {
          const session = await getSession();
          if (session) {
            await fetch('/api/calendar/sync', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ taskId }),
            });
          }
        } catch (syncError) {
          console.log('Calendar sync skipped:', syncError);
        }
      }
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    try {
      await updateTask(taskId, { status });
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status } : t)));
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      setTasks(tasks.filter((t) => t.id !== taskId));
      setSelectedTask(null);
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(`/api/subtasks?id=${subtaskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        setAllSubtasks(allSubtasks.filter((s) => s.id !== subtaskId));
      }
    } catch (error) {
      console.error('Error deleting subtask:', error);
    }
  };

  const handleSubtaskStatusChange = async (subtaskId: string, status: string) => {
    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch('/api/subtasks', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: subtaskId, status }),
      });

      if (response.ok) {
        const updated = await response.json();
        setAllSubtasks(allSubtasks.map((s) => s.id === subtaskId ? { ...s, ...updated } : s));
      }
    } catch (error) {
      console.error('Error updating subtask status:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Get all visible tasks in order (for shift+click range selection)
  const getAllVisibleTasks = (): Task[] => {
    const { in_progress, todo, done } = tasksByStatus;
    if (viewMode === 'active') {
      return [...in_progress, ...todo];
    } else if (viewMode === 'backlog') {
      return tasks.filter(t => t.status === 'backlog');
    }
    return [...in_progress, ...todo, ...done];
  };

  // Handle task selection (single click)
  const handleTaskSelect = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const allVisibleTasks = getAllVisibleTasks();

    if (e.shiftKey && lastSelectedTaskId) {
      // Shift+click: select range
      const lastIndex = allVisibleTasks.findIndex(t => t.id === lastSelectedTaskId);
      const currentIndex = allVisibleTasks.findIndex(t => t.id === task.id);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = allVisibleTasks.slice(start, end + 1).map(t => t.id);

        setSelectedTaskIds(new Set([...Array.from(selectedTaskIds), ...rangeIds]));
      }
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle selection
      const newSelected = new Set(selectedTaskIds);
      if (newSelected.has(task.id)) {
        newSelected.delete(task.id);
      } else {
        newSelected.add(task.id);
      }
      setSelectedTaskIds(newSelected);
      setLastSelectedTaskId(task.id);
    } else {
      // Normal click: select only this task
      setSelectedTaskIds(new Set([task.id]));
      setLastSelectedTaskId(task.id);
    }
  };

  // Handle delete selected tasks
  const handleDeleteSelected = async () => {
    if (selectedTaskIds.size === 0) return;

    try {
      for (const taskId of Array.from(selectedTaskIds)) {
        await deleteTask(taskId);
      }
      setTasks(tasks.filter(t => !selectedTaskIds.has(t.id)));
      setSelectedTaskIds(new Set());
      setLastSelectedTaskId(null);
    } catch (error) {
      console.error('Error deleting tasks:', error);
    }
  };

  // Clear selection when clicking outside
  const handleClearSelection = () => {
    if (selectedTaskIds.size > 0) {
      setSelectedTaskIds(new Set());
      setLastSelectedTaskId(null);
    }
  };

  // Create a new task quickly and open TaskDetailModal
  const handleQuickCreateTask = async () => {
    if (!selectedProject) return;
    try {
      const task = await createTask({
        title: 'New Task',
        status: 'todo',
        priority: 0,
        project_id: selectedProject.id,
        created_by: user.id,
      });
      setTasks([...tasks, task]);
      setSelectedTask(task);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  // Keyboard shortcuts for selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Delete/Backspace: delete selected tasks
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTaskIds.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
      }

      // Escape: clear selection
      if (e.key === 'Escape') {
        handleClearSelection();
      }

      // Cmd+A: select all visible tasks
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && viewMode !== 'calendar') {
        e.preventDefault();
        const allVisibleTasks = getAllVisibleTasks();
        setSelectedTaskIds(new Set(allVisibleTasks.map(t => t.id)));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskIds, tasks, viewMode]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter((task) =>
      task.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (viewMode === 'active') {
      filtered = filtered.filter(t => t.status !== 'backlog' && t.status !== 'cancelled');
    } else if (viewMode === 'backlog') {
      filtered = filtered.filter(t => t.status === 'backlog');
    }

    return filtered;
  }, [tasks, searchQuery, viewMode]);

  const tasksByStatus = useMemo(() => {
    return STATUS_ORDER.reduce((acc, status) => {
      acc[status] = filteredTasks.filter((task) => task.status === status);
      return acc;
    }, {} as Record<TaskStatus, Task[]>);
  }, [filteredTasks]);

  // Generate task ID prefix from project name
  const getTaskIdPrefix = () => {
    if (!selectedProject) return 'TSK';
    return selectedProject.name.substring(0, 3).toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <Loader2 className="w-8 h-8 text-[#5E5CE6] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: colors.bg }}>
      {/* Sidebar - Linear style */}
      <aside className="w-[220px] flex flex-col" style={{ backgroundColor: colors.bg, borderRight: `1px solid ${colors.border}` }}>
        {/* Theme Toggle */}
        <div className="px-3 pt-3 pb-1">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors"
            style={{ backgroundColor: colors.bgHover }}
          >
            <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
              {theme === 'dark' ? 'Dark' : 'Light'} mode
            </span>
            <div className="flex items-center gap-1">
              {theme === 'dark' ? (
                <Moon className="w-4 h-4" style={{ color: colors.textSecondary }} />
              ) : (
                <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />
              )}
            </div>
          </button>
        </div>

        {/* Workspace */}
        <div className="p-3">
          <div className="relative">
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div className="w-5 h-5 bg-[#5E5CE6] rounded flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">
                  {selectedProject?.name?.charAt(0).toUpperCase() || 'P'}
                </span>
              </div>
              <span className="text-sm font-medium flex-1 text-left truncate" style={{ color: colors.text }}>
                {selectedProject?.name || 'Select project'}
              </span>
              <ChevronDown className="w-4 h-4" style={{ color: colors.textTertiary }} />
            </button>

            {showProjectDropdown && (
              <div
                className="absolute left-0 top-full mt-1 rounded-lg shadow-xl z-50"
                style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, minWidth: '280px' }}
              >
                {projects.map((project) => (
                  <div key={project.id} className="relative group/project">
                    {editingProjectId === project.id ? (
                      <div className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editProjectName}
                            onChange={(e) => setEditProjectName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateProject(project.id);
                              if (e.key === 'Escape') {
                                setEditingProjectId(null);
                                setEditProjectName('');
                              }
                            }}
                            className="flex-1 px-2 py-1 rounded text-sm focus:outline-none"
                            style={{
                              backgroundColor: colors.bg,
                              border: `1px solid ${colors.border}`,
                              color: colors.text,
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateProject(project.id)}
                            className="px-2 py-1 text-xs text-white bg-[#5E5CE6] hover:bg-[#6E6CE8] rounded transition-colors"
                            disabled={!editProjectName.trim()}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingProjectId(null);
                              setEditProjectName('');
                            }}
                            className="px-2 py-1 text-xs rounded transition-colors"
                            style={{ color: colors.textSecondary }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            Cancel
                          </button>
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: colors.textTertiary }}>
                          Press Enter to save, Escape to cancel
                        </p>
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: selectedProject?.id === project.id ? 'rgba(94, 92, 230, 0.1)' : 'transparent',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedProject?.id === project.id ? 'rgba(94, 92, 230, 0.1)' : 'transparent'}
                        onClick={() => {
                          setSelectedProject(project);
                          setShowProjectDropdown(false);
                        }}
                      >
                        <div className="w-5 h-5 bg-[#5E5CE6] rounded flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white">
                            {project.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm flex-1" style={{ color: colors.text }}>{project.name}</span>

                        {/* Context menu button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectMenuId(projectMenuId === project.id ? null : project.id);
                          }}
                          className="opacity-0 group-hover/project:opacity-100 p-1 rounded transition-all"
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgActive}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <MoreHorizontal className="w-4 h-4" style={{ color: colors.textSecondary }} />
                        </button>
                      </div>
                    )}

                    {/* Project context menu */}
                    {projectMenuId === project.id && (
                      <div
                        className="absolute right-2 top-full mt-1 rounded-lg shadow-xl z-[60] py-1 min-w-[140px]"
                        style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => startEditingProject(project)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Pencil className="w-4 h-4" style={{ color: colors.textSecondary }} />
                          <span style={{ color: colors.text }}>Rename</span>
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmProject(project);
                            setProjectMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Trash2 className="w-4 h-4 text-[#EF4444]" />
                          <span className="text-[#EF4444]">Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${colors.border}` }}>
                  {creatingProject ? (
                    <div className="p-2">
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateProject();
                          if (e.key === 'Escape') setCreatingProject(false);
                        }}
                        placeholder="Project name"
                        className="w-full px-2 py-1.5 rounded text-sm focus:outline-none focus:border-[#5E5CE6]"
                        style={{
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          color: colors.text,
                        }}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreatingProject(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[#5E5CE6] transition-colors"
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-sm">New project</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-3 mb-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textTertiary }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md text-sm focus:outline-none focus:border-[#5E5CE6]"
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                color: colors.text,
              }}
            />
            <span
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-1 rounded"
              style={{ color: colors.textTertiary, backgroundColor: colors.bgHover }}
            >
              ⌘K
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2">
          <div className="space-y-0.5">
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Inbox className="w-4 h-4" />
              <span className="text-sm">Inbox</span>
            </button>
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Star className="w-4 h-4" />
              <span className="text-sm">My Issues</span>
            </button>
          </div>

          <div className="mt-6 mb-2 px-2">
            <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>
              Your teams
            </span>
          </div>

          <div className="space-y-0.5">
            <button
              onClick={() => setViewMode('active')}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
              style={{
                backgroundColor: viewMode === 'active' ? colors.bgHover : 'transparent',
                color: viewMode === 'active' ? colors.text : colors.textSecondary,
              }}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="text-sm">Active</span>
            </button>
            <button
              onClick={() => setViewMode('backlog')}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
              style={{
                backgroundColor: viewMode === 'backlog' ? colors.bgHover : 'transparent',
                color: viewMode === 'backlog' ? colors.text : colors.textSecondary,
              }}
            >
              <Inbox className="w-4 h-4" />
              <span className="text-sm">Backlog</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
              style={{
                backgroundColor: viewMode === 'calendar' ? colors.bgHover : 'transparent',
                color: viewMode === 'calendar' ? colors.text : colors.textSecondary,
              }}
            >
              <Calendar className="w-4 h-4" />
              <span className="text-sm">Calendar</span>
            </button>
          </div>

          {/* Favorites section */}
          <div className="mt-6 mb-2 px-2">
            <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>
              Favorites
            </span>
          </div>

          {/* Projects in sidebar */}
          <div className="space-y-0.5">
            {projects.slice(0, 4).map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProject(project)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
                style={{
                  backgroundColor: selectedProject?.id === project.id ? colors.bgHover : 'transparent',
                  color: selectedProject?.id === project.id ? colors.text : colors.textSecondary,
                }}
              >
                <Star className="w-4 h-4 text-[#FBBF24]" fill="#FBBF24" />
                <span className="text-sm truncate">{project.name}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* User */}
        <div className="p-3" style={{ borderTop: `1px solid ${colors.border}` }}>
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div className="w-6 h-6 bg-[#5E5CE6]/20 rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-[#5E5CE6]">
                  {user.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm truncate flex-1 text-left" style={{ color: colors.textSecondary }}>
                {user.email}
              </span>
            </button>

            {showUserMenu && (
              <div
                className="absolute left-0 right-0 bottom-full mb-1 rounded-lg shadow-xl z-50 overflow-hidden"
                style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
              >
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 transition-colors"
                  style={{ color: colors.textSecondary }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">Settings</span>
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[#EF4444] transition-colors"
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header - Linear style */}
        <header className="h-[52px] flex items-center px-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Circle className="w-4 h-4" />
              All issues
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
              style={{
                backgroundColor: viewMode === 'active' ? colors.bgHover : 'transparent',
                color: viewMode === 'active' ? colors.text : colors.textSecondary,
              }}
            >
              <Clock className="w-4 h-4" />
              Active
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Inbox className="w-4 h-4" />
              Backlog
            </button>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button
              className="flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Display
            </button>
            <div className="w-px h-5 mx-1" style={{ backgroundColor: colors.border }} />
            <button
              onClick={handleQuickCreateTask}
              className="flex items-center gap-1 px-2 py-1 text-sm text-white bg-[#5E5CE6] hover:bg-[#6E6CE8] rounded-md transition-colors"
              disabled={!selectedProject}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          {viewMode === 'calendar' ? (
            <CalendarView
              tasks={tasks}
              subtasks={allSubtasks}
              onTaskClick={(taskId) => {
                const task = tasks.find(t => t.id === taskId);
                if (task) setSelectedTask(task);
              }}
              onSubtaskClick={(subtaskId, taskId) => {
                // Open the parent task when a subtask is clicked
                const task = tasks.find(t => t.id === taskId);
                if (task) setSelectedTask(task);
              }}
              onTaskStatusChange={async (id, status) => {
                // Check if it's a subtask or task based on whether we find it in subtasks
                const isSubtask = allSubtasks.some(s => s.id === id);
                if (isSubtask) {
                  await handleSubtaskStatusChange(id, status);
                } else {
                  await handleStatusChange(id, status as TaskStatus);
                }
              }}
              onDeleteTask={handleDeleteTask}
              onDeleteSubtask={handleDeleteSubtask}
              onCreateTask={async (data) => {
                console.log('[Dashboard] Calendar drag create:', data);
                // Create task directly with default title, then open TaskDetailModal
                try {
                  const task = await createTask({
                    title: 'New Task',
                    status: 'todo',
                    priority: 0,
                    due_date: data.due_date,
                    due_time: data.due_time,
                    duration: data.duration,
                    project_id: selectedProject!.id,
                    created_by: user.id,
                  });
                  console.log('[Dashboard] Task created from drag:', task);
                  setTasks([...tasks, task]);
                  // Open TaskDetailModal to edit the task
                  setSelectedTask(task);
                } catch (err) {
                  console.error('[Dashboard] Error creating task from drag:', err);
                }
              }}
              onTaskMove={async (taskId, data) => {
                try {
                  const updated = await updateTask(taskId, {
                    due_date: data.due_date,
                    due_time: data.due_time,
                  });
                  setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
                } catch (err) {
                  console.error('[Dashboard] Error moving task:', err);
                }
              }}
              onSubtaskMove={async (subtaskId, data) => {
                try {
                  const session = await getSession();
                  if (!session) return;

                  const response = await fetch('/api/subtasks', {
                    method: 'PATCH',
                    headers: {
                      'Authorization': `Bearer ${session.access_token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      id: subtaskId,
                      due_date: data.due_date,
                      due_time: data.due_time,
                    }),
                  });

                  if (response.ok) {
                    const updated = await response.json();
                    setAllSubtasks(allSubtasks.map((s) => s.id === subtaskId ? { ...s, ...updated } : s));
                  }
                } catch (err) {
                  console.error('[Dashboard] Error moving subtask:', err);
                }
              }}
            />
          ) : (
            <div className="py-2" onClick={handleClearSelection}>
              {/* Selection info bar */}
              {selectedTaskIds.size > 0 && (
                <div className={`flex items-center justify-between px-4 py-2 mb-2 rounded-md ${theme === 'dark' ? 'bg-[#5E5CE6]/10' : 'bg-[#5E5CE6]/5'}`}>
                  <span className={`text-sm ${theme === 'dark' ? 'text-[#E0E0E0]' : 'text-gray-700'}`}>
                    {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? 's' : ''} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSelected();
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 text-sm text-red-500 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearSelection();
                      }}
                      className={`px-2 py-1 text-sm rounded transition-colors ${theme === 'dark' ? 'text-[#A0A0A0] hover:bg-[#333]' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* In Progress */}
              {tasksByStatus.in_progress.length > 0 && (
                <StatusGroup status="in_progress" count={tasksByStatus.in_progress.length}>
                  {tasksByStatus.in_progress.map((task, index) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      taskId={`${getTaskIdPrefix()}-${index + 1}`}
                      onClick={() => setSelectedTask(task)}
                      onStatusChange={(status) => handleStatusChange(task.id, status)}
                      isSelected={selectedTaskIds.has(task.id)}
                      onSelect={(e) => handleTaskSelect(task, e)}
                    />
                  ))}
                </StatusGroup>
              )}

              {/* Todo */}
              {tasksByStatus.todo.length > 0 && (
                <StatusGroup status="todo" count={tasksByStatus.todo.length}>
                  {tasksByStatus.todo.map((task, index) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      taskId={`${getTaskIdPrefix()}-${tasksByStatus.in_progress.length + index + 1}`}
                      onClick={() => setSelectedTask(task)}
                      onStatusChange={(status) => handleStatusChange(task.id, status)}
                      isSelected={selectedTaskIds.has(task.id)}
                      onSelect={(e) => handleTaskSelect(task, e)}
                    />
                  ))}
                </StatusGroup>
              )}

              {/* Backlog (only in backlog view) */}
              {viewMode === 'backlog' && tasksByStatus.backlog.length > 0 && (
                <StatusGroup status="backlog" count={tasksByStatus.backlog.length} defaultExpanded={true}>
                  {tasksByStatus.backlog.map((task, index) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      taskId={`${getTaskIdPrefix()}-${index + 1}`}
                      onClick={() => setSelectedTask(task)}
                      onStatusChange={(status) => handleStatusChange(task.id, status)}
                      isSelected={selectedTaskIds.has(task.id)}
                      onSelect={(e) => handleTaskSelect(task, e)}
                    />
                  ))}
                </StatusGroup>
              )}

              {/* Done */}
              {tasksByStatus.done.length > 0 && (
                <StatusGroup status="done" count={tasksByStatus.done.length} defaultExpanded={false}>
                  {tasksByStatus.done.map((task, index) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      taskId={`${getTaskIdPrefix()}-${tasksByStatus.in_progress.length + tasksByStatus.todo.length + index + 1}`}
                      onClick={() => setSelectedTask(task)}
                      onStatusChange={(status) => handleStatusChange(task.id, status)}
                      isSelected={selectedTaskIds.has(task.id)}
                      onSelect={(e) => handleTaskSelect(task, e)}
                    />
                  ))}
                </StatusGroup>
              )}

              {/* Empty state */}
              {filteredTasks.length === 0 && (
                <div className="flex flex-col items-center justify-center h-[400px] text-center">
                  <Circle className="w-12 h-12 text-[#3A3A3A] mb-4" strokeWidth={1} />
                  <h3 className="text-lg font-medium text-[#E0E0E0] mb-1">No issues</h3>
                  <p className="text-sm text-[#6B6B6B] mb-4">Create an issue to get started</p>
                  <button
                    onClick={handleQuickCreateTask}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-[#5E5CE6] hover:bg-[#6E6CE8] rounded-md transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New issue
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          members={members}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
        />
      )}

      {/* Delete Project Confirmation Modal */}
      {deleteConfirmProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setDeleteConfirmProject(null)}
        >
          <div
            className="relative w-full max-w-[400px] rounded-xl shadow-2xl overflow-hidden"
            style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
              <div className="w-10 h-10 rounded-full bg-[#EF4444]/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
              </div>
              <div>
                <h3 className="text-base font-semibold" style={{ color: colors.text }}>Delete project</h3>
                <p className="text-sm" style={{ color: colors.textSecondary }}>This action cannot be undone</p>
              </div>
            </div>

            {/* Content */}
            <div className="px-5 py-4">
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                Are you sure you want to delete <strong style={{ color: colors.text }}>{deleteConfirmProject.name}</strong>?
                All tasks in this project will be permanently deleted.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${colors.border}`, backgroundColor: colors.bg }}>
              <button
                onClick={() => setDeleteConfirmProject(null)}
                className="px-4 py-2 text-sm rounded-md transition-colors"
                style={{ color: colors.textSecondary }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                disabled={deletingProject}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                className="px-4 py-2 text-sm text-white bg-[#EF4444] hover:bg-[#DC2626] rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                disabled={deletingProject}
              >
                {deletingProject ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete project'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
