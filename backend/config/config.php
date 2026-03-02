<?php
/**
 * Application Configuration
 */

// CORS Headers
// Add your production frontend domain(s) here
$allowed_origins = [
    // Local development
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    // Test API
    'https://testapi.360coordinates.com',
    'https://www.testapi.360coordinates.com',
    // Production - Hostinger / live domains
    'https://360coordinates.com',
    'https://www.360coordinates.com',
    'https://demo1.360coordinates.com',
    'https://www.demo1.360coordinates.com',
];

// Allow requests from allowed origins
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

// Website requests: If Origin header exists, check if it's allowed
if (!empty($origin)) {
    if (in_array($origin, $allowed_origins)) {
        // Website request from allowed origin - set CORS header
        header("Access-Control-Allow-Origin: $origin");
    } elseif (defined('ENVIRONMENT') && ENVIRONMENT === 'development') {
        // In development, allow any origin for easier testing
        header("Access-Control-Allow-Origin: $origin");
    }
    // If origin exists but not allowed (production), don't set CORS header (blocks request)
}
// Mobile app requests: No Origin header - allow request to proceed (don't set CORS header)
// Mobile apps don't need CORS headers, so request will work without them

header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Error Reporting is now handled by environment detection above

// Timezone
date_default_timezone_set('Asia/Kolkata');

// ============================================
// ENVIRONMENT DETECTION & BASE URL CONFIGURATION
// ============================================
// Automatically detects if running on localhost or production
$isLocalhost = (
    $_SERVER['HTTP_HOST'] === 'localhost' ||
    strpos($_SERVER['HTTP_HOST'], 'localhost:') === 0 ||
    strpos($_SERVER['HTTP_HOST'], '127.0.0.1') === 0 ||
    strpos($_SERVER['HTTP_HOST'], '127.0.0.1:') === 0
);

if ($isLocalhost) {
    // LOCAL DEVELOPMENT
    define('BASE_URL', 'http://localhost/Fullstack/backend');
    define('ENVIRONMENT', 'development');
    // Error reporting enabled for development
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    // PRODUCTION (Hostinger)
    // Backend is deployed in /backend/ folder under the current domain.
    // testapi subdomain uses testapi.360coordinates.com; demo1 uses demo1; main uses 360coordinates.com.
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $hostNoPort = preg_replace('/:\d+$/', '', $host);
    $isTestApi = (stripos($hostNoPort, 'testapi.') === 0);
    $isDemo1 = (stripos($hostNoPort, 'demo1.') === 0);
    if ($isTestApi) {
        define('BASE_URL', 'https://testapi.360coordinates.com/backend');
    } elseif ($isDemo1) {
        define('BASE_URL', 'https://demo1.360coordinates.com/backend');
    } else {
        define('BASE_URL', 'https://360coordinates.com/backend');
    }
    define('ENVIRONMENT', 'production');
    // Error reporting: Log errors but don't display them (prevents HTML breaking JSON responses)
    error_reporting(E_ALL);
    ini_set('display_errors', 0);  // Don't display errors (prevents HTML in JSON responses)
    ini_set('log_errors', 1);
    // Log errors to a file in the backend directory
    $errorLogPath = __DIR__ . '/../logs/php_errors.log';
    if (!file_exists(dirname($errorLogPath))) {
        @mkdir(dirname($errorLogPath), 0755, true);
    }
    ini_set('error_log', $errorLogPath);
}

define('API_BASE_URL', BASE_URL . '/api');
// UPLOAD_BASE_URL: dev = local backend/uploads; production = 360coordinates.com/backend/uploads
define('UPLOAD_BASE_URL', BASE_URL . '/uploads');

// File Upload Paths - USE /backend/uploads/ (inside backend folder)
// Files saved to: /home/u449667423/domains/360coordinates.com/public_html/demo1/backend/uploads/properties/
// URLs: https://360coordinates.com/backend/uploads/properties/
// Note: UPLOAD_PROPERTIES_PATH, UPLOAD_TEMP_PATH, etc. are defined in moderation.php
// Use those constants instead of defining here
// __DIR__ is /backend/config/, so go up one level to /backend/
$baseUploadDir = dirname(__DIR__) . '/uploads/';
define('UPLOAD_DIR', $baseUploadDir);

