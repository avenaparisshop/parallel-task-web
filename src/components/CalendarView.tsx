'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  RefreshCw,
  Link2,
  MoreHorizontal,
  Plus,
  Eye,
  Check,
  Circle,
  Trash2,
  Clock,
  ExternalLink,
  CheckCircle2,
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
  isToday,
  parseISO,
  getHours,
  getMinutes,
  differenceInMinutes,
  setHours,
} from 'date-fns';
import { getSession, connectGoogleCalendar, getGoogleCalendarStatus } from '@/lib/supabase';
import { Task, Subtask } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';

// Types
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
  target_date?: string;
}

interface CalendarViewProps {
  tasks?: Task[];
  subtasks?: Subtask[];
  onTaskClick?: (taskId: string) => void;
  onSubtaskClick?: (subtaskId: string, taskId: string) => void;
  onEventComplete?: (eventId: string, taskId: string) => void;
  onTaskStatusChange?: (taskId: string, status: string) => void;
  onCreateTask?: (data: { due_date: string; due_time?: string; duration?: number }) => void;
  onDeleteTask?: (taskId: string) => void;
  onDeleteSubtask?: (subtaskId: string) => void;
  onTaskMove?: (taskId: string, data: { due_date: string; due_time?: string }) => void;
  onSubtaskMove?: (subtaskId: string, data: { due_date: string; due_time?: string }) => void;
}

type ViewMode = 'day' | 'week' | 'month';

// Hours for day/week view (7am to 11pm)
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7);

// ============ Issue Block Component (inspired by Plane) ============
interface IssueBlockProps {
  event: CalendarEvent;
  isDragging?: boolean;
  onOpen: (event: CalendarEvent) => void;
  onMarkDone: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  isDark: boolean;
}

