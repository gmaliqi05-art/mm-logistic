/*
  # Rate limiting infrastructure for edge functions

  1. New Table
    - `rate_limit_buckets` tracks request counts per key per time window
      - `key` (text) - composite identifier like "scan-document:ip=1.2.3.4"
      - `count` (int) - number of requests observed in the current window
      - `window_start` (timestamptz) - when the current window began

  2. Security
    - Enable RLS (service-role only; no user policies needed because edge functions use service role)

  3. Cleanup
    - An index on window_start supports periodic pruning of expired buckets
*/

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window_start
  ON rate_limit_buckets (window_start);

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- No policies: only service role (edge functions) may access.