// Verify the path is correct (for debugging)
error_log("UPLOAD_DIR: " . UPLOAD_DIR);
error_log("UPLOAD_DIR exists: " . (is_dir(UPLOAD_DIR) ? 'YES' : 'NO'));
error_log("UPLOAD_DIR writable: " . (is_writable(UPLOAD_DIR) ? 'YES' : 'NO'));

// Note: UPLOAD_PROPERTIES_PATH is defined in moderation.php - don't redefine here

define('PROPERTY_VIDEOS_DIR', UPLOAD_DIR . 'properties/videos/');
define('PROPERTY_BROCHURES_DIR', UPLOAD_DIR . 'properties/brochures/');
define('USER_PROFILES_DIR', UPLOAD_DIR . 'users/profiles/');

// Create upload directories if they don't exist
// Note: UPLOAD_PROPERTIES_PATH, UPLOAD_TEMP_PATH, etc. are created in moderation.php
$dirs = [
    UPLOAD_DIR,
    PROPERTY_VIDEOS_DIR,
    PROPERTY_BROCHURES_DIR,
    USER_PROFILES_DIR
];

foreach ($dirs as $dir) {
    if (!file_exists($dir)) {
        @mkdir($dir, 0755, true);
        if (file_exists($dir)) {
            error_log("Created upload directory: {$dir}");
        }
    }
}

// File Upload Limits
define('MAX_IMAGE_SIZE', 5 * 1024 * 1024); // 5MB
define('MAX_VIDEO_SIZE', 50 * 1024 * 1024); // 50MB
define('MAX_BROCHURE_SIZE', 10 * 1024 * 1024); // 10MB
define('MAX_IMAGES_PER_PROPERTY', 10);

// Allowed File Types
define('ALLOWED_IMAGE_TYPES', ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
define('ALLOWED_VIDEO_TYPES', ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg']);
define('ALLOWED_BROCHURE_TYPES', ['application/pdf']);

// JWT Secret (SECURITY: Use environment variable in production!)
// WARNING: Default secret is weak and should be changed in production
$jwtSecret = getenv('JWT_SECRET') ?: 'your-secret-key-change-in-production-2024';
if ($jwtSecret === 'your-secret-key-change-in-production-2024' && defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
    error_log('SECURITY WARNING: Using default JWT_SECRET in production! Please set JWT_SECRET environment variable.');
}
define('JWT_SECRET', $jwtSecret);
define('JWT_ALGORITHM', getenv('JWT_ALGORITHM') ?: 'HS256');
define('JWT_EXPIRATION', (int)(getenv('JWT_EXPIRATION') ?: 86400)); // 24 hours

// Mapbox Access Token (for geocoding)
// SECURITY: Use environment variable to avoid exposing token in code
$mapboxToken = getenv('MAPBOX_ACCESS_TOKEN') ?: 'pk.eyJ1Ijoic3VkaGFrYXJwb3VsIiwiYSI6ImNtaXp0ZmFrNTAxaTQzZHNiODNrYndsdTAifQ.YTMezksySLU7ZpcYkvXyqg';
define('MAPBOX_ACCESS_TOKEN', $mapboxToken);

// OTP Configuration
define('OTP_EXPIRATION_MINUTES', (int)(getenv('OTP_EXPIRATION_MINUTES') ?: 10));
define('OTP_LENGTH', (int)(getenv('OTP_LENGTH') ?: 6));

// Email OTP Feature Flag (TEMPORARY - set to false to disable email OTP verification)
// When disabled: Email field remains required, but OTP generation/sending/verification is skipped
// Email is automatically marked as verified at runtime
// Default: false (disabled) - set environment variable ENABLE_EMAIL_OTP=true to enable
$enableEmailOtpEnv = getenv('ENABLE_EMAIL_OTP');
define('ENABLE_EMAIL_OTP', $enableEmailOtpEnv !== false ? filter_var($enableEmailOtpEnv, FILTER_VALIDATE_BOOLEAN) : false);

// Email Configuration
// MSG91 SMTP Configuration (for welcome emails)
// SECURITY: Use environment variables for sensitive credentials
define('MSG91_SMTP_HOST', getenv('MSG91_SMTP_HOST') ?: 'smtp.mailer91.com');
define('MSG91_SMTP_PORT', (int)(getenv('MSG91_SMTP_PORT') ?: 587));
define('MSG91_SMTP_USER', getenv('MSG91_SMTP_USER') ?: 'emailer@demo1.360coordinates.com');
$msg91SmtpPass = getenv('MSG91_SMTP_PASS');
if (empty($msg91SmtpPass)) {
    $msg91SmtpPass = 'uawM8YyVM4lXbcRd';
    if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
        error_log('SECURITY WARNING: MSG91 SMTP password not set via environment variable in production!');
    }
}
define('MSG91_SMTP_PASS', $msg91SmtpPass);
define('MSG91_SMTP_FROM_EMAIL', getenv('MSG91_SMTP_FROM_EMAIL') ?: 'noreply@demo1.360coordinates.com');
define('MSG91_SMTP_FROM_NAME', getenv('MSG91_SMTP_FROM_NAME') ?: 'India Propertys');

// Hostinger SMTP Configuration (for OTP emails - legacy)
define('SMTP_HOST', getenv('SMTP_HOST') ?: 'smtp.hostinger.com');
define('SMTP_PORT', (int)(getenv('SMTP_PORT') ?: 587));
define('SMTP_USER', getenv('SMTP_USER') ?: 'info@demo1.360coordinates.com');
$smtpPass = getenv('SMTP_PASS');
if (empty($smtpPass)) {
    $smtpPass = 'V1e2d2a4n5t@2020';
    if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
        error_log('SECURITY WARNING: SMTP password not set via environment variable in production!');
    }
}
define('SMTP_PASS', $smtpPass);
define('SMTP_FROM_EMAIL', getenv('SMTP_FROM_EMAIL') ?: 'info@demo1.360coordinates.com');
define('SMTP_FROM_NAME', getenv('SMTP_FROM_NAME') ?: 'IndiaPropertys');

