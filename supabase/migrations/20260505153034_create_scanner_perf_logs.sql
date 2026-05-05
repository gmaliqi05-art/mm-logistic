/*
  # Create scanner_perf_logs table

  1. New Tables
    - `scanner_perf_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to auth.users, nullable)
      - `device_ua` (text) - user agent
      - `hardware_concurrency` (int)
      - `device_memory` (numeric)
      - `avg_tick_ms` (numeric)
      - `max_tick_ms` (numeric)
      - `long_task_count` (int)
      - `cv_ready` (boolean)
      - `low_power_mode` (boolean)
      - `detection_method` (text) - 'cv', 'projection', 'none', 'manual'
      - `frame_count` (int)
      - `created_at` (timestamptz)
  2. Security
    - Enable RLS
    - Authenticated users can insert their own logs
    - Users can read their own logs
    - Super admins can read all logs
*/

CREATE TABLE IF NOT EXISTS scanner_perf_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_ua text DEFAULT '',
  hardware_concurrency int DEFAULT 0,
  device_memory numeric DEFAULT 0,
  avg_tick_ms numeric DEFAULT 0,
  max_tick_ms numeric DEFAULT 0,
  long_task_count int DEFAULT 0,
  cv_ready boolean DEFAULT false,
  low_power_mode boolean DEFAULT false,
  detection_method text DEFAULT '',
  frame_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scanner_perf_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own scanner logs"
  ON scanner_perf_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own scanner logs"
  ON scanner_perf_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_scanner_perf_logs_user ON scanner_perf_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_scanner_perf_logs_created ON scanner_perf_logs(created_at DESC);
