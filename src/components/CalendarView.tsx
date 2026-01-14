'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Circle,
  Clock,
  RefreshCw,
  Link2,
  Trash2,
  Eye,
  Check,
  MoreHorizontal,
  X,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  isSameMonth,
  isSameDay,
  isSameWeek,
  isToday,
  parseISO,
  getHours,
  getMinutes,
  differenceInMinutes,
  setHours,
  setMinutes,
} from 'date-fns';
import { getSession, connectGoogleCalendar, getGoogleCalendarStatus } from '@/lib/supabase';
import { Task, Subtask } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  color?: string;
  htmlLink?: string;
  status?: string;
  taskId?: string;
  subtaskId?: string;
  taskStatus?: string;
  isFromApp: boolean;
  isSubtask?: boolean;
  parentTaskTitle?: string;
}

interface CalendarViewProps {
  tasks?: Task[];
  subtasks?: Subtask[];
  onTaskClick?: (taskId: string) => void;
  onSubtaskClick?: (subtaskId: string, taskId: string) => void;
  onEventComplete?: (eventId: string, taskId: string) => void;
  onTaskStatusChange?: (taskId: string, status: string) => void;
  onCreateTask?: (data: { due_date: string; due_time: string; duration: number }) => void;
  onDeleteTask?: (taskId: string) => void;
  onDeleteSubtask?: (subtaskId: string) => void;
  onTaskMove?: (taskId: string, data: { due_date: string; due_time: string }) => void;
  onSubtaskMove?: (subtaskId: string, data: { due_date: string; due_time: string }) => void;
}

interface DragState {
  isDragging: boolean;
  startY: number;
  currentY: number;
  day: Date | null;
  startHour: number;
  startMinutes: number;
}

type ViewMode = 'day' | 'week' | 'month';

// Hours for day/week view (7am to 11pm)
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7);

