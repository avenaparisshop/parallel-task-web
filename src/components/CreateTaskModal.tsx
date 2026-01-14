'use client';

import { useState, useRef, useEffect } from 'react';
import { ProjectMember, TaskPriority, TaskStatus, STATUS_ORDER } from '@/types';
import {
  X,
  Loader2,
  Circle,
  CheckCircle2,
  Clock,
  XCircle,
  User,
  Calendar,
  Timer,
  MoreHorizontal,
  Plus,
  ListTodo,
  ChevronRight,
  Expand,
  Lightbulb,
  Mail,
  Paperclip,
} from 'lucide-react';
import { format, parse } from 'date-fns';
import { useTheme } from '@/contexts/ThemeContext';

interface InitialValues {
  due_date?: string;
  due_time?: string;
  duration?: number;
}

interface PendingSubtask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  due_date?: string;
  due_time?: string;
  duration?: number;
}

interface CreateTaskModalProps {
  projectId: string;
  projectName?: string;
  members: ProjectMember[];
  onClose: () => void;
  onCreate: (task: any, subtasks?: PendingSubtask[]) => Promise<void>;
  initialValues?: InitialValues;
}

// Status icons matching Linear
const statusConfig: Record<TaskStatus, { icon: React.ReactNode; label: string }> = {
  backlog: { icon: <Circle className="w-4 h-4" strokeWidth={1.5} />, label: 'Backlog' },
  todo: { icon: <Circle className="w-4 h-4" strokeWidth={1.5} />, label: 'Todo' },
  in_progress: { icon: <Clock className="w-4 h-4" strokeWidth={1.5} />, label: 'In Progress' },
  done: { icon: <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />, label: 'Done' },
  cancelled: { icon: <XCircle className="w-4 h-4" strokeWidth={1.5} />, label: 'Cancelled' },
};

// Priority config matching Linear
const priorityConfig: Record<number, { label: string; bars: number }> = {
  0: { label: 'Priority', bars: 0 },
  1: { label: 'Low', bars: 1 },
  2: { label: 'Medium', bars: 2 },
  3: { label: 'High', bars: 3 },
  4: { label: 'Urgent', bars: 4 },
};

// Priority bars component like Linear
const PriorityIcon = ({ level, isDark }: { level: number; isDark: boolean }) => (
  <div className="flex items-end gap-[2px] h-3.5 w-3.5">
    {[1, 2, 3, 4].map((bar) => (
      <div
        key={bar}
        className="w-[3px] rounded-[1px]"
        style={{
          height: `${bar * 25}%`,
          backgroundColor: bar <= level
            ? (level === 4 ? '#EF4444' : level === 3 ? '#F97316' : level === 2 ? '#FBBF24' : '#6B7280')
            : (isDark ? '#404040' : '#D1D5DB'),
        }}
      />
    ))}
  </div>
);

const durationOptions = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h 30m' },
  { value: 120, label: '2h' },
  { value: 180, label: '3h' },
  { value: 240, label: '4h' },
];

