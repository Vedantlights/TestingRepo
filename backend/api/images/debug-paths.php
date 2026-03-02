<?php
/**
 * Image Path Debug Endpoint
 * Shows where images are being saved and their accessible URLs
 * 
 * Access: https://360coordinates.com/backend/api/images/debug-paths.php
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: text/plain; charset=utf-8');
header('Access-Control-Allow-Origin: *');

echo "=== IMAGE PATH DEBUG ===\n\n";

// Get document root
$docRoot = $_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/../../..';
echo "Document Root: {$docRoot}\n";
echo "Script Path: " . __FILE__ . "\n\n";

// Check base upload directory
$baseDir = $docRoot . '/uploads/properties/';
echo "Base upload directory: {$baseDir}\n";
echo "Directory exists: " . (is_dir($baseDir) ? "YES" : "NO") . "\n";
if (is_dir($baseDir)) {
    echo "Directory writable: " . (is_writable($baseDir) ? "YES" : "NO") . "\n";
    echo "Directory permissions: " . substr(sprintf('%o', fileperms($baseDir)), -4) . "\n";
} else {
    echo "Attempting to create directory...\n";
    if (@mkdir($baseDir, 0755, true)) {
        echo "Directory created successfully!\n";
    } else {
        echo "Failed to create directory. Check permissions.\n";
    }
}
echo "\n";

// Check alternative paths
$altPaths = [
    __DIR__ . '/../../uploads/properties/',
    $docRoot . '/backend/uploads/properties/',
    __DIR__ . '/../../../uploads/properties/'
];

echo "Alternative paths checked:\n";
foreach ($altPaths as $idx => $altPath) {
    echo "  Path " . ($idx + 1) . ": {$altPath}\n";
    echo "    Exists: " . (is_dir($altPath) ? "YES" : "NO") . "\n";
    if (is_dir($altPath)) {
        echo "    Writable: " . (is_writable($altPath) ? "YES" : "NO") . "\n";
    }
}
echo "\n";

// List property folders
if (is_dir($baseDir)) {
    echo "Property folders in {$baseDir}:\n";
    $folders = @scandir($baseDir);
    if ($folders === false) {
        echo "  ERROR: Cannot read directory (permission issue?)\n";
    } else {
        $hasFolders = false;
        foreach ($folders as $folder) {
            if ($folder !== '.' && $folder !== '..') {
                $hasFolders = true;
                $folderPath = $baseDir . $folder;
                echo "  - {$folder}/\n";
                if (is_dir($folderPath)) {
                    $files = @scandir($folderPath);
                    if ($files !== false) {
                        $fileCount = 0;
                        foreach ($files as $file) {
                            if ($file !== '.' && $file !== '..') {
                                $fileCount++;
                                $filePath = $folderPath . '/' . $file;
                                $fileSize = is_file($filePath) ? filesize($filePath) : 0;
                                echo "      - {$file} (" . number_format($fileSize) . " bytes)\n";
                            }
                        }
                        if ($fileCount === 0) {
                            echo "      (empty folder)\n";
                        }
                    } else {
                        echo "      (cannot read folder)\n";
                    }
                }
            }
        }
        if (!$hasFolders) {
            echo "  (no property folders found)\n";
        }
    }
} else {
    echo "Base directory does not exist. Images cannot be saved here.\n";
}

echo "\n=== URL MAPPING ===\n";
$host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$baseUrl = $protocol . '://' . $host;

echo "Base URL: {$baseUrl}\n";
echo "Expected image URL format:\n";
echo "  {$baseUrl}/backend/uploads/properties/{property_id}/{filename}\n";
echo "\nExample:\n";
echo "  {$baseUrl}/backend/uploads/properties/74/img_123.webp\n";
echo "\n";

// Check if .htaccess exists in uploads folder
$htaccessPath = $docRoot . '/uploads/.htaccess';
echo "=== SECURITY CHECK ===\n";
echo ".htaccess in uploads/: " . (file_exists($htaccessPath) ? "EXISTS" : "MISSING") . "\n";
if (file_exists($htaccessPath)) {
    echo "Content:\n";
    echo file_get_contents($htaccessPath) . "\n";
} else {
    echo "WARNING: .htaccess missing - PHP files could be executed!\n";
}

echo "\n=== CONFIGURATION CHECK ===\n";
require_once __DIR__ . '/../../config/config.php';
if (defined('BASE_URL')) {
    echo "BASE_URL: " . BASE_URL . "\n";
}
if (defined('UPLOAD_BASE_URL')) {
    echo "UPLOAD_BASE_URL: " . UPLOAD_BASE_URL . "\n";
}

require_once __DIR__ . '/../../config/moderation.php';
if (defined('UPLOAD_PROPERTIES_PATH')) {
    echo "UPLOAD_PROPERTIES_PATH: " . UPLOAD_PROPERTIES_PATH . "\n";
    echo "Path exists: " . (is_dir(UPLOAD_PROPERTIES_PATH) ? "YES" : "NO") . "\n";
}

echo "\n=== DEBUG COMPLETE ===\n";

