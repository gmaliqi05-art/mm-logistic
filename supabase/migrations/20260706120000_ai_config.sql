/*
  # AI assistant configuration (super-admin managed)

  Lets the super admin configure the AI assistant (Anthropic API key, model,
  on/off) from the platform instead of setting Supabase secrets by hand.

  Security: a single-row `ai_config` table with RLS enabled and **no policies**,
  so neither `anon` nor `authenticated` can read or write it — only the
  service-role (edge functions `ai-config` and `ai-agent`) can. The API key is
  therefore write-only from the UI and never reaches a browser. The `ai-agent`
  function reads the key from here first and falls back to the
  `ANTHROPIC_API_KEY` env var.
*/

CREATE TABLE IF NOT EXISTS public.ai_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),  -- singleton row
  anthropic_api_key text,
  model text NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles_private(id) ON DELETE SET NULL
);

INSERT INTO public.ai_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only service-role (edge functions) may touch this.
