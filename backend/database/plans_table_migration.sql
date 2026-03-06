-- Plans table migration
-- Run: mysql -u user -p database < plans_table_migration.sql

CREATE TABLE IF NOT EXISTS `plans` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `price_in_paise` INT(11) NOT NULL,
  `properties_limit` INT(11) NOT NULL DEFAULT 1,
  `duration_months` INT(11) NOT NULL DEFAULT 1,
  `features` TEXT DEFAULT NULL,
  `is_popular` TINYINT(1) DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `sort_order` INT(11) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_code` (`code`),
  INDEX `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `plans` (`code`, `name`, `price_in_paise`, `properties_limit`, `duration_months`, `features`, `is_popular`, `sort_order`) VALUES
('basic_listing', 'Basic Plan', 9900, 1, 1, '["1 property listing", "1 month validity", "Basic visibility"]', 0, 1),
('pro_listing', 'Pro Plan', 39900, 5, 1, '["5 property listings", "1 month validity", "Priority visibility"]', 1, 2);