const IssueBlock = React.forwardRef<HTMLDivElement, IssueBlockProps>(
  ({ event, isDragging = false, onOpen, onMarkDone, onDelete, isDark }, ref) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
      if (!isMenuOpen) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setIsMenuOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    const stateColor = event.isSubtask ? '#F59E0B' : event.isFromApp ? '#5E5CE6' : '#10B981';

    return (
      <div
        ref={ref}
        className={`
          group/calendar-block flex h-8 w-full items-center justify-between gap-1.5 rounded-md px-1.5 py-1
          border border-transparent transition-all cursor-grab
          ${isDragging
            ? 'bg-white/20 shadow-xl border-white/50 scale-105 opacity-90'
            : isDark ? 'bg-[#1A1A1A] hover:bg-[#252525]' : 'bg-white hover:bg-gray-50 shadow-sm'
          }
          ${event.taskStatus === 'done' ? 'opacity-50' : ''}
        `}
        onClick={() => onOpen(event)}
      >
        <div className="flex h-full items-center gap-1.5 truncate min-w-0">
          {/* State color indicator */}
          <span
            className="h-full w-1 flex-shrink-0 rounded-sm"
            style={{ backgroundColor: stateColor }}
          />
          {/* Title */}
          <div className={`truncate text-xs font-medium ${isDark ? 'text-[#E0E0E0]' : 'text-gray-800'} ${event.taskStatus === 'done' ? 'line-through' : ''}`}>
            {event.isSubtask && <span className="opacity-60 mr-0.5">↳</span>}
            {event.title}
          </div>
        </div>

        {/* Quick action menu */}
        <div
          ref={menuRef}
          className={`flex-shrink-0 relative ${isMenuOpen ? 'block' : 'hidden group-hover/calendar-block:block'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`p-0.5 rounded transition-colors ${isDark ? 'hover:bg-[#3A3A3A]' : 'hover:bg-gray-200'}`}
          >
            <MoreHorizontal className={`w-3.5 h-3.5 ${isDark ? 'text-[#A0A0A0]' : 'text-gray-500'}`} />
          </button>

          {/* Dropdown menu */}
          {isMenuOpen && (
            <div
              className={`
                absolute right-0 top-full mt-1 z-50 py-1 min-w-[140px] rounded-lg shadow-xl border
                ${isDark ? 'bg-[#1A1A1A] border-[#2E2E2E]' : 'bg-white border-gray-200'}
              `}
            >
              <button
                onClick={() => { onOpen(event); setIsMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${isDark ? 'hover:bg-[#2E2E2E] text-[#E0E0E0]' : 'hover:bg-gray-100 text-gray-700'}`}
              >
                <Eye className="w-3.5 h-3.5" />
                Open
              </button>
              <button
                onClick={() => { onMarkDone(event); setIsMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${isDark ? 'hover:bg-[#2E2E2E] text-[#E0E0E0]' : 'hover:bg-gray-100 text-gray-700'}`}
              >
                {event.taskStatus === 'done' ? <Circle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5 text-green-500" />}
                {event.taskStatus === 'done' ? 'Mark as todo' : 'Mark as done'}
              </button>
              <div className={`my-1 border-t ${isDark ? 'border-[#2E2E2E]' : 'border-gray-200'}`} />
              <button
                onClick={() => { onDelete(event); setIsMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-red-500 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);
IssueBlock.displayName = 'IssueBlock';

// ============ Draggable Issue Block Root (inspired by Plane) ============
interface IssueBlockRootProps {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  onMarkDone: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  isDragDisabled: boolean;
  isDark: boolean;
}

function IssueBlockRoot({ event, onOpen, onMarkDone, onDelete, isDragDisabled, isDark }: IssueBlockRootProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const element = blockRef.current;
    if (!element) return;

    return combine(
      draggable({
        element,
        canDrag: () => !isDragDisabled && event.isFromApp,
        getInitialData: () => ({
          id: event.id,
          taskId: event.taskId,
          subtaskId: event.subtaskId,
          isSubtask: event.isSubtask,
          date: event.target_date || event.start.split('T')[0],
        }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      })
    );
  }, [event, isDragDisabled]);

  return (
    <IssueBlock
      ref={blockRef}
      event={event}
      isDragging={isDragging}
      onOpen={onOpen}
      onMarkDone={onMarkDone}
      onDelete={onDelete}
      isDark={isDark}
    />
  );
}

// ============ Calendar Issue Blocks (inspired by Plane) ============
interface CalendarIssueBlocksProps {
  date: Date;
  events: CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
  onMarkDone: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onQuickAdd?: () => void;
  isDragDisabled: boolean;
  isDark: boolean;
  enableQuickAdd?: boolean;
}

function CalendarIssueBlocks({
  date,
  events,
  onOpen,
  onMarkDone,
  onDelete,
  onQuickAdd,
  isDragDisabled,
  isDark,
  enableQuickAdd = true,
}: CalendarIssueBlocksProps) {
  const MAX_VISIBLE = 4;
  const [showAll, setShowAll] = useState(false);

  const visibleEvents = showAll ? events : events.slice(0, MAX_VISIBLE);
  const hasMore = events.length > MAX_VISIBLE;

  return (
    <div className="space-y-1">
      {visibleEvents.map((event) => (
        <div key={event.id} className="px-1">
          <IssueBlockRoot
            event={event}
            onOpen={onOpen}
            onMarkDone={onMarkDone}
            onDelete={onDelete}
            isDragDisabled={isDragDisabled}
            isDark={isDark}
          />
        </div>
      ))}

      {/* Quick add button (appears on hover) */}
      {enableQuickAdd && onQuickAdd && (
        <div className="px-1 opacity-0 group-hover/day-tile:opacity-100 transition-opacity">
          <button
            onClick={onQuickAdd}
            className={`
              flex w-full items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors
              ${isDark ? 'text-[#6B6B6B] hover:text-[#A0A0A0] hover:bg-[#1A1A1A]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}
            `}
          >
            <Plus className="w-3 h-3" />
            <span>Add task</span>
          </button>
        </div>
      )}

      {/* Load more button */}
      {hasMore && !showAll && (
        <div className="px-1">
          <button
            onClick={() => setShowAll(true)}
            className={`text-xs px-1.5 py-0.5 rounded font-medium ${isDark ? 'text-[#5E5CE6] hover:bg-[#5E5CE6]/10' : 'text-indigo-600 hover:bg-indigo-50'}`}
          >
            +{events.length - MAX_VISIBLE} more
          </button>
        </div>
      )}
    </div>
  );
}

// ============ Day Tile Component (inspired by Plane) ============
interface DayTileProps {
  date: Date;
  events: CalendarEvent[];
  isCurrentMonth?: boolean;
  onOpen: (event: CalendarEvent) => void;
  onMarkDone: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onQuickAdd?: (date: Date) => void;
  onDrop: (date: Date, sourceData: any) => void;
  isDragDisabled: boolean;
  isDark: boolean;
  isWeekView?: boolean;
}

function DayTile({
  date,
  events,
  isCurrentMonth = true,
  onOpen,
  onMarkDone,
  onDelete,
  onQuickAdd,
  onDrop,
  isDragDisabled,
  isDark,
  isWeekView = false,
}: DayTileProps) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const isTodayDate = isToday(date);
  const formattedDate = format(date, 'yyyy-MM-dd');

  // Setup drop target
  useEffect(() => {
    const element = tileRef.current;
    if (!element) return;

    return combine(
      dropTargetForElements({
        element,
        getData: () => ({ date: formattedDate }),
        onDragEnter: () => setIsDraggingOver(true),
        onDragLeave: () => setIsDraggingOver(false),
        onDrop: ({ source }) => {
          setIsDraggingOver(false);
          const sourceData = source?.data;
          if (sourceData) {
            onDrop(date, sourceData);
          }
        },
      })
    );
  }, [date, formattedDate, onDrop]);

  const bgColor = isDraggingOver
    ? (isDark ? 'bg-[#2E2E2E]' : 'bg-blue-50')
    : !isCurrentMonth
      ? (isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50')
      : '';

  return (
    <div
      ref={tileRef}
      className={`group/day-tile relative flex flex-col h-full w-full ${bgColor} ${isWeekView ? '' : 'min-h-[100px]'}`}
    >
      {/* Header with date */}
      {!isWeekView && (
        <div className={`flex-shrink-0 flex justify-end px-2 py-1 text-xs ${!isCurrentMonth ? (isDark ? 'text-[#4A4A4A]' : 'text-gray-400') : (isDark ? 'text-[#A0A0A0]' : 'text-gray-600')}`}>
          {date.getDate() === 1 && format(date, 'MMM') + ' '}
          {isTodayDate ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#5E5CE6] text-white font-medium">
              {date.getDate()}
            </span>
          ) : (
            date.getDate()
          )}
        </div>
      )}

      {/* Events */}
      <div className={`flex-1 overflow-hidden ${isWeekView ? 'pt-1' : ''}`}>
        <CalendarIssueBlocks
          date={date}
          events={events}
          onOpen={onOpen}
          onMarkDone={onMarkDone}
          onDelete={onDelete}
          onQuickAdd={onQuickAdd ? () => onQuickAdd(date) : undefined}
          isDragDisabled={isDragDisabled}
          isDark={isDark}
          enableQuickAdd={!!onQuickAdd}
        />
      </div>
    </div>
  );
}

// ============ Timeline Event (for week/day view) ============
interface TimelineEventProps {
  event: CalendarEvent;
  top: number;
  height: number;
  width: string;
  left: string;
  isDragging: boolean;
  isDark: boolean;
  onOpen: (event: CalendarEvent) => void;
  onMarkDone: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

const TimelineEvent = React.forwardRef<HTMLDivElement, TimelineEventProps>(
  ({ event, top, height, width, left, isDragging, isDark, onOpen, onMarkDone, onDelete }, ref) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!isMenuOpen) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setIsMenuOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    const bgColor = event.isSubtask ? 'bg-[#F59E0B]' : event.isFromApp ? 'bg-[#5E5CE6]' : 'bg-[#10B981]';

    return (
      <div
        ref={ref}
        className={`
          absolute rounded-md px-1.5 py-0.5 overflow-hidden group/timeline-event
          transition-all cursor-grab select-none
          ${bgColor}
          ${event.taskStatus === 'done' ? 'opacity-40' : ''}
          ${isDragging ? 'ring-2 ring-white/50 shadow-xl scale-105 z-50 cursor-grabbing' : 'hover:ring-1 hover:ring-white/30 hover:shadow-lg z-10'}
        `}
        style={{ top: `${top}px`, height: `${height}px`, width, left }}
        onClick={() => !isDragging && onOpen(event)}
      >
        <div className="font-medium text-white truncate pr-5 text-[11px] leading-tight">
          {event.isSubtask && <span className="opacity-70">↳ </span>}
          {event.title}
        </div>
        {height > 24 && (
          <div className="text-white/70 text-[9px] leading-tight">
            {format(parseISO(event.start), 'HH:mm')}
          </div>
        )}

        {/* Menu button */}
        {event.isFromApp && (
          <div
            ref={menuRef}
            className={`absolute top-0.5 right-0.5 ${isMenuOpen ? 'block' : 'opacity-0 group-hover/timeline-event:opacity-100'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-0.5 rounded bg-black/30 hover:bg-black/50 transition-colors"
            >
              <MoreHorizontal className="w-3 h-3 text-white" />
            </button>

            {isMenuOpen && (
              <div className={`absolute right-0 top-full mt-1 z-50 py-1 min-w-[140px] rounded-lg shadow-xl border ${isDark ? 'bg-[#1A1A1A] border-[#2E2E2E]' : 'bg-white border-gray-200'}`}>
                <button
                  onClick={() => { onOpen(event); setIsMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${isDark ? 'hover:bg-[#2E2E2E] text-[#E0E0E0]' : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Open
                </button>
                <button
                  onClick={() => { onMarkDone(event); setIsMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${isDark ? 'hover:bg-[#2E2E2E] text-[#E0E0E0]' : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  {event.taskStatus === 'done' ? <Circle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5 text-green-500" />}
                  {event.taskStatus === 'done' ? 'Mark as todo' : 'Mark as done'}
                </button>
                <div className={`my-1 border-t ${isDark ? 'border-[#2E2E2E]' : 'border-gray-200'}`} />
                <button
                  onClick={() => { onDelete(event); setIsMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-red-500 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);
TimelineEvent.displayName = 'TimelineEvent';

// ============ Draggable Timeline Event Root ============
interface TimelineEventRootProps {
  event: CalendarEvent;
  top: number;
  height: number;
  width: string;
  left: string;
  day: Date;
  isDragDisabled: boolean;
  isDark: boolean;
  onOpen: (event: CalendarEvent) => void;
  onMarkDone: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

function TimelineEventRoot({
  event,
  top,
  height,
  width,
  left,
  day,
  isDragDisabled,
  isDark,
  onOpen,
  onMarkDone,
  onDelete,
}: TimelineEventRootProps) {
  const eventRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const element = eventRef.current;
    if (!element) return;

    return combine(
      draggable({
        element,
        canDrag: () => !isDragDisabled && event.isFromApp,
        getInitialData: () => ({
          id: event.id,
          taskId: event.taskId,
          subtaskId: event.subtaskId,
          isSubtask: event.isSubtask,
          date: format(day, 'yyyy-MM-dd'),
          hasTime: !event.allDay,
          start: event.start,
        }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      })
    );
  }, [event, day, isDragDisabled]);

  return (
    <TimelineEvent
      ref={eventRef}
      event={event}
      top={top}
      height={height}
      width={width}
      left={left}
      isDragging={isDragging}
      isDark={isDark}
      onOpen={onOpen}
      onMarkDone={onMarkDone}
      onDelete={onDelete}
    />
  );
}

// ============ Timeline Column with Drop Target ============
interface TimelineColumnProps {
  day: Date;
  dayIndex: number;
  events: CalendarEvent[];
  isDark: boolean;
  onOpen: (event: CalendarEvent) => void;
  onMarkDone: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onDrop: (day: Date, y: number, sourceData: any) => void;
  isDragDisabled: boolean;
  colors: any;
}

function TimelineColumn({
  day,
  dayIndex,
  events,
  isDark,
  onOpen,
  onMarkDone,
  onDelete,
  onDrop,
  isDragDisabled,
  colors,
}: TimelineColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dropYRef = useRef(0);

  useEffect(() => {
    const element = columnRef.current;
    if (!element) return;

    const handleDragOver = (e: DragEvent) => {
      const rect = element.getBoundingClientRect();
      dropYRef.current = e.clientY - rect.top;
    };

    element.addEventListener('dragover', handleDragOver);

    const cleanup = combine(
      dropTargetForElements({
        element,
        getData: () => ({ dayIndex, date: format(day, 'yyyy-MM-dd') }),
        onDragEnter: () => setIsDraggingOver(true),
        onDragLeave: () => setIsDraggingOver(false),
        onDrop: ({ source }) => {
          setIsDraggingOver(false);
          const sourceData = source?.data;
          if (sourceData) {
            onDrop(day, dropYRef.current, sourceData);
          }
        },
      })
    );

    return () => {
      element.removeEventListener('dragover', handleDragOver);
      cleanup();
    };
  }, [day, dayIndex, onDrop]);

  // Calculate event positions
  const getEventPosition = (event: CalendarEvent) => {
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    const startHour = getHours(start);
    const startMin = getMinutes(start);
    const duration = differenceInMinutes(end, start) || 60;

    const top = ((startHour - 7) * 60 + startMin) * (48 / 60);
    const height = Math.max(duration * (48 / 60), 20);

    return { top, height };
  };

  const timedEvents = events.filter(e => !e.allDay);

  return (
    <div
      ref={columnRef}
      className={`relative border-l ${colors.borderLight} ${isToday(day) ? 'bg-[#5E5CE6]/5' : ''} ${isDraggingOver ? (isDark ? 'bg-[#2E2E2E]/50' : 'bg-blue-50/50') : ''}`}
    >
      {/* Hour lines */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className={`absolute w-full border-t ${colors.borderLight} pointer-events-none`}
          style={{ top: `${(hour - 7) * 48}px` }}
        />
      ))}

      {/* Current time indicator */}
      {isToday(day) && (
        <div
          className="absolute w-full h-0.5 bg-[#EF4444] z-20 pointer-events-none"
          style={{
            top: `${((getHours(new Date()) - 7) * 60 + getMinutes(new Date())) * (48 / 60)}px`,
          }}
        >
          <div className="absolute -left-1 -top-1 w-2 h-2 bg-[#EF4444] rounded-full" />
        </div>
      )}

      {/* Events */}
      {timedEvents.map((event, i) => {
        const { top, height } = getEventPosition(event);
        const width = timedEvents.length > 1 ? `${90 / timedEvents.length}%` : '90%';
        const left = timedEvents.length > 1 ? `${5 + (i * (90 / timedEvents.length))}%` : '5%';

        return (
          <TimelineEventRoot
            key={event.id}
            event={event}
            top={top}
            height={height}
            width={width}
            left={left}
            day={day}
            isDragDisabled={isDragDisabled}
            isDark={isDark}
            onOpen={onOpen}
            onMarkDone={onMarkDone}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}

// ============ Main Calendar View Component ============
export default function CalendarView({
  tasks = [],
  subtasks = [],
  onTaskClick,
  onSubtaskClick,
  onEventComplete,
  onTaskStatusChange,
  onCreateTask,
  onDeleteTask,
  onDeleteSubtask,
  onTaskMove,
  onSubtaskMove,
}: CalendarViewProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [connected, setConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // Enable auto-scroll for drag and drop
  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    return combine(
      autoScrollForElements({ element })
    );
  }, []);

  // Convert tasks to calendar events (only active tasks)
  const taskEvents: CalendarEvent[] = useMemo(() => {
    return tasks
      .filter(task => task.due_date && task.status !== 'backlog' && task.status !== 'cancelled')
      .map(task => {
        const startDate = task.due_date!.split('T')[0];
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
          target_date: startDate,
        };
      });
  }, [tasks]);

  // Convert subtasks to calendar events
  const subtaskEvents: CalendarEvent[] = useMemo(() => {
    return subtasks
      .filter(subtask => subtask.due_date)
      .map(subtask => {
        const parentTask = tasks.find(t => t.id === subtask.task_id);
        const startDate = subtask.due_date!.split('T')[0];
        let startDateTime = startDate;
        let endDateTime = startDate;

        if (subtask.due_time) {
          startDateTime = `${startDate}T${subtask.due_time}`;
          const duration = subtask.duration || 30;
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
          color: '#F59E0B',
          target_date: startDate,
        };
      });
  }, [subtasks, tasks]);

  // Combine all events
  const events = useMemo(() => {
    const syncedEventIds = new Set(
      tasks.filter(t => t.google_calendar_event_id).map(t => t.google_calendar_event_id)
    );
    const filteredGoogleEvents = googleEvents.filter(ge => !syncedEventIds.has(ge.id));
    return [...filteredGoogleEvents, ...taskEvents, ...subtaskEvents];
  }, [googleEvents, taskEvents, subtaskEvents, tasks]);

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

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('google_connected') === 'true') {
        window.history.replaceState({}, '', window.location.pathname);
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
      const authUrl = await connectGoogleCalendar();
      if (authUrl) window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting to Google Calendar:', error);
    }
  };

  // Event handlers
  const handleOpenEvent = (event: CalendarEvent) => {
    if (event.isSubtask && event.subtaskId && event.taskId) {
      onSubtaskClick?.(event.subtaskId, event.taskId);
    } else if (event.taskId) {
      onTaskClick?.(event.taskId);
    }
  };

  const handleMarkDone = (event: CalendarEvent) => {
    if (!event.taskId || !onTaskStatusChange) return;
    const newStatus = event.taskStatus === 'done' ? 'todo' : 'done';
    if (event.isSubtask && event.subtaskId) {
      onTaskStatusChange(event.subtaskId, newStatus);
    } else {
      onTaskStatusChange(event.taskId, newStatus);
    }
    if (onEventComplete && event.taskId) onEventComplete(event.id, event.taskId);
  };

  const handleDeleteEvent = (event: CalendarEvent) => {
    if (event.isSubtask && event.subtaskId && onDeleteSubtask) {
      onDeleteSubtask(event.subtaskId);
    } else if (event.taskId && onDeleteTask) {
      onDeleteTask(event.taskId);
    }
  };

  // Handle quick add
  const handleQuickAdd = (date: Date) => {
    if (!onCreateTask) return;
    onCreateTask({ due_date: format(date, 'yyyy-MM-dd') });
  };

  // Handle drop on day tile (month view)
  const handleDayDrop = (targetDate: Date, sourceData: any) => {
    const { taskId, subtaskId, isSubtask, date: sourceDate } = sourceData;
    const targetDateStr = format(targetDate, 'yyyy-MM-dd');

    if (sourceDate === targetDateStr) return;

    if (isSubtask && subtaskId && onSubtaskMove) {
      onSubtaskMove(subtaskId, { due_date: targetDateStr });
    } else if (taskId && onTaskMove) {
      onTaskMove(taskId, { due_date: targetDateStr });
    }
  };

  // Handle drop on timeline (week/day view) - includes time
  const handleTimelineDrop = (targetDay: Date, y: number, sourceData: any) => {
    const { taskId, subtaskId, isSubtask } = sourceData;
    const targetDateStr = format(targetDay, 'yyyy-MM-dd');

    // Convert Y to time (48px per hour, starting at 7am)
    const totalMinutes = (y / 48) * 60;
    const hour = Math.min(Math.max(Math.floor(totalMinutes / 60) + 7, 7), 23);
    const minutes = Math.round((totalMinutes % 60) / 15) * 15;
    const due_time = `${String(hour).padStart(2, '0')}:${String(Math.min(minutes, 45)).padStart(2, '0')}`;

    if (isSubtask && subtaskId && onSubtaskMove) {
      onSubtaskMove(subtaskId, { due_date: targetDateStr, due_time });
    } else if (taskId && onTaskMove) {
      onTaskMove(taskId, { due_date: targetDateStr, due_time });
    }
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

  const selectedDateEvents = selectedDate ? getEventsForDay(selectedDate) : [];

  return (
    <div className={`flex flex-col h-full ${colors.bg}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-3 border-b ${colors.border}`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={goToPrevious} className={`p-1.5 ${colors.bgHover} rounded transition-colors`}>
              <ChevronLeft className={`w-4 h-4 ${colors.textMuted}`} />
            </button>
            <button onClick={goToNext} className={`p-1.5 ${colors.bgHover} rounded transition-colors`}>
              <ChevronRight className={`w-4 h-4 ${colors.textMuted}`} />
            </button>
          </div>

          <h1 className={`text-sm font-medium ${colors.text} min-w-[200px]`}>{getTitle()}</h1>

          <button
            onClick={goToToday}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              isToday(currentDate) ? 'bg-[#5E5CE6] text-white' : `${colors.textSecondary} ${colors.bgHover}`
            }`}
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center ${colors.bgSecondary} rounded-lg p-0.5`}>
            {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                  viewMode === mode
                    ? `${isDark ? 'bg-[#2E2E2E]' : 'bg-white shadow-sm'} ${colors.text}`
                    : `${colors.textMuted} hover:${colors.textSecondary}`
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {connected && (
            <button onClick={fetchGoogleEvents} disabled={loading} className={`p-1.5 ${colors.bgHover} rounded transition-colors`}>
              <RefreshCw className={`w-4 h-4 ${colors.textMuted} ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}

          {!checkingConnection && (
            connected ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#10B981]/10 rounded">
                <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full" />
                <span className="text-xs text-[#10B981]">Connected</span>
              </div>
            ) : (
              <button
                onClick={handleConnectCalendar}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs ${colors.textSecondary} ${colors.bgHover} rounded transition-colors`}
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
              <div className={`grid grid-cols-7 border-b ${colors.border}`}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <div key={day} className="py-2 text-center">
                    <span className={`text-xs font-medium ${colors.textMuted}`}>{day}</span>
                  </div>
                ))}
              </div>

              <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-auto" ref={scrollContainerRef}>
                {calendarDays.map((day, index) => {
                  const dayEvents = getEventsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentDate);

                  return (
                    <div
                      key={index}
                      className={`border-r border-b ${colors.borderLight} ${
                        selectedDate && isSameDay(day, selectedDate) ? colors.bgSelected : ''
                      }`}
                      onClick={() => setSelectedDate(day)}
                    >
                      <DayTile
                        date={day}
                        events={dayEvents}
                        isCurrentMonth={isCurrentMonth}
                        onOpen={handleOpenEvent}
                        onMarkDone={handleMarkDone}
                        onDelete={handleDeleteEvent}
                        onQuickAdd={onCreateTask ? handleQuickAdd : undefined}
                        onDrop={handleDayDrop}
                        isDragDisabled={false}
                        isDark={isDark}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : viewMode === 'week' ? (
            // Week View
            <div className="h-full flex flex-col">
              <div className={`grid grid-cols-8 border-b ${colors.border}`}>
                <div className="w-14" />
                {weekDays.map((day, i) => (
                  <div
                    key={i}
                    className={`py-2 text-center border-l ${colors.borderLight} ${isToday(day) ? 'bg-[#5E5CE6]/5' : ''}`}
                    onClick={() => setSelectedDate(day)}
                  >
                    <div className={`text-xs ${colors.textMuted}`}>{format(day, 'EEE')}</div>
                    <div className={`text-lg font-medium mt-0.5 ${isToday(day) ? 'text-[#5E5CE6]' : colors.text}`}>
                      {format(day, 'd')}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
                <div className="grid grid-cols-8 min-h-full" style={{ height: `${HOURS.length * 48}px` }}>
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

                  {weekDays.map((day, dayIndex) => (
                    <TimelineColumn
                      key={dayIndex}
                      day={day}
                      dayIndex={dayIndex}
                      events={getEventsForDay(day)}
                      isDark={isDark}
                      onOpen={handleOpenEvent}
                      onMarkDone={handleMarkDone}
                      onDelete={handleDeleteEvent}
                      onDrop={handleTimelineDrop}
                      isDragDisabled={false}
                      colors={colors}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Day View
            <div className="h-full flex">
              <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
                <div className="relative" style={{ height: `${HOURS.length * 48}px` }}>
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className={`absolute left-0 w-14 text-right pr-3 text-[10px] ${colors.textDimmed}`}
                      style={{ top: `${(hour - 7) * 48 - 6}px` }}
                    >
                      {format(setHours(new Date(), hour), 'HH:mm')}
                    </div>
                  ))}

                  <div className="absolute left-14 right-0 top-0 bottom-0">
                    <TimelineColumn
                      day={currentDate}
                      dayIndex={0}
                      events={getEventsForDay(currentDate)}
                      isDark={isDark}
                      onOpen={handleOpenEvent}
                      onMarkDone={handleMarkDone}
                      onDelete={handleDeleteEvent}
                      onDrop={handleTimelineDrop}
                      isDragDisabled={false}
                      colors={colors}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className={`w-72 border-l ${colors.border} ${colors.bg} flex flex-col`}>
          <div className={`px-4 py-3 border-b ${colors.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-sm font-medium ${colors.text}`}>
                  {selectedDate ? format(selectedDate, 'EEEE') : 'Select a day'}
                </h3>
                {selectedDate && (
                  <p className={`text-xs ${colors.textMuted}`}>{format(selectedDate, 'd MMMM yyyy')}</p>
                )}
              </div>
              {selectedDate && isToday(selectedDate) && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[#5E5CE6]/20 text-[#5E5CE6] rounded">Today</span>
              )}
            </div>
          </div>

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
                <p className={`text-sm ${colors.textMuted} mb-3`}>No events</p>
                {onCreateTask && (
                  <button
                    onClick={() => handleQuickAdd(selectedDate)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-[#5E5CE6] text-white hover:bg-[#4B4ACF]`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add task
                  </button>
                )}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {selectedDateEvents.map(event => (
                  <div
                    key={event.id}
                    className={`group p-2.5 rounded-lg transition-all cursor-pointer ${isDark ? 'hover:bg-[#1A1A1A]' : 'hover:bg-gray-100'} ${event.taskStatus === 'done' ? 'opacity-50' : ''} ${event.isSubtask ? 'border-l-2 border-[#F59E0B] ml-2' : ''}`}
                    onClick={() => handleOpenEvent(event)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        {event.isFromApp ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMarkDone(event); }}
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
                            <span className={`text-[10px] ${colors.textMuted} truncate`}>{event.parentTaskTitle}</span>
                          )}
                          {event.isFromApp && !event.isSubtask && (
                            <span className="text-[10px] px-1 py-0.5 bg-[#5E5CE6]/10 text-[#5E5CE6] rounded">Task</span>
                          )}
                          {event.isSubtask && (
                            <span className="text-[10px] px-1 py-0.5 bg-[#F59E0B]/10 text-[#F59E0B] rounded">Subtask</span>
                          )}
                        </div>
                      </div>

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
                            onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event); }}
                            className="p-1 rounded transition-all hover:bg-red-500/10"
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
