-- ============================================
-- IndiaPropertys Database Schema
-- ============================================
-- Database: indiapropertys_db
-- Created for XAMPP MySQL
-- ============================================

CREATE DATABASE IF NOT EXISTS `indiapropertys_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `indiapropertys_db`;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `phone` VARCHAR(20) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `user_type` ENUM('buyer', 'seller', 'agent') NOT NULL DEFAULT 'buyer',
  `email_verified` TINYINT(1) DEFAULT 0,
  `phone_verified` TINYINT(1) DEFAULT 0,
  `profile_image` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_phone` (`phone`),
  INDEX `idx_user_type` (`user_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- OTP VERIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `otp_verifications` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) DEFAULT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `otp` VARCHAR(6) NOT NULL,
  `otp_type` ENUM('email', 'sms') NOT NULL,
  `verified` TINYINT(1) DEFAULT 0,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_phone` (`phone`),
  INDEX `idx_otp` (`otp`),
  INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PROPERTIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `properties` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `subscription_id` INT(11) NULL DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `status` ENUM('sale', 'rent') NOT NULL DEFAULT 'sale',
  `property_type` VARCHAR(100) NOT NULL,
  `location` VARCHAR(255) NOT NULL,
  `latitude` DECIMAL(10, 8) DEFAULT NULL,
  `longitude` DECIMAL(11, 8) DEFAULT NULL,
  `bedrooms` VARCHAR(10) DEFAULT NULL,
  `bathrooms` VARCHAR(10) DEFAULT NULL,
  `balconies` VARCHAR(10) DEFAULT NULL,
  `area` DECIMAL(10, 2) NOT NULL,
  `carpet_area` DECIMAL(10, 2) DEFAULT NULL,
  `floor` VARCHAR(50) DEFAULT NULL,
  `total_floors` INT(11) DEFAULT NULL,
  `facing` VARCHAR(50) DEFAULT NULL,
  `age` VARCHAR(50) DEFAULT NULL,
  `furnishing` VARCHAR(50) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `price` DECIMAL(15, 2) NOT NULL,
  `price_negotiable` TINYINT(1) DEFAULT 0,
  `maintenance_charges` DECIMAL(10, 2) DEFAULT NULL,
  `deposit_amount` DECIMAL(10, 2) DEFAULT NULL,
  `cover_image` VARCHAR(255) DEFAULT NULL,
  `video_url` VARCHAR(255) DEFAULT NULL,
  `brochure_url` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `views_count` INT(11) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_subscription_id` (`subscription_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_property_type` (`property_type`),
  INDEX `idx_location` (`location`),
  INDEX `idx_price` (`price`),
  INDEX `idx_created_at` (`created_at`),
  FULLTEXT KEY `ft_search` (`title`, `location`, `description`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PROPERTY IMAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `property_images` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `property_id` INT(11) NOT NULL,
  `image_url` VARCHAR(255) NOT NULL,
  `image_order` INT(11) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_property_id` (`property_id`),
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PROPERTY AMENITIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `property_amenities` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `property_id` INT(11) NOT NULL,
  `amenity_id` VARCHAR(50) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_property_amenity` (`property_id`, `amenity_id`),
  INDEX `idx_property_id` (`property_id`),
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INQUIRIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `inquiries` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `property_id` INT(11) NOT NULL,
  `buyer_id` INT(11) DEFAULT NULL,
  `seller_id` INT(11) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `mobile` VARCHAR(20) NOT NULL,
  `message` TEXT DEFAULT NULL,
  `status` ENUM('new', 'contacted', 'viewed', 'interested', 'not_interested', 'closed') DEFAULT 'new',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_property_id` (`property_id`),
  INDEX `idx_buyer_id` (`buyer_id`),
  INDEX `idx_seller_id` (`seller_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`),
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- FAVORITES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `favorites` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `property_id` INT(11) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_property` (`user_id`, `property_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_property_id` (`property_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- USER PROFILES TABLE (Extended Profile Info)
-- ============================================
CREATE TABLE IF NOT EXISTS `user_profiles` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL UNIQUE,
  `bio` TEXT DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `city` VARCHAR(100) DEFAULT NULL,
  `state` VARCHAR(100) DEFAULT NULL,
  `pincode` VARCHAR(10) DEFAULT NULL,
  `company_name` VARCHAR(255) DEFAULT NULL,
  `license_number` VARCHAR(100) DEFAULT NULL,
  `website` VARCHAR(255) DEFAULT NULL,
  `social_links` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PLANS TABLE
-- ============================================
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

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `plan_type` ENUM('free', 'basic', 'pro', 'premium') DEFAULT 'free',
  `start_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `end_date` TIMESTAMP NULL DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_is_active` (`is_active`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ADMIN USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(255) DEFAULT NULL,
  `role` ENUM('super_admin', 'admin', 'moderator') DEFAULT 'admin',
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INSERT DEFAULT ADMIN USER
-- ============================================
-- Password: admin123 (change this in production!)
INSERT INTO `admin_users` (`username`, `email`, `password`, `full_name`, `role`) 
VALUES ('admin', 'admin@demo1.360coordinates.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'System Administrator', 'super_admin')
ON DUPLICATE KEY UPDATE `username`=`username`;

-- ============================================
-- SESSIONS TABLE (Optional - for token management)
-- ============================================
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_token` (`token`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_expires_at` (`expires_at`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

