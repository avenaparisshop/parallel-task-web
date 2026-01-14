-- ============================================
-- GOOGLE CALENDAR INTEGRATION - Additional Schema
-- ============================================
-- Execute this in your Supabase SQL Editor AFTER the main schema
-- Dashboard > SQL Editor > New Query
-- ============================================

-- ============================================
-- GOOGLE OAUTH TOKENS TABLE
-- ============================================
-- Stores Google OAuth tokens for each user
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only access their own tokens
CREATE POLICY "Users can view own tokens" ON public.google_oauth_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens" ON public.google_oauth_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens" ON public.google_oauth_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens" ON public.google_oauth_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- CALENDAR SYNC LOG TABLE (optional but recommended)
-- ============================================
-- Tracks sync operations for debugging and audit
CREATE TABLE IF NOT EXISTS public.calendar_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  event_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'sync')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own sync logs" ON public.calendar_sync_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync logs" ON public.calendar_sync_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_user_id ON public.google_oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_user_id ON public.calendar_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_task_id ON public.calendar_sync_log(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_google_calendar_event_id ON public.tasks(google_calendar_event_id);

-- ============================================
-- DONE!
-- ============================================
