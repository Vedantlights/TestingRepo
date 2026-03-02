<?php
/**
 * Database Configuration
 * Supports both local development and Hostinger production
 */

// Database Configuration - Using Production/Live Server Database
// SECURITY: Use environment variables for database credentials when available
$dbHost = getenv('DB_HOST');
$dbUser = getenv('DB_USER');
$dbPass = getenv('DB_PASS');
$dbName = getenv('DB_NAME');

if (empty($dbHost) || empty($dbUser) || empty($dbPass) || empty($dbName)) {
    // Production/Live Server Database Settings (Hostinger)
    // These are the default values - override via environment variables for security
    define('DB_HOST', $dbHost ?: '127.0.0.1');
    define('DB_PORT', getenv('DB_PORT') ?: '3306');
    define('DB_NAME', $dbName ?: 'u449667423_Testing');
    define('DB_USER', $dbUser ?: 'u449667423_Testing');
    define('DB_PASS', $dbPass ?: 'Shital@765');
} else {
    // Use environment variables if provided
    define('DB_HOST', $dbHost);
    define('DB_PORT', getenv('DB_PORT') ?: '3306');
    define('DB_NAME', $dbName);
    define('DB_USER', $dbUser);
    define('DB_PASS', $dbPass);
}

define('DB_CHARSET', 'utf8mb4');

class Database {
    private static $instance = null;
    private $conn;

    private function __construct() {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";port=" . (defined('DB_PORT') ? DB_PORT : '3306') . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            
            $this->conn = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            $errorMsg = "Database Connection Error: " . $e->getMessage();
            $errorMsg .= " | Host: " . DB_HOST . " | Database: " . DB_NAME . " | User: " . DB_USER;
            error_log($errorMsg);
            
            // In production, don't expose database details in error messages
            if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
                throw new Exception("Database connection failed. Please contact support.");
            } else {
                throw new Exception("Database connection failed: " . $e->getMessage());
            }
        }
    }

    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getConnection() {
        return $this->conn;
    }

    // Prevent cloning
    private function __clone() {}

    // Prevent unserialization
    public function __wakeup() {
        throw new Exception("Cannot unserialize singleton");
    }
}

// Get database connection
function getDB() {
    return Database::getInstance()->getConnection();
}

