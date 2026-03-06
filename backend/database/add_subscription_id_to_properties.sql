-- Migration: Add subscription_id to properties table
-- Links each property to the subscription it was created under
-- Run: mysql -u user -p database < add_subscription_id_to_properties.sql

ALTER TABLE `properties`
  ADD COLUMN `subscription_id` INT(11) NULL DEFAULT NULL AFTER `user_id`,
  ADD INDEX `idx_subscription_id` (`subscription_id`);

-- Backfill existing properties: match each property to the subscription
-- that was active at the time it was created (best-effort for old data)
UPDATE properties p
  JOIN subscriptions s ON s.user_id = p.user_id
    AND p.created_at >= s.start_date
    AND (s.end_date IS NULL OR p.created_at <= s.end_date)
  SET p.subscription_id = s.id
WHERE p.subscription_id IS NULL
  AND s.id = (
    SELECT s2.id FROM subscriptions s2
    WHERE s2.user_id = p.user_id
      AND p.created_at >= s2.start_date
      AND (s2.end_date IS NULL OR p.created_at <= s2.end_date)
    ORDER BY s2.created_at DESC
    LIMIT 1
  );
