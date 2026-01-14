'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Task, ProjectMember, TaskPriority, TaskStatus, STATUS_LABELS, PRIORITY_LABELS, STATUS_ORDER, Subtask } from '@/types';
import {
  X,
  Loader2,
  User,
  Calendar,
  Trash2,
  Clock,
  CheckCircle2,
  Circle,
  XCircle,
  RefreshCw,
  Unlink,
  ExternalLink,
  Flag,
  ChevronDown,
  ChevronLeft,
  Copy,
  Link2,
  Plus,
  GripVertical,
  MoreHorizontal,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  getGoogleCalendarStatus,
  connectGoogleCalendar,
  syncTaskToCalendar,
  unsyncTaskFromCalendar,
  getSession,
} from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';

interface TaskDetailModalProps {
  task: Task;
  members: ProjectMember[];
  onClose: () => void;
  onUpdate: (taskId: string, updates: any) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}

// Status icons like Linear
const statusIcons: Record<TaskStatus, React.ReactNode> = {
  backlog: <Circle className="w-4 h-4 text-[#6B6B6B]" strokeWidth={1.5} />,
  todo: <Circle className="w-4 h-4 text-[#6B6B6B]" strokeWidth={1.5} />,
  in_progress: <Clock className="w-4 h-4 text-[#F59E0B]" strokeWidth={1.5} />,
  done: <CheckCircle2 className="w-4 h-4 text-[#5E5CE6]" strokeWidth={1.5} />,
  cancelled: <XCircle className="w-4 h-4 text-[#6B6B6B]" strokeWidth={1.5} />,
};

// Priority config like Linear
const priorityConfig: Record<number, { icon: React.ReactNode; label: string; color: string }> = {
  0: { icon: <Flag className="w-4 h-4" strokeWidth={1.5} />, label: 'No priority', color: '#6B6B6B' },
  1: { icon: <Flag className="w-4 h-4" strokeWidth={1.5} />, label: 'Low', color: '#6B6B6B' },
  2: { icon: <Flag className="w-4 h-4" strokeWidth={1.5} />, label: 'Medium', color: '#FBBF24' },
  3: { icon: <Flag className="w-4 h-4" strokeWidth={1.5} />, label: 'High', color: '#F97316' },
  4: { icon: <Flag className="w-4 h-4" strokeWidth={1.5} />, label: 'Urgent', color: '#EF4444' },
};

