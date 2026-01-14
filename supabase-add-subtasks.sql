-- ============================================
-- PARALLEL TASK - Add Subtasks Table Migration
-- ============================================
-- Execute this in your Supabase SQL Editor if you already have
-- the existing schema and need to add subtasks support.
-- Dashboard > SQL Editor > New Query
-- ============================================

-- Create subtasks table
CREATE TABLE IF NOT EXISTS public.subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
  priority INTEGER NOT NULL CHECK (priority >= 0 AND priority <= 4) DEFAULT 0,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_date DATE,
  due_time TIME,
  duration INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

-- Subtasks policies
CREATE POLICY "Users can view subtasks of their tasks" ON public.subtasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE id = subtasks.task_id
      AND EXISTS (
        SELECT 1 FROM public.projects
        WHERE id = tasks.project_id
        AND (owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.project_members
          WHERE project_id = projects.id AND user_id = auth.uid()
        ))
      )
    )
  );

CREATE POLICY "Project members can create subtasks" ON public.subtasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE id = subtasks.task_id
      AND EXISTS (
        SELECT 1 FROM public.projects
        WHERE id = tasks.project_id
        AND (owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.project_members
          WHERE project_id = projects.id AND user_id = auth.uid()
        ))
      )
    )
  );

CREATE POLICY "Project members can update subtasks" ON public.subtasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE id = subtasks.task_id
      AND EXISTS (
        SELECT 1 FROM public.projects
        WHERE id = tasks.project_id
        AND (owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.project_members
          WHERE project_id = projects.id AND user_id = auth.uid()
        ))
      )
    )
  );

CREATE POLICY "Project members can delete subtasks" ON public.subtasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE id = subtasks.task_id
      AND EXISTS (
        SELECT 1 FROM public.projects
        WHERE id = tasks.project_id
        AND (owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.project_members
          WHERE project_id = projects.id AND user_id = auth.uid()
        ))
      )
    )
  );

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks(task_id);

-- ============================================
-- DONE!
-- ============================================
-- Your subtasks table is ready.
-- Refresh your app to start using subtasks!
