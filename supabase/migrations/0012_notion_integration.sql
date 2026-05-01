-- Add Notion integration fields to user_profiles.
-- notion_token is stored plain text for now; encryption deferred to a future task.

ALTER TABLE public.user_profiles
  ADD COLUMN notion_token text,
  ADD COLUMN notion_parent_page_id text,
  ADD COLUMN notion_root_page_id text;