export default function CreateTaskModal({
  projectId,
  projectName = 'Project',
  members,
  onClose,
  onCreate,
  initialValues,
}: CreateTaskModalProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>(0);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(initialValues?.due_date || '');
  const [dueTime, setDueTime] = useState<string>(initialValues?.due_time || '');
  const [duration, setDuration] = useState<number>(initialValues?.duration || 60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [createMore, setCreateMore] = useState(false);
  const [pendingSubtasks, setPendingSubtasks] = useState<PendingSubtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [subtaskDropdown, setSubtaskDropdown] = useState<{ id: string; type: string } | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-dropdown]') || target.closest('[data-dropdown-trigger]')) {
        return;
      }
      setActiveDropdown(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        assigned_to: assigneeId || undefined,
        due_date: dueDate || undefined,
        due_time: dueTime || undefined,
        duration: dueTime ? duration : undefined,
      }, pendingSubtasks.length > 0 ? pendingSubtasks : undefined);

      if (createMore) {
        setTitle('');
        setDescription('');
        setPendingSubtasks([]);
        setShowSubtasks(false);
        setLoading(false);
        titleRef.current?.focus();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (activeDropdown) {
        setActiveDropdown(null);
      } else {
        onClose();
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return null;
    try {
      const date = parse(dateStr, 'yyyy-MM-dd', new Date());
      return format(date, 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const toggleDropdown = (name: string) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const addSubtask = () => {
    console.log('[CreateTaskModal] addSubtask called, title:', newSubtaskTitle);
    if (!newSubtaskTitle.trim()) return;
    const newSubtask: PendingSubtask = {
      id: crypto.randomUUID(),
      title: newSubtaskTitle.trim(),
      status: 'todo',
      priority: 0,
    };
    console.log('[CreateTaskModal] Adding subtask:', newSubtask);
    setPendingSubtasks(prev => [...prev, newSubtask]);
    setNewSubtaskTitle('');
    setTimeout(() => subtaskInputRef.current?.focus(), 0);
  };

  const updateSubtask = (id: string, updates: Partial<PendingSubtask>) => {
    setPendingSubtasks(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeSubtask = (id: string) => {
    setPendingSubtasks(pendingSubtasks.filter(s => s.id !== id));
  };

  // Dropdown component
  const Dropdown = ({
    children,
    isOpen,
    className = ''
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    className?: string;
  }) => {
    if (!isOpen) return null;
    return (
      <div
        data-dropdown
        className={`absolute left-0 top-full mt-1 ${isDark ? 'bg-[#1C1C1C] border-[#333]' : 'bg-white border-gray-200'} border rounded-lg shadow-xl z-50 py-1 min-w-[160px] ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    );
  };

  // Property button component (matching Linear style)
  const PropertyButton = ({
    icon,
    label,
    onClick,
    active = false,
    dropdown,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    active?: boolean;
    dropdown?: string;
  }) => (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-dropdown-trigger
        onClick={onClick}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors
          ${isDark
            ? 'border-[#333] hover:border-[#444] hover:bg-[#252525]'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }
          ${active
            ? (isDark ? 'text-white' : 'text-gray-900')
            : (isDark ? 'text-[#888]' : 'text-gray-500')
          }
        `}
      >
        {icon}
        <span>{label}</span>
      </button>
      {dropdown && activeDropdown === dropdown && (
        <Dropdown isOpen={true}>
          {dropdown === 'status' && STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatus(s); setActiveDropdown(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-50'} ${status === s ? (isDark ? 'bg-[#252525]' : 'bg-gray-50') : ''}`}
            >
              <span className={isDark ? 'text-[#888]' : 'text-gray-500'}>{statusConfig[s].icon}</span>
              <span className={isDark ? 'text-white' : 'text-gray-900'}>{statusConfig[s].label}</span>
            </button>
          ))}
          {dropdown === 'priority' && ([0, 1, 2, 3, 4] as TaskPriority[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setPriority(p); setActiveDropdown(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-50'} ${priority === p ? (isDark ? 'bg-[#252525]' : 'bg-gray-50') : ''}`}
            >
              <PriorityIcon level={priorityConfig[p].bars} isDark={isDark} />
              <span className={isDark ? 'text-white' : 'text-gray-900'}>{priorityConfig[p].label}</span>
            </button>
          ))}
          {dropdown === 'assignee' && (
            <>
              <button
                type="button"
                onClick={() => { setAssigneeId(''); setActiveDropdown(null); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-50'}`}
              >
                <User className={`w-4 h-4 ${isDark ? 'text-[#666]' : 'text-gray-400'}`} />
                <span className={isDark ? 'text-[#888]' : 'text-gray-500'}>No assignee</span>
              </button>
              {members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => { setAssigneeId(member.user_id); setActiveDropdown(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-50'} ${assigneeId === member.user_id ? (isDark ? 'bg-[#252525]' : 'bg-gray-50') : ''}`}
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                    <span className="text-[10px] font-medium text-white">
                      {(member.user?.full_name || member.user?.email || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className={isDark ? 'text-white' : 'text-gray-900'}>
                    {member.user?.full_name || member.user?.email?.split('@')[0]}
                  </span>
                </button>
              ))}
            </>
          )}
          {dropdown === 'date' && (
            <div className="p-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); }}
                className={`w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDark ? 'bg-[#1C1C1C] border-[#333] text-white [color-scheme:dark]' : 'bg-white border-gray-200 text-gray-900'}`}
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => { setDueDate(''); setDueTime(''); setActiveDropdown(null); }}
                  className="w-full mt-2 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10 rounded transition-colors text-left"
                >
                  Clear date
                </button>
              )}
            </div>
          )}
          {dropdown === 'time' && (
            <div className="p-2">
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className={`w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDark ? 'bg-[#1C1C1C] border-[#333] text-white [color-scheme:dark]' : 'bg-white border-gray-200 text-gray-900'}`}
              />
            </div>
          )}
          {dropdown === 'duration' && durationOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setDuration(opt.value); setActiveDropdown(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-50'} ${duration === opt.value ? (isDark ? 'bg-[#252525]' : 'bg-gray-50') : ''}`}
            >
              <span className={isDark ? 'text-white' : 'text-gray-900'}>{opt.label}</span>
            </button>
          ))}
        </Dropdown>
      )}
    </div>
  );

  const selectedMember = members.find(m => m.user_id === assigneeId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 ${isDark ? 'bg-black/60' : 'bg-black/20'}`}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-[540px] ${isDark ? 'bg-[#1C1C1C]' : 'bg-white'} rounded-xl shadow-2xl overflow-hidden`}
      >
        {/* Header - Linear style breadcrumb */}
        <div className={`flex items-center justify-between px-4 py-2.5 ${isDark ? 'border-b border-[#333]' : 'border-b border-gray-100'}`}>
          <div className={`flex items-center gap-1.5 text-sm ${isDark ? 'text-[#888]' : 'text-gray-500'}`}>
            <span className="flex items-center gap-1.5">
              <div className={`w-4 h-4 rounded ${isDark ? 'bg-[#333]' : 'bg-gray-200'} flex items-center justify-center`}>
                <span className="text-[10px]">✦</span>
              </div>
              {projectName}
            </span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className={isDark ? 'text-white' : 'text-gray-900'}>New issue</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-[#333] text-[#666]' : 'hover:bg-gray-100 text-gray-400'}`}
            >
              <Expand className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-[#333] text-[#666]' : 'hover:bg-gray-100 text-gray-400'}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Title & Description */}
          <div className="px-4 pt-4 pb-2">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              className={`w-full bg-transparent text-lg font-normal focus:outline-none ${isDark ? 'text-white placeholder:text-[#555]' : 'text-gray-900 placeholder:text-gray-300'}`}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description..."
              rows={1}
              className={`w-full mt-2 bg-transparent text-sm focus:outline-none resize-none ${isDark ? 'text-[#888] placeholder:text-[#444]' : 'text-gray-600 placeholder:text-gray-300'}`}
            />
          </div>

          {/* Quick suggestions - Linear style */}
          <div className={`px-4 py-3 flex items-center gap-2 ${isDark ? 'border-t border-[#252525]' : 'border-t border-gray-50'}`}>
            <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-[#666]' : 'text-gray-400'}`}>
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Quick suggestions</span>
            </div>
            <button
              type="button"
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors ${isDark ? 'border-[#333] text-[#888] hover:bg-[#252525]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              <Lightbulb className="w-3 h-3" />
              IDEA
            </button>
            <button
              type="button"
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors ${isDark ? 'border-[#333] text-[#888] hover:bg-[#252525]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              <Mail className="w-3 h-3" />
              MAIL
            </button>
          </div>

          {/* Properties row - Linear style buttons */}
          <div className={`px-4 py-3 flex flex-wrap items-center gap-2 ${isDark ? 'border-t border-[#252525]' : 'border-t border-gray-50'}`}>
            {/* Status */}
            <PropertyButton
              icon={<span className={isDark ? 'text-[#666]' : 'text-gray-400'}>{statusConfig[status].icon}</span>}
              label={statusConfig[status].label}
              onClick={() => toggleDropdown('status')}
              active={status !== 'todo'}
              dropdown="status"
            />

            {/* Priority */}
            <PropertyButton
              icon={<PriorityIcon level={priorityConfig[priority].bars} isDark={isDark} />}
              label={priority === 0 ? 'Priority' : priorityConfig[priority].label}
              onClick={() => toggleDropdown('priority')}
              active={priority > 0}
              dropdown="priority"
            />

            {/* Assignee */}
            <PropertyButton
              icon={
                selectedMember ? (
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                    <span className="text-[8px] font-medium text-white">
                      {(selectedMember.user?.full_name || selectedMember.user?.email || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                ) : (
                  <User className={`w-4 h-4 ${isDark ? 'text-[#666]' : 'text-gray-400'}`} />
                )
              }
              label={selectedMember ? (selectedMember.user?.full_name || selectedMember.user?.email?.split('@')[0] || 'Assignee') : 'Assignee'}
              onClick={() => toggleDropdown('assignee')}
              active={!!assigneeId}
              dropdown="assignee"
            />

            {/* Project badge */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md ${isDark ? 'bg-[#252525] text-white' : 'bg-gray-100 text-gray-700'}`}>
              <div className="w-3 h-3 rounded-sm bg-orange-500" />
              <span>{projectName}</span>
            </div>

            {/* Date */}
            <PropertyButton
              icon={<Calendar className={`w-4 h-4 ${dueDate ? 'text-red-500' : (isDark ? 'text-[#666]' : 'text-gray-400')}`} />}
              label={formatDisplayDate(dueDate) || 'Date'}
              onClick={() => toggleDropdown('date')}
              active={!!dueDate}
              dropdown="date"
            />

            {/* Time (only show if date is set) */}
            {dueDate && (
              <PropertyButton
                icon={<Clock className={`w-4 h-4 ${dueTime ? 'text-blue-500' : (isDark ? 'text-[#666]' : 'text-gray-400')}`} />}
                label={dueTime || 'Time'}
                onClick={() => toggleDropdown('time')}
                active={!!dueTime}
                dropdown="time"
              />
            )}

            {/* Duration (only show if time is set) */}
            {dueTime && (
              <PropertyButton
                icon={<Timer className={`w-4 h-4 text-green-500`} />}
                label={durationOptions.find(d => d.value === duration)?.label || '1h'}
                onClick={() => toggleDropdown('duration')}
                active={true}
                dropdown="duration"
              />
            )}

            {/* Subtasks toggle */}
            <PropertyButton
              icon={<ListTodo className={`w-4 h-4 ${pendingSubtasks.length > 0 ? 'text-purple-500' : (isDark ? 'text-[#666]' : 'text-gray-400')}`} />}
              label={pendingSubtasks.length > 0 ? `${pendingSubtasks.length} subtask${pendingSubtasks.length > 1 ? 's' : ''}` : 'Subtasks'}
              onClick={() => setShowSubtasks(!showSubtasks)}
              active={pendingSubtasks.length > 0 || showSubtasks}
            />

            {/* More options */}
            <button
              type="button"
              className={`p-1.5 rounded-md border transition-colors ${isDark ? 'border-[#333] hover:bg-[#252525] text-[#666]' : 'border-gray-200 hover:bg-gray-50 text-gray-400'}`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Subtasks section with full properties */}
          {showSubtasks && (
            <div className={`px-4 py-3 ${isDark ? 'border-t border-[#252525]' : 'border-t border-gray-100'}`}>
              {/* List of pending subtasks */}
              {pendingSubtasks.length > 0 && (
                <div className="space-y-2 mb-3">
                  {pendingSubtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className={`group rounded-lg border ${isDark ? 'border-[#333] bg-[#1A1A1A]' : 'border-gray-200 bg-gray-50'} p-2`}
                    >
                      {/* Subtask header */}
                      <div className="flex items-center gap-2">
                        {/* Status icon */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubtaskDropdown(subtaskDropdown?.id === subtask.id && subtaskDropdown?.type === 'status' ? null : { id: subtask.id, type: 'status' });
                            }}
                            className={`p-0.5 rounded transition-colors ${isDark ? 'hover:bg-[#333]' : 'hover:bg-gray-200'}`}
                          >
                            {subtask.status === 'done' ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : subtask.status === 'in_progress' ? (
                              <Clock className="w-4 h-4 text-yellow-500" />
                            ) : (
                              <Circle className={`w-4 h-4 ${isDark ? 'text-[#555]' : 'text-gray-400'}`} strokeWidth={1.5} />
                            )}
                          </button>
                          {subtaskDropdown?.id === subtask.id && subtaskDropdown?.type === 'status' && (
                            <div className={`absolute top-full left-0 mt-1 z-50 py-1 rounded-lg shadow-lg border ${isDark ? 'bg-[#1A1A1A] border-[#333]' : 'bg-white border-gray-200'}`}>
                              {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateSubtask(subtask.id, { status: s });
                                    setSubtaskDropdown(null);
                                  }}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-100'}`}
                                >
                                  {s === 'done' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : s === 'in_progress' ? <Clock className="w-3.5 h-3.5 text-yellow-500" /> : <Circle className="w-3.5 h-3.5" strokeWidth={1.5} />}
                                  <span className={isDark ? 'text-white' : 'text-gray-900'}>{statusConfig[s].label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Title */}
                        <span className={`flex-1 text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {subtask.title}
                        </span>
                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSubtask(subtask.id);
                          }}
                          className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all ${isDark ? 'hover:bg-[#333] text-[#555] hover:text-red-400' : 'hover:bg-gray-100 text-gray-400 hover:text-red-500'}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Subtask properties row */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {/* Priority */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubtaskDropdown(subtaskDropdown?.id === subtask.id && subtaskDropdown?.type === 'priority' ? null : { id: subtask.id, type: 'priority' });
                            }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border ${isDark ? 'border-[#333] hover:bg-[#252525]' : 'border-gray-200 hover:bg-gray-100'}`}
                          >
                            <div className={`w-2 h-2 rounded-sm ${subtask.priority === 4 ? 'bg-red-500' : subtask.priority === 3 ? 'bg-orange-500' : subtask.priority === 2 ? 'bg-yellow-500' : subtask.priority === 1 ? 'bg-blue-500' : (isDark ? 'bg-[#444]' : 'bg-gray-300')}`} />
                            <span className={isDark ? 'text-[#888]' : 'text-gray-500'}>{priorityConfig[subtask.priority].label}</span>
                          </button>
                          {subtaskDropdown?.id === subtask.id && subtaskDropdown?.type === 'priority' && (
                            <div className={`absolute top-full left-0 mt-1 z-50 py-1 rounded-lg shadow-lg border min-w-[100px] ${isDark ? 'bg-[#1A1A1A] border-[#333]' : 'bg-white border-gray-200'}`}>
                              {([0, 1, 2, 3, 4] as TaskPriority[]).map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateSubtask(subtask.id, { priority: p });
                                    setSubtaskDropdown(null);
                                  }}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-100'}`}
                                >
                                  <div className={`w-2 h-2 rounded-sm ${p === 4 ? 'bg-red-500' : p === 3 ? 'bg-orange-500' : p === 2 ? 'bg-yellow-500' : p === 1 ? 'bg-blue-500' : (isDark ? 'bg-[#444]' : 'bg-gray-300')}`} />
                                  <span className={isDark ? 'text-white' : 'text-gray-900'}>{priorityConfig[p].label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Assignee */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubtaskDropdown(subtaskDropdown?.id === subtask.id && subtaskDropdown?.type === 'assignee' ? null : { id: subtask.id, type: 'assignee' });
                            }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border ${isDark ? 'border-[#333] hover:bg-[#252525]' : 'border-gray-200 hover:bg-gray-100'}`}
                          >
                            <User className={`w-3 h-3 ${isDark ? 'text-[#666]' : 'text-gray-400'}`} />
                            <span className={isDark ? 'text-[#888]' : 'text-gray-500'}>
                              {subtask.assignee ? members.find(m => m.user_id === subtask.assignee)?.user?.full_name || 'Assigned' : 'Assignee'}
                            </span>
                          </button>
                          {subtaskDropdown?.id === subtask.id && subtaskDropdown?.type === 'assignee' && (
                            <div className={`absolute top-full left-0 mt-1 z-50 py-1 rounded-lg shadow-lg border min-w-[120px] ${isDark ? 'bg-[#1A1A1A] border-[#333]' : 'bg-white border-gray-200'}`}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateSubtask(subtask.id, { assignee: undefined });
                                  setSubtaskDropdown(null);
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-100'}`}
                              >
                                <User className="w-3 h-3" />
                                <span className={isDark ? 'text-[#888]' : 'text-gray-500'}>Unassigned</span>
                              </button>
                              {members.map((member) => (
                                <button
                                  key={member.user_id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateSubtask(subtask.id, { assignee: member.user_id });
                                    setSubtaskDropdown(null);
                                  }}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-100'}`}
                                >
                                  <div className="w-4 h-4 rounded-full bg-[#5E5CE6] flex items-center justify-center text-[8px] text-white">
                                    {member.user?.full_name?.charAt(0) || member.user?.email?.charAt(0) || '?'}
                                  </div>
                                  <span className={isDark ? 'text-white' : 'text-gray-900'}>{member.user?.full_name || member.user?.email}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Date */}
                        <div className="relative">
                          <input
                            type="date"
                            value={subtask.due_date || ''}
                            onChange={(e) => updateSubtask(subtask.id, { due_date: e.target.value || undefined })}
                            className={`px-1.5 py-0.5 text-[10px] rounded border bg-transparent ${isDark ? 'border-[#333] text-[#888]' : 'border-gray-200 text-gray-500'}`}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {/* Time */}
                        {subtask.due_date && (
                          <input
                            type="time"
                            value={subtask.due_time || ''}
                            onChange={(e) => updateSubtask(subtask.id, { due_time: e.target.value || undefined })}
                            className={`px-1.5 py-0.5 text-[10px] rounded border bg-transparent ${isDark ? 'border-[#333] text-[#888]' : 'border-gray-200 text-gray-500'}`}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Input to add new subtask */}
              <div className={`flex items-center gap-2 rounded-lg border ${isDark ? 'border-[#333] bg-[#1A1A1A]' : 'border-gray-200 bg-gray-50'} px-2 py-1.5`}>
                <Circle className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-[#444]' : 'text-gray-300'}`} strokeWidth={1.5} />
                <input
                  ref={subtaskInputRef}
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                      e.preventDefault();
                      e.stopPropagation();
                      addSubtask();
                    }
                  }}
                  placeholder="Add subtask..."
                  className={`flex-1 bg-transparent text-sm focus:outline-none ${isDark ? 'text-white placeholder:text-[#444]' : 'text-gray-900 placeholder:text-gray-400'}`}
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[CreateTaskModal] Plus button mousedown, title:', newSubtaskTitle);
                    if (newSubtaskTitle.trim()) {
                      addSubtask();
                    }
                  }}
                  className={`p-1 rounded transition-colors ${newSubtaskTitle.trim() ? 'text-[#5E5CE6] hover:bg-[#5E5CE6]/10 cursor-pointer' : (isDark ? 'text-[#333]' : 'text-gray-300')} ${!newSubtaskTitle.trim() ? 'cursor-not-allowed' : ''}`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-4 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-md text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Footer - Linear style */}
          <div className={`flex items-center justify-between px-4 py-3 ${isDark ? 'border-t border-[#333]' : 'border-t border-gray-100'}`}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-[#333] text-[#666]' : 'hover:bg-gray-100 text-gray-400'}`}
              >
                <Paperclip className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Create more toggle */}
              <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDark ? 'text-[#888]' : 'text-gray-500'}`}>
                <div
                  onClick={() => setCreateMore(!createMore)}
                  className={`
                    w-8 h-4 rounded-full transition-colors relative cursor-pointer
                    ${createMore
                      ? 'bg-blue-500'
                      : (isDark ? 'bg-[#333]' : 'bg-gray-200')
                    }
                  `}
                >
                  <div
                    className={`
                      absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform
                      ${createMore ? 'translate-x-4' : 'translate-x-0.5'}
                    `}
                  />
                </div>
                <span>Create more</span>
              </label>

              {/* Create button */}
              <button
                type="submit"
                className="px-4 py-1.5 text-sm font-medium text-white bg-[#5E5CE6] hover:bg-[#5250D3] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={loading || !title.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  'Create issue'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