// SMS Configuration (MSG91 - Admin OTP configuration moved to admin-config.php)
// MSG91 constants are now defined in admin-config.php to avoid conflicts
define('MSG91_SENDER_ID', getenv('MSG91_SENDER_ID') ?: 'INDIA');
// New SMS Verification Widget Token (Tokenid)
// SECURITY: Use environment variable
$msg91WidgetToken = getenv('MSG91_WIDGET_AUTH_TOKEN') ?: '481618TcNAx989nvQ69410832P1';
if ($msg91WidgetToken === '481618TcNAx989nvQ69410832P1' && defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
    error_log('SECURITY WARNING: Using default MSG91_WIDGET_AUTH_TOKEN in production!');
}
define('MSG91_WIDGET_AUTH_TOKEN', $msg91WidgetToken);

// Background Worker Configuration (for async email sending)
// PHP executable path - can be overridden via environment variable
// On shared hosting, you may need to specify full path like: /usr/bin/php or /usr/local/bin/php
$phpExecutablePath = getenv('PHP_EXECUTABLE_PATH');
if (empty($phpExecutablePath)) {
    // Use PHP_BINARY if available (PHP 5.4+), otherwise fallback to 'php'
    $phpExecutablePath = defined('PHP_BINARY') && PHP_BINARY ? PHP_BINARY : 'php';
}
define('PHP_EXECUTABLE_PATH', $phpExecutablePath);

// Worker script paths (absolute paths for better reliability)
define('WORKER_WELCOME_EMAIL_SCRIPT', dirname(__DIR__) . '/workers/send_welcome_email.php');

// Pagination
define('DEFAULT_PAGE_SIZE', 20);
define('MAX_PAGE_SIZE', 300);

// Property Limits
define('FREE_PLAN_PROPERTY_LIMIT', 3);
define('BASIC_PLAN_PROPERTY_LIMIT', 10);
define('PRO_PLAN_PROPERTY_LIMIT', 50);
define('PREMIUM_PLAN_PROPERTY_LIMIT', -1); // Unlimited
// Razorpay listing plans
define('BASIC_LISTING_PROPERTY_LIMIT', 1);  // Basic Plan: ₹99, 1 property, 1 month
define('PRO_LISTING_PROPERTY_LIMIT', 5);    // Pro Plan: ₹399, 5 properties, 1 month