export default function TaskDetailModal({
  task,
  members,
  onClose,
  onUpdate,
  onDelete,
}: TaskDetailModalProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Theme colors
  const colors = {
    bg: isDark ? 'bg-[#1A1A1A]' : 'bg-white',
    bgSecondary: isDark ? 'bg-[#151515]' : 'bg-gray-50',
    bgHover: isDark ? 'hover:bg-[#2E2E2E]' : 'hover:bg-gray-100',
    bgActive: isDark ? 'bg-[#5E5CE6]/10' : 'bg-indigo-50',
    border: isDark ? 'border-[#2E2E2E]' : 'border-gray-200',
    text: isDark ? 'text-[#E0E0E0]' : 'text-gray-900',
    textSecondary: isDark ? 'text-[#A0A0A0]' : 'text-gray-600',
    textMuted: isDark ? 'text-[#6B6B6B]' : 'text-gray-400',
    textPlaceholder: isDark ? 'placeholder:text-[#4A4A4A]' : 'placeholder:text-gray-300',
    dropdown: isDark ? 'bg-[#1A1A1A]' : 'bg-white',
    input: isDark ? 'bg-[#252525]' : 'bg-gray-100',
  };

  // Helper to normalize date to YYYY-MM-DD for HTML input
  const normalizeDate = (d: string | null | undefined): string => {
    if (!d) return '';
    return d.includes('T') ? d.split('T')[0] : d;
  };

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigned_to || '');
  const [dueDate, setDueDate] = useState<string>(normalizeDate(task.due_date));
  const [dueTime, setDueTime] = useState<string>(task.due_time || '');
  const [duration, setDuration] = useState<number>(task.duration || 60);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);

  // Subtasks state
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(true);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [selectedSubtask, setSelectedSubtask] = useState<Subtask | null>(null);
  const [subtaskStatusDropdown, setSubtaskStatusDropdown] = useState(false);
  const [subtaskPriorityDropdown, setSubtaskPriorityDropdown] = useState(false);
  const [subtaskAssigneeDropdown, setSubtaskAssigneeDropdown] = useState(false);
  const newSubtaskInputRef = useRef<HTMLInputElement>(null);

  // Google Calendar states
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [calendarEventId, setCalendarEventId] = useState<string | null>(task.google_calendar_event_id || null);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Reset state when task changes
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setStatus(task.status);
    setPriority(task.priority);
    setAssigneeId(task.assigned_to || '');
    setDueDate(normalizeDate(task.due_date));
    setDueTime(task.due_time || '');
    setDuration(task.duration || 60);
    setCalendarEventId(task.google_calendar_event_id || null);
  }, [task.id]);

  // Fetch subtasks
  useEffect(() => {
    const fetchSubtasks = async () => {
      setLoadingSubtasks(true);
      try {
        const session = await getSession();
        if (!session) return;

        const response = await fetch(`/api/subtasks?task_id=${task.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSubtasks(data);
        }
      } catch (error) {
        console.error('Error fetching subtasks:', error);
      } finally {
        setLoadingSubtasks(false);
      }
    };

    fetchSubtasks();
  }, [task.id]);

  // Check Google Calendar connection status
  useEffect(() => {
    const checkCalendarStatus = async () => {
      try {
        const status = await getGoogleCalendarStatus();
        setCalendarConnected(status.connected);
      } catch (error) {
        console.error('Error checking calendar status:', error);
      }
    };
    checkCalendarStatus();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking inside a dropdown or dropdown trigger
      if (target.closest('[data-dropdown]') || target.closest('[data-dropdown-trigger]')) {
        return;
      }
      setShowStatusDropdown(false);
      setShowPriorityDropdown(false);
      setShowAssigneeDropdown(false);
      setSubtaskStatusDropdown(false);
      setSubtaskPriorityDropdown(false);
      setSubtaskAssigneeDropdown(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Subtask handlers
  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;

    setAddingSubtask(true);
    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch('/api/subtasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          task_id: task.id,
          title: newSubtaskTitle.trim(),
        }),
      });

      if (response.ok) {
        const newSubtask = await response.json();
        setSubtasks([...subtasks, newSubtask]);
        setNewSubtaskTitle('');
      }
    } catch (error) {
      console.error('Error adding subtask:', error);
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleUpdateSubtask = async (subtaskId: string, newTitle: string) => {
    if (!newTitle.trim()) return;

    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch('/api/subtasks', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: subtaskId,
          title: newTitle.trim(),
        }),
      });

      if (response.ok) {
        setSubtasks(subtasks.map(s =>
          s.id === subtaskId ? { ...s, title: newTitle.trim() } : s
        ));
      }
    } catch (error) {
      console.error('Error updating subtask:', error);
    } finally {
      setEditingSubtaskId(null);
      setEditingSubtaskTitle('');
    }
  };

  const handleUpdateSubtaskProperty = async (subtaskId: string, updates: Partial<Subtask>) => {
    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch('/api/subtasks', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: subtaskId,
          ...updates,
        }),
      });

      if (response.ok) {
        const updatedSubtask = await response.json();
        setSubtasks(subtasks.map(s =>
          s.id === subtaskId ? { ...s, ...updatedSubtask } : s
        ));
        if (selectedSubtask?.id === subtaskId) {
          setSelectedSubtask({ ...selectedSubtask, ...updatedSubtask });
        }
      }
    } catch (error) {
      console.error('Error updating subtask property:', error);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      const session = await getSession();
      if (!session) return;

      // Optimistic update
      setSubtasks(subtasks.filter(s => s.id !== subtaskId));

      const response = await fetch(`/api/subtasks?id=${subtaskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        // Refetch on error
        const fetchResponse = await fetch(`/api/subtasks?task_id=${task.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        if (fetchResponse.ok) {
          setSubtasks(await fetchResponse.json());
        }
      }
    } catch (error) {
      console.error('Error deleting subtask:', error);
    }
  };

  // Handle Google Calendar connection
  const handleConnectCalendar = async () => {
    try {
      const authUrl = await connectGoogleCalendar();
      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (error) {
      console.error('Error connecting to Google Calendar:', error);
      setCalendarError('Failed to connect to Google Calendar');
    }
  };

  // Handle sync to Google Calendar
  const handleSyncToCalendar = async () => {
    setSyncingCalendar(true);
    setCalendarError(null);
    try {
      const result = await syncTaskToCalendar(task.id);
      if (result.success) {
        setCalendarEventId(result.eventId || calendarEventId);
      } else if (result.needsAuth) {
        handleConnectCalendar();
      } else {
        setCalendarError(result.error || 'Failed to sync');
      }
    } catch (error) {
      console.error('Error syncing to calendar:', error);
      setCalendarError('Failed to sync to Google Calendar');
    } finally {
      setSyncingCalendar(false);
    }
  };

  // Handle unsync from Google Calendar
  const handleUnsyncFromCalendar = async () => {
    setSyncingCalendar(true);
    setCalendarError(null);
    try {
      const success = await unsyncTaskFromCalendar(task.id);
      if (success) {
        setCalendarEventId(null);
      } else {
        setCalendarError('Failed to remove sync');
      }
    } catch (error) {
      console.error('Error removing sync:', error);
      setCalendarError('Failed to remove sync');
    } finally {
      setSyncingCalendar(false);
    }
  };

  const hasChanges = useMemo(() => {
    const normDate = (d: string | null | undefined): string => {
      if (!d) return '';
      return d.includes('T') ? d.split('T')[0] : d;
    };

    return title !== task.title ||
           description !== (task.description || '') ||
           status !== task.status ||
           priority !== task.priority ||
           assigneeId !== (task.assigned_to || '') ||
           dueDate !== normDate(task.due_date) ||
           dueTime !== (task.due_time || '') ||
           (dueTime ? duration !== (task.duration || 60) : false);
  }, [title, description, status, priority, assigneeId, dueDate, dueTime, duration, task]);

  const handleSave = async () => {
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onUpdate(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        assigned_to: assigneeId || null,
        due_date: dueDate || null,
        due_time: dueTime || null,
        duration: dueTime ? duration : null,
      });
    } catch (error) {
      console.error('Error updating task:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(task.id);
    } catch (error) {
      console.error('Error deleting task:', error);
      setDeleting(false);
    }
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && hasChanges) {
      handleSave();
    }
  };

  const taskNumber = task.id.slice(0, 6).toUpperCase();
  const completedSubtasks = subtasks.filter(s => s.status === 'done').length;
  const totalSubtasks = subtasks.length;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center pt-[10vh] ${isDark ? 'bg-black/60' : 'bg-black/30'} backdrop-blur-sm`}
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className={`relative w-full max-w-[720px] ${colors.bg} border ${colors.border} rounded-xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Linear style */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${colors.border}`}>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${colors.textMuted} font-mono`}>PAR-{taskNumber}</span>
            <button
              className={`p-1 ${colors.bgHover} rounded transition-colors`}
              onClick={() => navigator.clipboard.writeText(`PAR-${taskNumber}`)}
              title="Copy ID"
            >
              <Copy className={`w-3.5 h-3.5 ${colors.textMuted}`} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className={`p-1.5 ${colors.bgHover} rounded transition-colors`}
              title="Delete"
            >
              <Trash2 className={`w-4 h-4 ${colors.textMuted}`} />
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 ${colors.bgHover} rounded transition-colors`}
            >
              <X className={`w-4 h-4 ${colors.textMuted}`} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {/* Title */}
          <div className="px-6 pt-5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              className={`w-full bg-transparent ${colors.text} text-xl font-medium ${colors.textPlaceholder} focus:outline-none`}
            />
          </div>

          {/* Description */}
          <div className="px-6 pt-3 pb-4">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description..."
              rows={3}
              className={`w-full bg-transparent ${colors.textSecondary} text-sm ${colors.textPlaceholder} focus:outline-none resize-none`}
            />
          </div>

          {/* Subtasks Section - Linear style */}
          <div className={`px-6 py-4 border-t ${colors.border}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${colors.text}`}>Sub-issues</span>
                {totalSubtasks > 0 && (
                  <span className={`text-xs ${colors.textMuted}`}>
                    {completedSubtasks}/{totalSubtasks}
                  </span>
                )}
              </div>
              {totalSubtasks > 0 && (
                <div className={`w-20 h-1.5 ${isDark ? 'bg-[#2E2E2E]' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                  <div
                    className="h-full bg-[#5E5CE6] rounded-full transition-all"
                    style={{ width: `${totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0}%` }}
                  />
                </div>
              )}
            </div>

            {/* Subtasks list */}
            {loadingSubtasks ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className={`w-5 h-5 ${colors.textMuted} animate-spin`} />
              </div>
            ) : (
              <div className="space-y-1">
                {subtasks.map((subtask) => (
                  <div
                    key={subtask.id}
                    className={`group flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md ${colors.bgHover} transition-colors cursor-pointer`}
                    onClick={() => setSelectedSubtask(subtask)}
                  >
                    <span className="flex-shrink-0">
                      {statusIcons[subtask.status as TaskStatus] || statusIcons.todo}
                    </span>

                    <span
                      className={`flex-1 text-sm ${subtask.status === 'done' ? `line-through ${colors.textMuted}` : colors.text}`}
                    >
                      {subtask.title}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSubtask(subtask.id);
                      }}
                      className={`opacity-0 group-hover:opacity-100 p-1 ${colors.bgHover} rounded transition-all`}
                    >
                      <X className={`w-3.5 h-3.5 ${colors.textMuted}`} />
                    </button>
                  </div>
                ))}

                {/* Add subtask input */}
                <div className="flex items-center gap-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (newSubtaskTitle.trim()) {
                        handleAddSubtask();
                      } else {
                        newSubtaskInputRef.current?.focus();
                      }
                    }}
                    disabled={addingSubtask}
                    className={`p-0.5 rounded transition-colors ${newSubtaskTitle.trim() ? 'text-[#5E5CE6] hover:bg-[#5E5CE6]/10' : colors.textMuted} ${colors.bgHover}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <input
                    ref={newSubtaskInputRef}
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                    placeholder="Add sub-issue..."
                    className={`flex-1 bg-transparent text-sm ${colors.text} ${colors.textPlaceholder} focus:outline-none`}
                    disabled={addingSubtask}
                  />
                  {addingSubtask && (
                    <Loader2 className={`w-4 h-4 ${colors.textMuted} animate-spin`} />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Properties - Linear style with horizontal layout */}
          <div className={`px-6 py-4 border-t ${colors.border} space-y-3`}>
            {/* Status */}
            <div className="flex items-center">
              <span className={`w-24 text-sm ${colors.textMuted}`}>Status</span>
              <div className="relative">
                <button
                  type="button"
                  data-dropdown-trigger
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStatusDropdown(!showStatusDropdown);
                    setShowPriorityDropdown(false);
                    setShowAssigneeDropdown(false);
                  }}
                  className={`flex items-center gap-2 px-2 py-1 text-sm ${colors.text} ${colors.bgHover} rounded transition-colors`}
                >
                  {statusIcons[status]}
                  <span>{STATUS_LABELS[status].label}</span>
                  <ChevronDown className={`w-3 h-3 ${colors.textMuted}`} />
                </button>
                {showStatusDropdown && (
                  <div data-dropdown className={`absolute left-0 top-full mt-1 ${colors.dropdown} border ${colors.border} rounded-lg shadow-xl z-50 py-1 min-w-[160px]`}>
                    {STATUS_ORDER.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatus(s);
                          setShowStatusDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 ${colors.bgHover} text-left text-sm ${
                          status === s ? colors.bgActive : ''
                        }`}
                      >
                        {statusIcons[s]}
                        <span className={colors.text}>{STATUS_LABELS[s].label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Priority */}
            <div className="flex items-center">
              <span className={`w-24 text-sm ${colors.textMuted}`}>Priority</span>
              <div className="relative">
                <button
                  type="button"
                  data-dropdown-trigger
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPriorityDropdown(!showPriorityDropdown);
                    setShowStatusDropdown(false);
                    setShowAssigneeDropdown(false);
                  }}
                  className={`flex items-center gap-2 px-2 py-1 text-sm ${colors.bgHover} rounded transition-colors`}
                  style={{ color: priorityConfig[priority].color }}
                >
                  {priorityConfig[priority].icon}
                  <span>{priorityConfig[priority].label}</span>
                  <ChevronDown className={`w-3 h-3 ${colors.textMuted}`} />
                </button>
                {showPriorityDropdown && (
                  <div data-dropdown className={`absolute left-0 top-full mt-1 ${colors.dropdown} border ${colors.border} rounded-lg shadow-xl z-50 py-1 min-w-[160px]`}>
                    {([0, 1, 2, 3, 4] as TaskPriority[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPriority(p);
                          setShowPriorityDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 ${colors.bgHover} text-left text-sm ${
                          priority === p ? colors.bgActive : ''
                        }`}
                        style={{ color: priorityConfig[p].color }}
                      >
                        {priorityConfig[p].icon}
                        <span>{priorityConfig[p].label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Assignee */}
            <div className="flex items-center">
              <span className={`w-24 text-sm ${colors.textMuted}`}>Assignee</span>
              <div className="relative">
                <button
                  type="button"
                  data-dropdown-trigger
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAssigneeDropdown(!showAssigneeDropdown);
                    setShowStatusDropdown(false);
                    setShowPriorityDropdown(false);
                  }}
                  className={`flex items-center gap-2 px-2 py-1 text-sm ${colors.textSecondary} ${colors.bgHover} rounded transition-colors`}
                >
                  {assigneeId ? (
                    <>
                      <div className="w-5 h-5 rounded-full bg-[#5E5CE6]/20 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-[#5E5CE6]">
                          {members.find((m) => m.user_id === assigneeId)?.user?.email?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className={colors.text}>
                        {members.find((m) => m.user_id === assigneeId)?.user?.email?.split('@')[0]}
                      </span>
                    </>
                  ) : (
                    <>
                      <User className="w-4 h-4" />
                      <span>Unassigned</span>
                    </>
                  )}
                  <ChevronDown className={`w-3 h-3 ${colors.textMuted}`} />
                </button>
                {showAssigneeDropdown && (
                  <div data-dropdown className={`absolute left-0 top-full mt-1 ${colors.dropdown} border ${colors.border} rounded-lg shadow-xl z-50 py-1 min-w-[200px]`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssigneeId('');
                        setShowAssigneeDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 ${colors.bgHover} text-left text-sm ${
                        !assigneeId ? colors.bgActive : ''
                      }`}
                    >
                      <User className={`w-4 h-4 ${colors.textMuted}`} />
                      <span className={colors.textSecondary}>Unassigned</span>
                    </button>
                    {members.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssigneeId(member.user_id);
                          setShowAssigneeDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 ${colors.bgHover} text-left text-sm ${
                          assigneeId === member.user_id ? colors.bgActive : ''
                        }`}
                      >
                        <div className="w-5 h-5 bg-[#5E5CE6]/20 rounded-full flex items-center justify-center">
                          <span className="text-[10px] font-medium text-[#5E5CE6]">
                            {member.user?.email?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className={`${colors.text} truncate`}>{member.user?.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Due date */}
            <div className="flex items-center">
              <span className={`w-24 text-sm ${colors.textMuted}`}>Due date</span>
              <div className={`flex items-center gap-2 px-2 py-1 text-sm ${colors.textSecondary} ${colors.bgHover} rounded transition-colors`}>
                <Calendar className="w-4 h-4" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={`bg-transparent ${colors.text} focus:outline-none cursor-pointer ${isDark ? '[color-scheme:dark]' : ''}`}
                />
              </div>
            </div>

            {/* Due time */}
            {dueDate && (
              <div className="flex items-center">
                <span className={`w-24 text-sm ${colors.textMuted}`}>Time</span>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 px-2 py-1 text-sm ${colors.textSecondary} ${colors.bgHover} rounded transition-colors`}>
                    <Clock className="w-4 h-4" />
                    <input
                      type="time"
                      value={dueTime}
                      onChange={(e) => setDueTime(e.target.value)}
                      className={`bg-transparent ${colors.text} focus:outline-none cursor-pointer ${isDark ? '[color-scheme:dark]' : ''}`}
                    />
                  </div>
                  {dueTime && (
                    <select
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className={`px-2 py-1 bg-transparent text-sm ${colors.text} ${colors.bgHover} rounded transition-colors focus:outline-none cursor-pointer`}
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>1h</option>
                      <option value={90}>1h30</option>
                      <option value={120}>2h</option>
                      <option value={180}>3h</option>
                      <option value={240}>4h</option>
                      <option value={480}>8h</option>
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* Labels */}
            {task.labels && task.labels.length > 0 && (
              <div className="flex items-center">
                <span className={`w-24 text-sm ${colors.textMuted}`}>Labels</span>
                <div className="flex flex-wrap gap-1.5">
                  {task.labels.map((label) => (
                    <span
                      key={label.id}
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `${label.color}20`,
                        color: label.color,
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Activity/Metadata */}
          <div className={`px-6 py-3 border-t ${colors.border}`}>
            <div className={`flex items-center justify-between text-xs ${colors.textMuted}`}>
              <span>Created {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</span>
              {task.updated_at && (
                <span>Updated {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-4 py-3 border-t ${colors.border} ${colors.bgSecondary}`}>
          <span className={`text-xs ${colors.textMuted}`}>
            <kbd className={`px-1.5 py-0.5 ${isDark ? 'bg-[#2E2E2E]' : 'bg-gray-200'} rounded text-[10px]`}>⌘</kbd>
            <span className="mx-1">+</span>
            <kbd className={`px-1.5 py-0.5 ${isDark ? 'bg-[#2E2E2E]' : 'bg-gray-200'} rounded text-[10px]`}>↵</kbd>
            <span className="ml-1">to save</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 text-sm ${colors.textSecondary} ${colors.bgHover} rounded transition-colors`}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 text-sm text-white bg-[#5E5CE6] hover:bg-[#6E6CE8] rounded transition-colors disabled:opacity-50"
              disabled={loading || !hasChanges || !title.trim()}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </div>

        {/* Delete confirmation overlay */}
        {showDeleteConfirm && (
          <div className={`absolute inset-0 ${isDark ? 'bg-[#1A1A1A]/95' : 'bg-white/95'} flex items-center justify-center`}>
            <div className="text-center p-6 max-w-sm">
              <div className="w-12 h-12 bg-[#EF4444]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-[#EF4444]" />
              </div>
              <h3 className={`text-lg font-medium ${colors.text} mb-2`}>Delete issue?</h3>
              <p className={`text-sm ${colors.textMuted} mb-6`}>
                This action cannot be undone. The issue will be permanently deleted.
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className={`px-4 py-2 text-sm ${colors.textSecondary} ${colors.bgHover} rounded transition-colors`}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm text-white bg-[#EF4444] hover:bg-[#DC2626] rounded transition-colors"
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Subtask detail panel */}
        {selectedSubtask && (
          <div className={`absolute inset-0 ${isDark ? 'bg-[#1A1A1A]' : 'bg-white'} flex flex-col`}>
            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${colors.border}`}>
              <button
                onClick={() => {
                  setSelectedSubtask(null);
                  setSubtaskStatusDropdown(false);
                  setSubtaskPriorityDropdown(false);
                  setSubtaskAssigneeDropdown(false);
                }}
                className={`flex items-center gap-2 text-sm ${colors.textSecondary} ${colors.bgHover} px-2 py-1 rounded transition-colors`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to issue</span>
              </button>
              <button
                onClick={() => {
                  handleDeleteSubtask(selectedSubtask.id);
                  setSelectedSubtask(null);
                }}
                className={`p-2 ${colors.bgHover} rounded transition-colors text-[#EF4444]`}
                title="Delete sub-issue"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Title */}
              <div className="px-6 pt-6 pb-4">
                <input
                  type="text"
                  value={editingSubtaskId === selectedSubtask.id ? editingSubtaskTitle : selectedSubtask.title}
                  onChange={(e) => {
                    setEditingSubtaskId(selectedSubtask.id);
                    setEditingSubtaskTitle(e.target.value);
                  }}
                  onBlur={() => {
                    if (editingSubtaskId === selectedSubtask.id && editingSubtaskTitle.trim()) {
                      handleUpdateSubtask(selectedSubtask.id, editingSubtaskTitle);
                      setSelectedSubtask({ ...selectedSubtask, title: editingSubtaskTitle });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editingSubtaskTitle.trim()) {
                      handleUpdateSubtask(selectedSubtask.id, editingSubtaskTitle);
                      setSelectedSubtask({ ...selectedSubtask, title: editingSubtaskTitle });
                    }
                  }}
                  className={`w-full text-xl font-medium ${colors.text} bg-transparent focus:outline-none`}
                  placeholder="Sub-issue title"
                />
              </div>

              {/* Properties */}
              <div className={`px-6 py-4 border-t ${colors.border} space-y-3`}>
                {/* Status */}
                <div className="flex items-center">
                  <span className={`w-24 text-sm ${colors.textMuted}`}>Status</span>
                  <div className="relative">
                    <button
                      type="button"
                      data-dropdown-trigger
                      onClick={(e) => {
                        e.stopPropagation();
                        setSubtaskStatusDropdown(!subtaskStatusDropdown);
                        setSubtaskPriorityDropdown(false);
                        setSubtaskAssigneeDropdown(false);
                      }}
                      className={`flex items-center gap-2 px-2 py-1 text-sm ${colors.text} ${colors.bgHover} rounded transition-colors`}
                    >
                      {statusIcons[selectedSubtask.status as TaskStatus] || statusIcons.todo}
                      <span>{STATUS_LABELS[selectedSubtask.status as TaskStatus]?.label || 'Todo'}</span>
                      <ChevronDown className={`w-3 h-3 ${colors.textMuted}`} />
                    </button>
                    {subtaskStatusDropdown && (
                      <div data-dropdown className={`absolute left-0 top-full mt-1 z-50 min-w-[160px] ${colors.dropdown} border ${colors.border} rounded-lg shadow-xl py-1`}>
                        {STATUS_ORDER.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateSubtaskProperty(selectedSubtask.id, { status: s });
                              setSubtaskStatusDropdown(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${colors.bgHover} ${selectedSubtask.status === s ? colors.bgActive : ''}`}
                          >
                            {statusIcons[s]}
                            <span className={colors.text}>{STATUS_LABELS[s].label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Priority */}
                <div className="flex items-center">
                  <span className={`w-24 text-sm ${colors.textMuted}`}>Priority</span>
                  <div className="relative">
                    <button
                      type="button"
                      data-dropdown-trigger
                      onClick={(e) => {
                        e.stopPropagation();
                        setSubtaskPriorityDropdown(!subtaskPriorityDropdown);
                        setSubtaskStatusDropdown(false);
                        setSubtaskAssigneeDropdown(false);
                      }}
                      className={`flex items-center gap-2 px-2 py-1 text-sm ${colors.text} ${colors.bgHover} rounded transition-colors`}
                    >
                      <Flag className="w-4 h-4" style={{ color: priorityConfig[selectedSubtask.priority ?? 0]?.color }} />
                      <span>{priorityConfig[selectedSubtask.priority ?? 0]?.label || 'No priority'}</span>
                      <ChevronDown className={`w-3 h-3 ${colors.textMuted}`} />
                    </button>
                    {subtaskPriorityDropdown && (
                      <div data-dropdown className={`absolute left-0 top-full mt-1 z-50 min-w-[160px] ${colors.dropdown} border ${colors.border} rounded-lg shadow-xl py-1`}>
                        {([0, 1, 2, 3, 4] as TaskPriority[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateSubtaskProperty(selectedSubtask.id, { priority: p });
                              setSubtaskPriorityDropdown(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${colors.bgHover} ${selectedSubtask.priority === p ? colors.bgActive : ''}`}
                          >
                            <Flag className="w-4 h-4" style={{ color: priorityConfig[p].color }} />
                            <span className={colors.text}>{priorityConfig[p].label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Assignee */}
                <div className="flex items-center">
                  <span className={`w-24 text-sm ${colors.textMuted}`}>Assignee</span>
                  <div className="relative">
                    <button
                      type="button"
                      data-dropdown-trigger
                      onClick={(e) => {
                        e.stopPropagation();
                        setSubtaskAssigneeDropdown(!subtaskAssigneeDropdown);
                        setSubtaskStatusDropdown(false);
                        setSubtaskPriorityDropdown(false);
                      }}
                      className={`flex items-center gap-2 px-2 py-1 text-sm ${colors.text} ${colors.bgHover} rounded transition-colors`}
                    >
                      {selectedSubtask.assigned_to ? (
                        <>
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                            <span className="text-[10px] font-medium text-white">
                              {(members.find(m => m.user_id === selectedSubtask.assigned_to)?.user?.full_name ||
                                members.find(m => m.user_id === selectedSubtask.assigned_to)?.user?.email || '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span>{members.find(m => m.user_id === selectedSubtask.assigned_to)?.user?.full_name ||
                                 members.find(m => m.user_id === selectedSubtask.assigned_to)?.user?.email?.split('@')[0] || 'Unknown'}</span>
                        </>
                      ) : (
                        <>
                          <User className={`w-4 h-4 ${colors.textMuted}`} />
                          <span className={colors.textMuted}>No assignee</span>
                        </>
                      )}
                      <ChevronDown className={`w-3 h-3 ${colors.textMuted}`} />
                    </button>
                    {subtaskAssigneeDropdown && (
                      <div data-dropdown className={`absolute left-0 top-full mt-1 z-50 min-w-[200px] ${colors.dropdown} border ${colors.border} rounded-lg shadow-xl py-1`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateSubtaskProperty(selectedSubtask.id, { assigned_to: undefined });
                            setSubtaskAssigneeDropdown(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${colors.bgHover}`}
                        >
                          <User className={`w-4 h-4 ${colors.textMuted}`} />
                          <span className={colors.textMuted}>No assignee</span>
                        </button>
                        {members.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateSubtaskProperty(selectedSubtask.id, { assigned_to: member.user_id });
                              setSubtaskAssigneeDropdown(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${colors.bgHover} ${selectedSubtask.assigned_to === member.user_id ? colors.bgActive : ''}`}
                          >
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                              <span className="text-[10px] font-medium text-white">
                                {(member.user?.full_name || member.user?.email || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className={colors.text}>{member.user?.full_name || member.user?.email?.split('@')[0]}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Due Date */}
                <div className="flex items-center">
                  <span className={`w-24 text-sm ${colors.textMuted}`}>Due date</span>
                  <input
                    type="date"
                    value={selectedSubtask.due_date || ''}
                    onChange={(e) => handleUpdateSubtaskProperty(selectedSubtask.id, { due_date: e.target.value || undefined })}
                    className={`px-2 py-1 text-sm ${colors.text} ${colors.input} rounded border-none focus:outline-none focus:ring-1 focus:ring-[#5E5CE6] ${isDark ? '[color-scheme:dark]' : ''}`}
                  />
                </div>

                {/* Due Time */}
                <div className="flex items-center">
                  <span className={`w-24 text-sm ${colors.textMuted}`}>Time</span>
                  <input
                    type="time"
                    value={selectedSubtask.due_time || ''}
                    onChange={(e) => handleUpdateSubtaskProperty(selectedSubtask.id, { due_time: e.target.value || undefined })}
                    className={`px-2 py-1 text-sm ${colors.text} ${colors.input} rounded border-none focus:outline-none focus:ring-1 focus:ring-[#5E5CE6] ${isDark ? '[color-scheme:dark]' : ''}`}
                  />
                </div>

                {/* Duration */}
                <div className="flex items-center">
                  <span className={`w-24 text-sm ${colors.textMuted}`}>Duration</span>
                  <select
                    value={selectedSubtask.duration || 60}
                    onChange={(e) => handleUpdateSubtaskProperty(selectedSubtask.id, { duration: parseInt(e.target.value) })}
                    className={`px-2 py-1 text-sm ${colors.text} ${colors.input} rounded border-none focus:outline-none focus:ring-1 focus:ring-[#5E5CE6]`}
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1h 30m</option>
                    <option value={120}>2 hours</option>
                    <option value={180}>3 hours</option>
                    <option value={240}>4 hours</option>
                  </select>
                </div>

                {/* Parent task */}
                <div className="flex items-center">
                  <span className={`w-24 text-sm ${colors.textMuted}`}>Parent</span>
                  <div className={`flex items-center gap-2 px-2 py-1 text-sm ${colors.textSecondary}`}>
                    {statusIcons[task.status]}
                    <span>{task.title}</span>
                  </div>
                </div>
              </div>

              {/* Activity */}
              <div className={`px-6 py-3 border-t ${colors.border}`}>
                <div className={`flex items-center justify-between text-xs ${colors.textMuted}`}>
                  <span>Created {formatDistanceToNow(new Date(selectedSubtask.created_at), { addSuffix: true })}</span>
                  {selectedSubtask.updated_at && (
                    <span>Updated {formatDistanceToNow(new Date(selectedSubtask.updated_at), { addSuffix: true })}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-between px-4 py-3 border-t ${colors.border} ${colors.bgSecondary}`}>
              <span className={`text-xs ${colors.textMuted}`}>
                Sub-issue of <span className={colors.text}>{task.title}</span>
              </span>
              <button
                onClick={() => {
                  setSelectedSubtask(null);
                  setSubtaskStatusDropdown(false);
                  setSubtaskPriorityDropdown(false);
                  setSubtaskAssigneeDropdown(false);
                }}
                className={`px-3 py-1.5 text-sm ${colors.textSecondary} ${colors.bgHover} rounded transition-colors`}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