export default function CalendarView({ tasks = [], subtasks = [], onTaskClick, onSubtaskClick, onEventComplete, onTaskStatusChange, onCreateTask, onDeleteTask, onDeleteSubtask, onTaskMove, onSubtaskMove }: CalendarViewProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [connected, setConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);

  // Theme colors
  const colors = {
    bg: isDark ? 'bg-[#0D0D0D]' : 'bg-white',
    bgSecondary: isDark ? 'bg-[#1A1A1A]' : 'bg-gray-50',
    bgTertiary: isDark ? 'bg-[#131313]' : 'bg-gray-100',
    bgHover: isDark ? 'hover:bg-[#2E2E2E]' : 'hover:bg-gray-200',
    bgSelected: isDark ? 'bg-[#1A1A1A]' : 'bg-blue-50',
    border: isDark ? 'border-[#2E2E2E]' : 'border-gray-200',
    borderLight: isDark ? 'border-[#1A1A1A]' : 'border-gray-100',
    text: isDark ? 'text-[#E0E0E0]' : 'text-gray-900',
    textSecondary: isDark ? 'text-[#A0A0A0]' : 'text-gray-600',
    textMuted: isDark ? 'text-[#6B6B6B]' : 'text-gray-400',
    textDimmed: isDark ? 'text-[#4A4A4A]' : 'text-gray-300',
  };

  // Drag to create state
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startY: 0,
    currentY: 0,
    day: null,
    startHour: 0,
    startMinutes: 0,
  });

  // Hover popup state
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [popupEventId, setPopupEventId] = useState<string | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);

  // Event drag state (for moving existing events)
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [dragEventY, setDragEventY] = useState<number>(0);
  const [dragEventDay, setDragEventDay] = useState<Date | null>(null);
  const [wasDragging, setWasDragging] = useState(false); // Track if we just finished dragging

  // Convert tasks to calendar events
  const taskEvents: CalendarEvent[] = useMemo(() => {
    return tasks
      .filter(task => task.due_date && !task.google_calendar_event_id)
      .map(task => {
        const startDate = task.due_date!;
        let startDateTime = startDate;
        let endDateTime = startDate;

        if (task.due_time) {
          startDateTime = `${startDate}T${task.due_time}`;
          const duration = task.duration || 60;
          const start = parseISO(startDateTime);
          if (!isNaN(start.getTime())) {
            const end = new Date(start.getTime() + duration * 60000);
            endDateTime = end.toISOString();
          }
        }

        return {
          id: `task-${task.id}`,
          title: task.title,
          description: task.description || undefined,
          start: startDateTime,
          end: endDateTime,
          allDay: !task.due_time,
          taskId: task.id,
          taskStatus: task.status,
          isFromApp: true,
          isSubtask: false,
        };
      });
  }, [tasks]);

  // Convert subtasks to calendar events (with different color)
  const subtaskEvents: CalendarEvent[] = useMemo(() => {
    return subtasks
      .filter(subtask => subtask.due_date)
      .map(subtask => {
        const parentTask = tasks.find(t => t.id === subtask.task_id);
        const startDate = subtask.due_date!;
        let startDateTime = startDate;
        let endDateTime = startDate;

        if (subtask.due_time) {
          startDateTime = `${startDate}T${subtask.due_time}`;
          const duration = subtask.duration || 30; // Default 30 min for subtasks
          const start = parseISO(startDateTime);
          if (!isNaN(start.getTime())) {
            const end = new Date(start.getTime() + duration * 60000);
            endDateTime = end.toISOString();
          }
        }

        return {
          id: `subtask-${subtask.id}`,
          title: subtask.title,
          description: subtask.description || undefined,
          start: startDateTime,
          end: endDateTime,
          allDay: !subtask.due_time,
          taskId: subtask.task_id,
          subtaskId: subtask.id,
          taskStatus: subtask.status,
          isFromApp: true,
          isSubtask: true,
          parentTaskTitle: parentTask?.title,
          color: '#F59E0B', // Orange/amber for subtasks - more distinct from purple tasks
        };
      });
  }, [subtasks, tasks]);

  const events = useMemo(() => {
    return [...googleEvents, ...taskEvents, ...subtaskEvents];
  }, [googleEvents, taskEvents, subtaskEvents]);

  // Check connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const status = await getGoogleCalendarStatus();
        setConnected(status.connected);
      } catch (error) {
        console.error('Error checking calendar status:', error);
      } finally {
        setCheckingConnection(false);
      }
    };
    checkConnection();

    // Also check if we just connected (from URL param)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('google_connected') === 'true') {
        // Remove the param from URL without reload
        window.history.replaceState({}, '', window.location.pathname);
        // Re-check connection after a short delay
        setTimeout(checkConnection, 500);
      }
    }
  }, []);

  // Fetch Google events
  const fetchGoogleEvents = async () => {
    if (!connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const session = await getSession();
      if (!session) {
        setConnected(false);
        setLoading(false);
        return;
      }

      let start: Date, end: Date;
      if (viewMode === 'day') {
        start = startOfDay(currentDate);
        end = endOfDay(currentDate);
      } else if (viewMode === 'week') {
        start = startOfWeek(currentDate, { weekStartsOn: 1 });
        end = endOfWeek(currentDate, { weekStartsOn: 1 });
      } else {
        start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
        end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
      }

      const response = await fetch(
        `/api/calendar/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}&maxResults=200`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (!response.ok) {
        const data = await response.json();
        if (data.needsAuth) setConnected(false);
        setLoading(false);
        return;
      }

      const data = await response.json();
      setGoogleEvents(data.events || []);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected) {
      fetchGoogleEvents();
    } else {
      setLoading(false);
    }
  }, [currentDate, connected, viewMode]);

  // Navigation
  const goToPrevious = () => {
    if (viewMode === 'day') setCurrentDate(subDays(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const goToNext = () => {
    if (viewMode === 'day') setCurrentDate(addDays(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  // Connect Google Calendar
  const handleConnectCalendar = async () => {
    try {
      console.log('[CalendarView] Connecting to Google Calendar...');
      const authUrl = await connectGoogleCalendar();
      console.log('[CalendarView] Auth URL received:', authUrl);
      if (authUrl) {
        console.log('[CalendarView] Redirecting to:', authUrl);
        window.location.href = authUrl;
      } else {
        console.error('[CalendarView] No auth URL received');
      }
    } catch (error) {
      console.error('Error connecting to Google Calendar:', error);
    }
  };

  // Mark as done
  const handleMarkAsDone = async (event: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!event.taskId || !onTaskStatusChange) return;

    if (event.isSubtask && event.subtaskId) {
      // For subtasks, we need to update subtask status
      // This will be handled by parent component
      onTaskStatusChange(event.subtaskId, event.taskStatus === 'done' ? 'todo' : 'done');
    } else {
      onTaskStatusChange(event.taskId, event.taskStatus === 'done' ? 'todo' : 'done');
    }
    if (onEventComplete) onEventComplete(event.id, event.taskId);
    setPopupEventId(null);
  };

  // Delete event
  const handleDeleteEvent = async (event: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (event.isSubtask && event.subtaskId && onDeleteSubtask) {
      onDeleteSubtask(event.subtaskId);
    } else if (event.taskId && onDeleteTask) {
      onDeleteTask(event.taskId);
    }
    setPopupEventId(null);
  };

  // Open event details
  const handleOpenEvent = (event: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (event.isSubtask && event.subtaskId && event.taskId) {
      onSubtaskClick?.(event.subtaskId, event.taskId);
    } else if (event.taskId) {
      onTaskClick?.(event.taskId);
    }
    setPopupEventId(null);
  };

  // Show popup for event
  const handleShowPopup = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopupPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
    setPopupEventId(event.id);
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-event-popup]') && !target.closest('[data-event-popup-trigger]')) {
        setPopupEventId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Handle global mouseup for event dragging
  useEffect(() => {
    if (!draggingEvent) return;

    const handleGlobalMouseUp = () => {
      if (draggingEvent && dragEventDay) {
        const { hour, minutes } = yToTime(dragEventY);
        const due_date = format(dragEventDay, 'yyyy-MM-dd');
        const due_time = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

        if (draggingEvent.isSubtask && draggingEvent.subtaskId && onSubtaskMove) {
          onSubtaskMove(draggingEvent.subtaskId, { due_date, due_time });
        } else if (draggingEvent.taskId && onTaskMove) {
          onTaskMove(draggingEvent.taskId, { due_date, due_time });
        }
      }
      setDraggingEvent(null);
      setDragEventDay(null);
      // Set wasDragging to prevent click from firing after drag
      setWasDragging(true);
      setTimeout(() => setWasDragging(false), 100);
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [draggingEvent, dragEventDay, dragEventY, onTaskMove, onSubtaskMove]);

  // Handle event drag start
  const handleEventDragStart = (event: CalendarEvent, e: React.MouseEvent, day: Date) => {
    if (!event.isFromApp) return; // Only allow dragging app events
    e.preventDefault();
    e.stopPropagation();
    setDraggingEvent(event);
    setDragEventDay(day);
    // Get the timeline container, not the event element
    const timeline = e.currentTarget.closest('[data-timeline]') as HTMLElement;
    if (timeline) {
      const rect = timeline.getBoundingClientRect();
      setDragEventY(e.clientY - rect.top);
    }
  };

  // Handle event drag move
  const handleEventDragMove = (e: React.MouseEvent, day: Date) => {
    if (!draggingEvent) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragEventY(e.clientY - rect.top);
    setDragEventDay(day);
  };

  // Handle event drag end
  const handleEventDragEnd = () => {
    if (!draggingEvent || !dragEventDay) {
      setDraggingEvent(null);
      return;
    }

    const { hour, minutes } = yToTime(dragEventY);
    const due_date = format(dragEventDay, 'yyyy-MM-dd');
    const due_time = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    if (draggingEvent.isSubtask && draggingEvent.subtaskId && onSubtaskMove) {
      onSubtaskMove(draggingEvent.subtaskId, { due_date, due_time });
    } else if (draggingEvent.taskId && onTaskMove) {
      onTaskMove(draggingEvent.taskId, { due_date, due_time });
    }

    setDraggingEvent(null);
    setDragEventDay(null);
    // Set wasDragging to prevent click from firing after drag
    setWasDragging(true);
    setTimeout(() => setWasDragging(false), 100);
  };

  // Get events for a day
  const getEventsForDay = (day: Date): CalendarEvent[] => {
    return events.filter(event => {
      const eventDate = parseISO(event.start);
      return isSameDay(eventDate, day);
    });
  };

  // Generate calendar days for month view
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days: Date[] = [];
    let day = startDate;
    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentDate]);

  // Generate week days
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  // Get title based on view mode
  const getTitle = () => {
    if (viewMode === 'day') return format(currentDate, 'EEEE, d MMMM yyyy');
    if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      if (isSameMonth(start, end)) {
        return `${format(start, 'd')} - ${format(end, 'd MMMM yyyy')}`;
      }
      return `${format(start, 'd MMM')} - ${format(end, 'd MMM yyyy')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  };

  // Calculate event position in timeline
  const getEventPosition = (event: CalendarEvent) => {
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    const startHour = getHours(start);
    const startMin = getMinutes(start);
    const duration = differenceInMinutes(end, start) || 60;

    const top = ((startHour - 7) * 60 + startMin) * (48 / 60); // 48px per hour
    const height = Math.max(duration * (48 / 60), 20);

    return { top, height };
  };

  // Convert Y position to time (48px per hour)
  const yToTime = (y: number) => {
    const totalMinutes = (y / 48) * 60;
    const hour = Math.floor(totalMinutes / 60) + 7; // Start at 7am
    const minutes = Math.round((totalMinutes % 60) / 15) * 15; // Round to 15min
    return { hour: Math.min(Math.max(hour, 7), 23), minutes: Math.min(minutes, 45) };
  };

  // Handle mouse down on timeline to start drag
  const handleTimelineMouseDown = (e: React.MouseEvent, day: Date) => {
    if (!onCreateTask) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const { hour, minutes } = yToTime(y);

    setDragState({
      isDragging: true,
      startY: y,
      currentY: y,
      day,
      startHour: hour,
      startMinutes: minutes,
    });
  };

  // Handle mouse move during drag
  const handleTimelineMouseMove = (e: React.MouseEvent) => {
    if (!dragState.isDragging) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(0, e.clientY - rect.top);

    setDragState(prev => ({
      ...prev,
      currentY: y,
    }));
  };

  // Handle mouse up to complete drag
  const handleTimelineMouseUp = () => {
    if (!dragState.isDragging || !dragState.day || !onCreateTask) {
      setDragState(prev => ({ ...prev, isDragging: false }));
      return;
    }

    const startY = Math.min(dragState.startY, dragState.currentY);
    const endY = Math.max(dragState.startY, dragState.currentY);

    const startTime = yToTime(startY);
    const endTime = yToTime(endY);

    // Calculate duration in minutes
    const startMinutes = startTime.hour * 60 + startTime.minutes;
    const endMinutes = endTime.hour * 60 + endTime.minutes;
    const duration = Math.max(endMinutes - startMinutes, 15); // Minimum 15 minutes

    // Format date and time
    const due_date = format(dragState.day, 'yyyy-MM-dd');
    const due_time = `${String(startTime.hour).padStart(2, '0')}:${String(startTime.minutes).padStart(2, '0')}`;

    // Reset drag state
    setDragState({
      isDragging: false,
      startY: 0,
      currentY: 0,
      day: null,
      startHour: 0,
      startMinutes: 0,
    });

    // Create task
    onCreateTask({ due_date, due_time, duration });
  };

  // Get drag preview position and height
  const getDragPreview = () => {
    if (!dragState.isDragging) return null;

    const top = Math.min(dragState.startY, dragState.currentY);
    const height = Math.max(Math.abs(dragState.currentY - dragState.startY), 12);

    const startTime = yToTime(Math.min(dragState.startY, dragState.currentY));
    const endTime = yToTime(Math.max(dragState.startY, dragState.currentY));

    return {
      top,
      height,
      startTime: `${String(startTime.hour).padStart(2, '0')}:${String(startTime.minutes).padStart(2, '0')}`,
      endTime: `${String(endTime.hour).padStart(2, '0')}:${String(endTime.minutes).padStart(2, '0')}`,
    };
  };

  // Render timeline event
  const renderTimelineEvent = (event: CalendarEvent, index: number, total: number, day: Date) => {
    if (event.allDay) return null;

    const { top, height } = getEventPosition(event);
    const width = total > 1 ? `${90 / total}%` : '90%';
    const left = total > 1 ? `${5 + (index * (90 / total))}%` : '5%';
    const isHovered = hoveredEventId === event.id;
    const isPopupOpen = popupEventId === event.id;
    const isDragging = draggingEvent?.id === event.id;

    // Calculate position for dragging event
    const displayTop = isDragging ? dragEventY : top;

    return (
      <div
        key={event.id}
        className={`
          absolute rounded-md px-2 py-1 text-xs overflow-hidden
          transition-all group select-none
          ${event.isSubtask ? 'bg-[#F59E0B]' : event.isFromApp ? 'bg-[#5E5CE6]' : 'bg-[#10B981]'}
          ${event.taskStatus === 'done' ? 'opacity-40' : ''}
          ${isDragging ? 'ring-2 ring-white/50 shadow-xl scale-[1.05] z-50 cursor-grabbing' :
            isHovered || isPopupOpen ? 'ring-2 ring-white/30 shadow-lg scale-[1.02] z-30 cursor-grab' :
            'hover:ring-2 hover:ring-white/20 hover:shadow-md z-10 cursor-grab'}
        `}
        style={{ top: `${displayTop}px`, height: `${height}px`, width, left }}
        onMouseEnter={() => !draggingEvent && setHoveredEventId(event.id)}
        onMouseLeave={() => !draggingEvent && setHoveredEventId(null)}
        onMouseDown={(e) => {
          if (event.isFromApp && (onTaskMove || onSubtaskMove)) {
            handleEventDragStart(event, e, day);
          }
        }}
        onClick={(e) => {
          if (!draggingEvent && !wasDragging) {
            e.stopPropagation();
            handleOpenEvent(event, e);
          }
        }}
      >
        {/* Event content */}
        <div className="font-medium text-white truncate pr-6">
          {event.isSubtask && <span className="opacity-70">↳ </span>}
          {event.title}
        </div>
        {height > 30 && (
          <div className="text-white/70 text-[10px]">
            {format(parseISO(event.start), 'HH:mm')}
            {event.isSubtask && event.parentTaskTitle && (
              <span className="ml-1 opacity-60">• {event.parentTaskTitle}</span>
            )}
          </div>
        )}

        {/* Quick actions button (appears on hover) */}
        {event.isFromApp && (
          <button
            data-event-popup-trigger
            onClick={(e) => handleShowPopup(event, e)}
            className={`
              absolute top-1 right-1 p-0.5 rounded
              bg-white/20 hover:bg-white/30 transition-all
              ${isHovered || isPopupOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
            `}
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-white" />
          </button>
        )}

        {/* Popup menu */}
        {isPopupOpen && popupPosition && (
          <div
            data-event-popup
            className={`
              fixed z-50 py-1 min-w-[160px] rounded-lg shadow-xl border
              ${isDark ? 'bg-[#1A1A1A] border-[#2E2E2E]' : 'bg-white border-gray-200'}
            `}
            style={{
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y}px`,
              transform: 'translateX(-50%)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Open details */}
            <button
              onClick={(e) => handleOpenEvent(event, e)}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                ${isDark ? 'hover:bg-[#2E2E2E] text-[#E0E0E0]' : 'hover:bg-gray-100 text-gray-700'}
              `}
            >
              <Eye className="w-4 h-4" />
              Open details
            </button>

            {/* Mark as done / undone */}
            <button
              onClick={(e) => handleMarkAsDone(event, e)}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                ${isDark ? 'hover:bg-[#2E2E2E] text-[#E0E0E0]' : 'hover:bg-gray-100 text-gray-700'}
              `}
            >
              {event.taskStatus === 'done' ? (
                <>
                  <Circle className="w-4 h-4" />
                  Mark as todo
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  Mark as done
                </>
              )}
            </button>

            {/* Divider */}
            <div className={`my-1 border-t ${isDark ? 'border-[#2E2E2E]' : 'border-gray-200'}`} />

            {/* Delete */}
            <button
              onClick={(e) => handleDeleteEvent(event, e)}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-500
                ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}
              `}
            >
              <Trash2 className="w-4 h-4" />
              Delete {event.isSubtask ? 'subtask' : 'task'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const selectedDateEvents = selectedDate ? getEventsForDay(selectedDate) : [];

  return (
    <div className={`flex flex-col h-full ${colors.bg}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-3 border-b ${colors.border}`}>
        <div className="flex items-center gap-4">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={goToPrevious}
              className={`p-1.5 ${colors.bgHover} rounded transition-colors`}
            >
              <ChevronLeft className={`w-4 h-4 ${colors.textMuted}`} />
            </button>
            <button
              onClick={goToNext}
              className={`p-1.5 ${colors.bgHover} rounded transition-colors`}
            >
              <ChevronRight className={`w-4 h-4 ${colors.textMuted}`} />
            </button>
          </div>

          {/* Title */}
          <h1 className={`text-sm font-medium ${colors.text} min-w-[200px]`}>
            {getTitle()}
          </h1>

          {/* Today button */}
          <button
            onClick={goToToday}
            className={`
              px-2.5 py-1 text-xs font-medium rounded transition-colors
              ${isToday(currentDate)
                ? 'bg-[#5E5CE6] text-white'
                : `${colors.textSecondary} hover:${colors.text} ${colors.bgHover}`
              }
            `}
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode switcher */}
          <div className={`flex items-center ${colors.bgSecondary} rounded-lg p-0.5`}>
            {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`
                  px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize
                  ${viewMode === mode
                    ? `${isDark ? 'bg-[#2E2E2E]' : 'bg-white shadow-sm'} ${colors.text}`
                    : `${colors.textMuted} hover:${colors.textSecondary}`
                  }
                `}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Refresh */}
          {connected && (
            <button
              onClick={fetchGoogleEvents}
              disabled={loading}
              className={`p-1.5 ${colors.bgHover} rounded transition-colors`}
            >
              <RefreshCw className={`w-4 h-4 ${colors.textMuted} ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}

          {/* Connection status */}
          {!checkingConnection && (
            connected ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#10B981]/10 rounded">
                <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full" />
                <span className="text-xs text-[#10B981]">Connected</span>
              </div>
            ) : (
              <button
                onClick={handleConnectCalendar}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs ${colors.textSecondary} hover:${colors.text} ${colors.bgHover} rounded transition-colors`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Connect
              </button>
            )
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Calendar Area */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'month' ? (
            // Month View
            <div className="h-full flex flex-col">
              {/* Day headers */}
              <div className={`grid grid-cols-7 border-b ${colors.border}`}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <div key={day} className="py-2 text-center">
                    <span className={`text-xs font-medium ${colors.textMuted}`}>{day}</span>
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="flex-1 grid grid-cols-7 grid-rows-6">
                {calendarDays.map((day, index) => {
                  const dayEvents = getEventsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isTodayDate = isToday(day);

                  return (
                    <div
                      key={index}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        border-r border-b ${colors.borderLight} p-1 cursor-pointer transition-colors
                        ${!isCurrentMonth ? (isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50') : ''}
                        ${isSelected ? colors.bgSelected : ''}
                        ${isDark ? 'hover:bg-[#1A1A1A]' : 'hover:bg-gray-100'}
                      `}
                    >
                      <div className="flex items-center justify-center mb-1">
                        <span
                          className={`
                            w-6 h-6 flex items-center justify-center text-xs rounded-full
                            ${isTodayDate ? 'bg-[#5E5CE6] text-white font-medium' : ''}
                            ${!isCurrentMonth ? colors.textDimmed : colors.textSecondary}
                          `}
                        >
                          {format(day, 'd')}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            className={`
                              text-[10px] px-1 py-0.5 rounded truncate
                              ${event.isFromApp ? 'bg-[#5E5CE6]/20 text-[#818CF8]' : (isDark ? 'bg-[#2E2E2E] text-[#A0A0A0]' : 'bg-gray-200 text-gray-600')}
                              ${event.taskStatus === 'done' ? 'line-through opacity-50' : ''}
                            `}
                          >
                            {event.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className={`text-[10px] ${colors.textMuted} px-1`}>+{dayEvents.length - 3}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : viewMode === 'week' ? (
            // Week View
            <div className="h-full flex flex-col">
              {/* Day headers */}
              <div className={`grid grid-cols-8 border-b ${colors.border}`}>
                <div className="w-14" /> {/* Time column spacer */}
                {weekDays.map((day, i) => (
                  <div
                    key={i}
                    className={`py-2 text-center border-l ${colors.borderLight} ${isToday(day) ? 'bg-[#5E5CE6]/5' : ''}`}
                    onClick={() => setSelectedDate(day)}
                  >
                    <div className={`text-xs ${colors.textMuted}`}>{format(day, 'EEE')}</div>
                    <div className={`
                      text-lg font-medium mt-0.5
                      ${isToday(day) ? 'text-[#5E5CE6]' : colors.text}
                    `}>
                      {format(day, 'd')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Timeline grid */}
              <div className="flex-1 overflow-auto">
                <div className="grid grid-cols-8 min-h-full" style={{ height: `${HOURS.length * 48}px` }}>
                  {/* Time labels */}
                  <div className="w-14 relative">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className={`absolute w-full text-right pr-2 text-[10px] ${colors.textDimmed}`}
                        style={{ top: `${(hour - 7) * 48 - 6}px` }}
                      >
                        {format(setHours(new Date(), hour), 'HH:mm')}
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {weekDays.map((day, dayIndex) => {
                    const dayEvents = getEventsForDay(day).filter(e => !e.allDay);
                    const dragPreview = getDragPreview();
                    const isThisDayDragging = dragState.isDragging && dragState.day && isSameDay(dragState.day, day);

                    return (
                      <div
                        key={dayIndex}
                        data-timeline
                        className={`relative border-l ${colors.borderLight} ${isToday(day) ? 'bg-[#5E5CE6]/5' : ''} ${draggingEvent ? 'cursor-grabbing' : onCreateTask ? 'cursor-crosshair' : ''}`}
                        onMouseDown={(e) => {
                          if (!draggingEvent) handleTimelineMouseDown(e, day);
                        }}
                        onMouseMove={(e) => {
                          if (draggingEvent) {
                            handleEventDragMove(e, day);
                          } else {
                            handleTimelineMouseMove(e);
                          }
                        }}
                        onMouseUp={() => {
                          if (draggingEvent) {
                            handleEventDragEnd();
                          } else {
                            handleTimelineMouseUp();
                          }
                        }}
                        onMouseLeave={() => {
                          if (dragState.isDragging) handleTimelineMouseUp();
                        }}
                      >
                        {/* Hour lines */}
                        {HOURS.map((hour) => (
                          <div
                            key={hour}
                            className={`absolute w-full border-t ${colors.borderLight} pointer-events-none`}
                            style={{ top: `${(hour - 7) * 48}px` }}
                          />
                        ))}

                        {/* Drag preview */}
                        {isThisDayDragging && dragPreview && (
                          <div
                            className="absolute left-1 right-1 bg-[#5E5CE6]/30 border-2 border-[#5E5CE6] border-dashed rounded-md pointer-events-none z-20"
                            style={{
                              top: `${dragPreview.top}px`,
                              height: `${Math.max(dragPreview.height, 24)}px`,
                            }}
                          >
                            <div className="px-2 py-0.5 text-xs text-[#5E5CE6] font-medium">
                              {dragPreview.startTime} - {dragPreview.endTime}
                            </div>
                          </div>
                        )}

                        {/* Current time indicator */}
                        {isToday(day) && (
                          <div
                            className="absolute w-full h-0.5 bg-[#EF4444] z-10 pointer-events-none"
                            style={{
                              top: `${((getHours(new Date()) - 7) * 60 + getMinutes(new Date())) * (48 / 60)}px`,
                            }}
                          >
                            <div className="absolute -left-1 -top-1 w-2 h-2 bg-[#EF4444] rounded-full" />
                          </div>
                        )}

                        {/* Events */}
                        {dayEvents.map((event, i) => renderTimelineEvent(event, i, dayEvents.length, day))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            // Day View
            <div className="h-full flex">
              {/* Timeline */}
              <div className="flex-1 overflow-auto">
                <div className="relative" style={{ height: `${HOURS.length * 48}px` }}>
                  {/* Time labels */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className={`absolute left-0 w-14 text-right pr-3 text-[10px] ${colors.textDimmed}`}
                      style={{ top: `${(hour - 7) * 48 - 6}px` }}
                    >
                      {format(setHours(new Date(), hour), 'HH:mm')}
                    </div>
                  ))}

                  {/* Timeline area */}
                  <div
                    data-timeline
                    className={`absolute left-14 right-0 top-0 bottom-0 ${draggingEvent ? 'cursor-grabbing' : onCreateTask ? 'cursor-crosshair' : ''}`}
                    onMouseDown={(e) => {
                      if (!draggingEvent) handleTimelineMouseDown(e, currentDate);
                    }}
                    onMouseMove={(e) => {
                      if (draggingEvent) {
                        handleEventDragMove(e, currentDate);
                      } else {
                        handleTimelineMouseMove(e);
                      }
                    }}
                    onMouseUp={() => {
                      if (draggingEvent) {
                        handleEventDragEnd();
                      } else {
                        handleTimelineMouseUp();
                      }
                    }}
                    onMouseLeave={() => {
                      if (dragState.isDragging) handleTimelineMouseUp();
                    }}
                  >
                    {/* Hour lines */}
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className={`absolute w-full border-t ${colors.borderLight} pointer-events-none`}
                        style={{ top: `${(hour - 7) * 48}px` }}
                      />
                    ))}

                    {/* Drag preview */}
                    {(() => {
                      const dragPreview = getDragPreview();
                      const isThisDayDragging = dragState.isDragging && dragState.day && isSameDay(dragState.day, currentDate);
                      if (!isThisDayDragging || !dragPreview) return null;
                      return (
                        <div
                          className="absolute left-2 right-2 bg-[#5E5CE6]/30 border-2 border-[#5E5CE6] border-dashed rounded-md pointer-events-none z-20"
                          style={{
                            top: `${dragPreview.top}px`,
                            height: `${Math.max(dragPreview.height, 24)}px`,
                          }}
                        >
                          <div className="px-2 py-0.5 text-xs text-[#5E5CE6] font-medium">
                            {dragPreview.startTime} - {dragPreview.endTime}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Current time indicator */}
                    {isToday(currentDate) && (
                      <div
                        className="absolute w-full h-0.5 bg-[#EF4444] z-10 pointer-events-none"
                        style={{
                          top: `${((getHours(new Date()) - 7) * 60 + getMinutes(new Date())) * (48 / 60)}px`,
                        }}
                      >
                        <div className="absolute -left-1 -top-1 w-2 h-2 bg-[#EF4444] rounded-full" />
                      </div>
                    )}

                    {/* Events */}
                    {getEventsForDay(currentDate)
                      .filter(e => !e.allDay)
                      .map((event, i, arr) => renderTimelineEvent(event, i, arr.length, currentDate))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className={`w-72 border-l ${colors.border} ${colors.bg} flex flex-col`}>
          {/* Panel header */}
          <div className={`px-4 py-3 border-b ${colors.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-sm font-medium ${colors.text}`}>
                  {selectedDate ? format(selectedDate, 'EEEE') : 'Select a day'}
                </h3>
                {selectedDate && (
                  <p className={`text-xs ${colors.textMuted}`}>
                    {format(selectedDate, 'd MMMM yyyy')}
                  </p>
                )}
              </div>
              {selectedDate && isToday(selectedDate) && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[#5E5CE6]/20 text-[#5E5CE6] rounded">
                  Today
                </span>
              )}
            </div>
          </div>

          {/* Events list */}
          <div className="flex-1 overflow-auto">
            {!selectedDate ? (
              <div className={`flex items-center justify-center h-full text-sm ${colors.textMuted}`}>
                Select a day to see events
              </div>
            ) : selectedDateEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className={`w-10 h-10 rounded-full ${colors.bgSecondary} flex items-center justify-center mb-3`}>
                  <CalendarIcon className={`w-5 h-5 ${colors.textDimmed}`} />
                </div>
                <p className={`text-sm ${colors.textMuted}`}>No events</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {selectedDateEvents.map(event => (
                  <div
                    key={event.id}
                    className={`
                      group p-2.5 rounded-lg transition-all cursor-pointer
                      ${isDark ? 'hover:bg-[#1A1A1A]' : 'hover:bg-gray-100'}
                      ${event.taskStatus === 'done' ? 'opacity-50' : ''}
                      ${event.isSubtask ? 'border-l-2 border-[#F59E0B] ml-2' : ''}
                    `}
                    onClick={() => handleOpenEvent(event)}
                  >
                    <div className="flex items-start gap-2">
                      {/* Status checkbox / indicator */}
                      <div className="mt-0.5">
                        {event.isFromApp ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsDone(event, e);
                            }}
                            className={`transition-all ${event.taskStatus === 'done' ? '' : 'opacity-60 group-hover:opacity-100'}`}
                          >
                            {event.taskStatus === 'done' ? (
                              <CheckCircle2 className="w-4 h-4 text-[#5E5CE6]" />
                            ) : (
                              <Circle className={`w-4 h-4 ${colors.textMuted} hover:text-[#5E5CE6]`} />
                            )}
                          </button>
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-[#10B981]/30" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          {event.isSubtask && <span className={`text-[10px] ${colors.textMuted}`}>↳</span>}
                          <h4 className={`text-sm ${colors.text} truncate ${event.taskStatus === 'done' ? 'line-through' : ''}`}>
                            {event.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {!event.allDay && (
                            <span className={`text-[10px] ${colors.textMuted} flex items-center gap-1`}>
                              <Clock className="w-3 h-3" />
                              {format(parseISO(event.start), 'HH:mm')}
                            </span>
                          )}
                          {event.isSubtask && event.parentTaskTitle && (
                            <span className={`text-[10px] ${colors.textMuted} truncate`}>
                              {event.parentTaskTitle}
                            </span>
                          )}
                          {event.isFromApp && !event.isSubtask && (
                            <span className="text-[10px] px-1 py-0.5 bg-[#5E5CE6]/10 text-[#5E5CE6] rounded">
                              Task
                            </span>
                          )}
                          {event.isSubtask && (
                            <span className="text-[10px] px-1 py-0.5 bg-[#F59E0B]/10 text-[#F59E0B] rounded">
                              Subtask
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {event.htmlLink && (
                          <a
                            href={event.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`p-1 ${colors.bgHover} rounded transition-all`}
                          >
                            <ExternalLink className={`w-3.5 h-3.5 ${colors.textMuted}`} />
                          </a>
                        )}
                        {event.isFromApp && (
                          <button
                            onClick={(e) => handleDeleteEvent(event, e)}
                            className={`p-1 rounded transition-all hover:bg-red-500/10`}
                            title={`Delete ${event.isSubtask ? 'subtask' : 'task'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats footer */}
          {selectedDate && selectedDateEvents.length > 0 && (
            <div className={`px-4 py-2.5 border-t ${colors.border} ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`}>
              <div className={`flex items-center justify-between text-[10px] ${colors.textMuted}`}>
                <span>{selectedDateEvents.length} event{selectedDateEvents.length !== 1 ? 's' : ''}</span>
                <span>{selectedDateEvents.filter(e => e.taskStatus === 'done').length} done</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
