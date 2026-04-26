/*
  # Fix Function Search Paths for Security

  1. Problem
    - Functions cleanup_inactive_push_subscriptions and is_chat_room_creator have role mutable search_path
    - This can lead to security vulnerabilities via search path hijacking
    
  2. Solution
    - Recreate functions with explicit SET search_path = public
    - This ensures functions only look in the public schema for objects
    
  3. Functions Fixed
    - cleanup_inactive_push_subscriptions
    - is_chat_room_creator
    
  4. Security Impact
    - Prevents search path hijacking attacks
    - Makes function behavior predictable and secure
*/

-- Fix cleanup_inactive_push_subscriptions
CREATE OR REPLACE FUNCTION public.cleanup_inactive_push_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM push_subscriptions
  WHERE is_active = false
  AND last_used_at < now() - INTERVAL '90 days';
END;
$function$;

-- Fix is_chat_room_creator
CREATE OR REPLACE FUNCTION public.is_chat_room_creator(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM chat_rooms
    WHERE id = p_room_id
    AND created_by = auth.uid()
  );
$function$;
