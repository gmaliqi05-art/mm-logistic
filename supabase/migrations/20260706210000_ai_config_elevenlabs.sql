/*
  # Add ElevenLabs (neural TTS) config to ai_config

  The conversational assistant reads its responses aloud. The browser's built-in
  speech synthesis sounds robotic (especially for Albanian), so we add optional
  ElevenLabs neural TTS. The API key and chosen voice are stored on the same
  super-admin-managed `ai_config` singleton as the Anthropic key.

  - elevenlabs_api_key   : write-only secret, never returned to clients.
  - elevenlabs_voice_id  : which ElevenLabs voice to speak with (defaults to a
                           warm male "manager" voice, JBFqnCBsd6RMkjVDRZzb / George).

  RLS is unchanged: the table has RLS enabled with NO policies, so only the
  service role (edge functions) can read the key. Applied to prod via MCP.
*/

ALTER TABLE public.ai_config
  ADD COLUMN IF NOT EXISTS elevenlabs_api_key text,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id text NOT NULL DEFAULT 'JBFqnCBsd6RMkjVDRZzb';
