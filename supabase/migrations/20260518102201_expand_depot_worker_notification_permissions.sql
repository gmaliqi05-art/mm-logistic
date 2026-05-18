/*
  # Expand depot_worker notification permissions

  1. Changes
    - Adds `delivery.in_transit` channel permission for depot_worker (can_receive=true)
      so depot workers are notified when deliveries are en route to their depot
    - Adds `delivery.assigned` channel permission for depot_worker (can_receive=true)
      so depot workers know when a delivery is assigned to their depot

  2. Purpose
    - Depot workers need advance notice that goods are incoming
    - Enables proactive preparation for receiving at the depot
*/

INSERT INTO notification_permissions (role, channel_code, can_send, can_receive)
VALUES
  ('depot_worker', 'delivery.in_transit', false, true),
  ('depot_worker', 'delivery.assigned', false, true)
ON CONFLICT (role, channel_code) DO UPDATE
  SET can_receive = true;
