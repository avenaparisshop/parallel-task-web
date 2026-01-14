-- ============================================
-- PARALLEL TASK - Supabase Schema
-- ============================================
-- Execute this in your Supabase SQL Editor
-- Dashboard > SQL Editor > New Query
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view all users" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- PROJECTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT DEFAULT '#5E5CE6',
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Users can view projects they own or are member of" ON public.projects
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = projects.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create projects" ON public.projects
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their projects" ON public.projects
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their projects" ON public.projects
  FOR DELETE USING (owner_id = auth.uid());

-- ============================================
-- PROJECT MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Enable RLS
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Project members policies
CREATE POLICY "Users can view members of their projects" ON public.project_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_members.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = projects.id AND pm.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Project owners and admins can add members" ON public.project_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_members.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = projects.id AND pm.user_id = auth.uid() AND pm.role IN ('owner', 'admin')
      ))
    )
  );

CREATE POLICY "Project owners and admins can update members" ON public.project_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_members.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = projects.id AND pm.user_id = auth.uid() AND pm.role IN ('owner', 'admin')
      ))
    )
  );

CREATE POLICY "Project owners and admins can remove members" ON public.project_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_members.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = projects.id AND pm.user_id = auth.uid() AND pm.role IN ('owner', 'admin')
      ))
    )
  );

-- ============================================
-- LABELS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#5E5CE6',
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Enable RLS
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

-- Labels policies
CREATE POLICY "Users can view labels of their projects" ON public.labels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = labels.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = projects.id AND user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Project members can create labels" ON public.labels
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = labels.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = projects.id AND user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Project members can delete labels" ON public.labels
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = labels.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = projects.id AND user_id = auth.uid()
      ))
    )
  );

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')) DEFAULT 'backlog',
  priority INTEGER NOT NULL CHECK (priority >= 0 AND priority <= 4) DEFAULT 0,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  due_date DATE,
  google_calendar_event_id TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Tasks policies
CREATE POLICY "Users can view tasks of their projects" ON public.tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = tasks.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = projects.id AND user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Project members can create tasks" ON public.tasks
  FOR INSERT WITH CHECK (
    creator_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = tasks.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = projects.id AND user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Project members can update tasks" ON public.tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = tasks.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = projects.id AND user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Project members can delete tasks" ON public.tasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = tasks.project_id
      AND (owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = projects.id AND user_id = auth.uid()
      ))
    )
  );

-- ============================================
-- SUBTASKS TABLE
-- ============================================
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

-- ============================================
-- TASK LABELS (junction table)
-- ============================================
CREATE TABLE IF NOT EXISTS public.task_labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id, label_id)
);

-- Enable RLS
ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;

-- Task labels policies
CREATE POLICY "Users can view task labels" ON public.task_labels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE id = task_labels.task_id
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

CREATE POLICY "Project members can add task labels" ON public.task_labels
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE id = task_labels.task_id
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

CREATE POLICY "Project members can remove task labels" ON public.task_labels
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE id = task_labels.task_id
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

-- ============================================
-- FUNCTION: Auto-create user profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_labels_project_id ON public.labels(project_id);
CREATE INDEX IF NOT EXISTS idx_task_labels_task_id ON public.task_labels(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks(task_id);

-- ============================================
-- DONE!
-- ============================================
-- Your Parallel Task database is ready.
-- Go to http://localhost:3000 and create an account!
