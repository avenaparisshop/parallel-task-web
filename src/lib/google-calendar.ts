import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`;

// Log config on load (server-side only)
if (typeof window === 'undefined') {
  console.log('[google-calendar] Config loaded:', {
    hasClientId: !!GOOGLE_CLIENT_ID,
    hasClientSecret: !!GOOGLE_CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
  });
}

// Scopes required for Google Calendar
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// Create OAuth2 client
export function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

// Generate authorization URL
export function getAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent',
    state: state,
  });
}

// Exchange authorization code for tokens
export async function getTokensFromCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
  token_type: string;
}> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to get tokens from Google');
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date || Date.now() + 3600000,
    scope: tokens.scope || GOOGLE_SCOPES.join(' '),
    token_type: tokens.token_type || 'Bearer',
  };
}

// Refresh access token
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expiry_date: number;
}> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  return {
    access_token: credentials.access_token,
    expiry_date: credentials.expiry_date || Date.now() + 3600000,
  };
}

// Create Google Calendar client
export function createCalendarClient(accessToken: string, refreshToken?: string): calendar_v3.Calendar {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Task to Calendar Event interface
export interface TaskEvent {
  id?: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string; // Format: "HH:mm"
  duration?: number; // Duration in minutes
  status: string;
  priority: number;
}

// Create calendar event from task
export async function createCalendarEvent(
  calendar: calendar_v3.Calendar,
  task: TaskEvent,
  calendarId: string = 'primary'
): Promise<string> {
  // Format date as YYYY-MM-DD for all-day events
  const formatDateForAllDay = (dateStr: string): string => {
    // Handle different date formats
    if (dateStr.includes('T')) {
      // ISO format with time - extract just the date part
      return dateStr.split('T')[0];
    }
    // Already YYYY-MM-DD format
    return dateStr;
  };

  // Build start and end times
  let start: calendar_v3.Schema$EventDateTime;
  let end: calendar_v3.Schema$EventDateTime;

  if (task.dueDate && task.dueTime) {
    // Timed event: combine date and time
    const dateOnly = formatDateForAllDay(task.dueDate);
    const startDateTime = new Date(`${dateOnly}T${task.dueTime}:00`);
    const durationMs = (task.duration || 60) * 60 * 1000;
    const endDateTime = new Date(startDateTime.getTime() + durationMs);

    start = { dateTime: startDateTime.toISOString(), timeZone: 'Europe/Paris' };
    end = { dateTime: endDateTime.toISOString(), timeZone: 'Europe/Paris' };
  } else if (task.dueDate) {
    // All-day event - Google requires YYYY-MM-DD format without time
    const dateOnly = formatDateForAllDay(task.dueDate);
    start = { date: dateOnly };
    end = { date: dateOnly };
  } else {
    // No date: create event now for 1 hour
    start = { dateTime: new Date().toISOString(), timeZone: 'Europe/Paris' };
    end = { dateTime: new Date(Date.now() + 3600000).toISOString(), timeZone: 'Europe/Paris' };
  }

  const event: calendar_v3.Schema$Event = {
    summary: task.title,
    description: formatEventDescription(task),
    start,
    end,
    colorId: getPriorityColorId(task.priority),
    status: task.status === 'cancelled' ? 'cancelled' : 'confirmed',
  };

  const response = await calendar.events.insert({
    calendarId,
    requestBody: event,
  });

  if (!response.data.id) {
    throw new Error('Failed to create calendar event');
  }

  return response.data.id;
}

// Update calendar event
export async function updateCalendarEvent(
  calendar: calendar_v3.Calendar,
  eventId: string,
  task: TaskEvent,
  calendarId: string = 'primary'
): Promise<void> {
  // Format date as YYYY-MM-DD for all-day events
  const formatDateForAllDay = (dateStr: string): string => {
    // Handle different date formats
    if (dateStr.includes('T')) {
      // ISO format with time - extract just the date part
      return dateStr.split('T')[0];
    }
    // Already YYYY-MM-DD format
    return dateStr;
  };

  // Build start and end times
  let start: calendar_v3.Schema$EventDateTime | undefined;
  let end: calendar_v3.Schema$EventDateTime | undefined;

  if (task.dueDate && task.dueTime) {
    // Timed event: combine date and time
    const dateOnly = formatDateForAllDay(task.dueDate);
    const startDateTime = new Date(`${dateOnly}T${task.dueTime}:00`);
    const durationMs = (task.duration || 60) * 60 * 1000;
    const endDateTime = new Date(startDateTime.getTime() + durationMs);

    start = { dateTime: startDateTime.toISOString(), timeZone: 'Europe/Paris' };
    end = { dateTime: endDateTime.toISOString(), timeZone: 'Europe/Paris' };
  } else if (task.dueDate) {
    // All-day event - Google requires YYYY-MM-DD format without time
    const dateOnly = formatDateForAllDay(task.dueDate);
    start = { date: dateOnly };
    end = { date: dateOnly };
  }

  const event: calendar_v3.Schema$Event = {
    summary: task.title,
    description: formatEventDescription(task),
    start,
    end,
    colorId: getPriorityColorId(task.priority),
    status: task.status === 'cancelled' ? 'cancelled' : 'confirmed',
  };

  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: event,
  });
}

// Delete calendar event
export async function deleteCalendarEvent(
  calendar: calendar_v3.Calendar,
  eventId: string,
  calendarId: string = 'primary'
): Promise<void> {
  await calendar.events.delete({
    calendarId,
    eventId,
  });
}

// Get calendar event
export async function getCalendarEvent(
  calendar: calendar_v3.Calendar,
  eventId: string,
  calendarId: string = 'primary'
): Promise<calendar_v3.Schema$Event | null> {
  try {
    const response = await calendar.events.get({
      calendarId,
      eventId,
    });
    return response.data;
  } catch (error) {
    return null;
  }
}

// List upcoming events
export async function listUpcomingEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string = 'primary',
  maxResults: number = 50
): Promise<calendar_v3.Schema$Event[]> {
  const response = await calendar.events.list({
    calendarId,
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

// List user's calendars
export async function listCalendars(
  calendar: calendar_v3.Calendar
): Promise<calendar_v3.Schema$CalendarListEntry[]> {
  const response = await calendar.calendarList.list();
  return response.data.items || [];
}

// Helper: Format event description
function formatEventDescription(task: TaskEvent): string {
  const statusEmoji = {
    backlog: '📋',
    todo: '📝',
    in_progress: '🔄',
    done: '✅',
    cancelled: '❌',
  }[task.status] || '📋';

  const priorityText = {
    0: 'No priority',
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Urgent',
  }[task.priority] || 'No priority';

  let description = `${statusEmoji} Status: ${task.status.replace('_', ' ')}\n`;
  description += `🎯 Priority: ${priorityText}\n`;

  if (task.description) {
    description += `\n${task.description}`;
  }

  description += '\n\n---\nSynced from Parallel Task';

  return description;
}

// Helper: Get Google Calendar color ID based on priority
function getPriorityColorId(priority: number): string {
  // Google Calendar color IDs (1-11)
  // https://developers.google.com/calendar/api/v3/reference/colors/get
  switch (priority) {
    case 4: return '11'; // Red (Urgent)
    case 3: return '6';  // Orange (High)
    case 2: return '5';  // Yellow (Medium)
    case 1: return '8';  // Gray (Low)
    default: return '1'; // Default blue
  }
}

// Types for token storage
export interface GoogleOAuthTokens {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  scope: string;
  token_type: string;
}
