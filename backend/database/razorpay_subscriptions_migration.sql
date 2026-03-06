-- Razorpay payment integration for subscriptions
-- Run: mysql -u user -p database < razorpay_subscriptions_migration.sql
-- If columns/values already exist, some statements may error - that's OK.

-- Add plan_id column (references plans.id)
ALTER TABLE `subscriptions` ADD COLUMN `plan_id` INT(11) NULL DEFAULT NULL AFTER `user_id`;

-- Add properties_limit column (denormalized from plans for fast access)
ALTER TABLE `subscriptions` ADD COLUMN `properties_limit` INT(11) NOT NULL DEFAULT 1 AFTER `plan_type`;

-- Add payment tracking columns
ALTER TABLE `subscriptions` ADD COLUMN `payment_id` VARCHAR(100) NULL DEFAULT NULL AFTER `is_active`;
ALTER TABLE `subscriptions` ADD COLUMN `order_id` VARCHAR(100) NULL DEFAULT NULL AFTER `payment_id`;

-- Add listing plan types (Basic: 1 prop, Pro: 5 props)
-- Note: If this fails with "duplicate value", the enum was already updated
ALTER TABLE `subscriptions` 
  MODIFY COLUMN `plan_type` ENUM('free', 'basic', 'pro', 'premium', 'basic_listing', 'pro_listing') DEFAULT 'free';