// ============================================
// IMAGE MODERATION CONFIGURATION
// ============================================
// Google Cloud Vision API Configuration
// SECURITY: Use environment variable for credentials path
$googleCredentialsPath = getenv('GOOGLE_APPLICATION_CREDENTIALS');
if (empty($googleCredentialsPath)) {
    // Production path(s) (Hostinger shared hosting).
    // Try current domain first (demo1.360coordinates.com vs 360coordinates.com), then fallback to main domain.
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $hostNoPort = preg_replace('/:\d+$/', '', $host);
    $candidatePaths = [];
    if (!empty($hostNoPort)) {
        $candidatePaths[] = "/home/u449667423/domains/{$hostNoPort}/Secure/indiapropertys-8fab286d41e4.json";
    }
    $candidatePaths[] = '/home/u449667423/domains/360coordinates.com/Secure/indiapropertys-8fab286d41e4.json';
    $candidatePaths[] = __DIR__ . '/../config/google-cloud-credentials.json';

    foreach ($candidatePaths as $p) {
        if (!empty($p) && file_exists($p)) {
            $googleCredentialsPath = $p;
            break;
        }
    }

    if (empty($googleCredentialsPath)) {
        // Keep a useful warning if nothing exists.
        if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
            error_log('SECURITY WARNING: Google Cloud credentials file not found in any expected location!');
        }
        // Set to the legacy production path for error messages downstream.
        $googleCredentialsPath = $candidatePaths[1];
    }
}
define('GOOGLE_APPLICATION_CREDENTIALS', $googleCredentialsPath);

// Moderation Thresholds (0.0 to 1.0)
// These values determine when content is flagged as unsafe or needs review
define('MODERATION_ADULT_THRESHOLD', (float)(getenv('MODERATION_ADULT_THRESHOLD') ?: 0.6));
define('MODERATION_RACY_THRESHOLD', (float)(getenv('MODERATION_RACY_THRESHOLD') ?: 0.7));
define('MODERATION_VIOLENCE_THRESHOLD', (float)(getenv('MODERATION_VIOLENCE_THRESHOLD') ?: 0.5));
define('MODERATION_MEDICAL_THRESHOLD', (float)(getenv('MODERATION_MEDICAL_THRESHOLD') ?: 0.6));
define('MODERATION_ANIMAL_THRESHOLD', (float)(getenv('MODERATION_ANIMAL_THRESHOLD') ?: 0.7));

// Image Upload Limits for Moderation
define('MAX_IMAGE_SIZE_MB', (int)(getenv('MAX_IMAGE_SIZE_MB') ?: 5));
define('MAX_IMAGE_SIZE_BYTES', MAX_IMAGE_SIZE_MB * 1024 * 1024);

// Allowed Image Types for Moderation (comma-separated string)
$allowedImageTypesStr = getenv('ALLOWED_IMAGE_TYPES') ?: 'jpg,jpeg,png,webp';
$allowedImageTypesArray = array_map('trim', explode(',', $allowedImageTypesStr));
define('ALLOWED_IMAGE_TYPES_STR', $allowedImageTypesStr);
define('ALLOWED_IMAGE_TYPES_ARRAY', $allowedImageTypesArray);

// Moderation Upload Directories
define('UPLOAD_TEMP_DIR', UPLOAD_DIR . 'temp/');
define('UPLOAD_PROPERTIES_DIR', UPLOAD_DIR . 'properties/');
define('UPLOAD_REVIEW_DIR', UPLOAD_DIR . 'review/');
define('UPLOAD_REJECTED_DIR', UPLOAD_DIR . 'rejected/');

// Create moderation upload directories if they don't exist
$moderationDirs = [
    UPLOAD_TEMP_DIR,
    UPLOAD_PROPERTIES_DIR,
    UPLOAD_REVIEW_DIR,
    UPLOAD_REJECTED_DIR
];

foreach ($moderationDirs as $dir) {
    if (!file_exists($dir)) {
        mkdir($dir, 0755, true);
    }
}

// Database connection is handled by database.php
// Use Database::getInstance()->getConnection() or getDB() function
// 
// For InfinityFree hosting, uncomment and update these credentials:
// $host     = "sql101.infinityfree.com";
// $username = "if0_40672958";
// $password = "Vedant2020";
// $database = "if0_40672958_indiapropertys_db";
// $conn = new mysqli($host, $username, $password, $database);
// if ($conn->connect_error) {
//     die(json_encode(['error' => 'Connection failed']));
// }
// $conn->set_charset("utf8mb4");

