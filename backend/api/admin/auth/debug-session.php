<?php
/**
 * Debug Session - Access directly in browser to diagnose issue
 * URL: https://360coordinates.com/backend/api/admin/auth/debug-session.php
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: https://testapi.360coordinates.com');
header('Access-Control-Allow-Credentials: true');

// Don't start session yet - check raw state first
$debug = [
    'step1_cookies_received' => $_COOKIE,
    'step2_session_status_before' => session_status(),
    'step3_session_id_before' => session_id(),
];

// Now start session
session_start();

$debug['step4_session_status_after'] = session_status();
$debug['step5_session_id_after'] = session_id();
$debug['step6_session_data'] = $_SESSION;

// Check database
require_once __DIR__ . '/../../../config/database.php';

try {
    $db = getDB();
    $debug['step7_db_connected'] = true;
    
    // Get all admin sessions
    $stmt = $db->query("SELECT id, session_id, admin_id, admin_mobile, created_at, expires_at FROM admin_sessions ORDER BY created_at DESC LIMIT 5");
    $debug['step8_recent_sessions'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Check if current session exists in DB
    $currentSessionId = session_id();
    $stmt = $db->prepare("SELECT * FROM admin_sessions WHERE session_id = ?");
    $stmt->execute([$currentSessionId]);
    $debug['step9_current_session_in_db'] = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // Get whitelist
    $stmt = $db->query("SELECT * FROM admin_whitelist");
    $debug['step10_whitelist'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get admin users
    $stmt = $db->query("SELECT id, username, email, phone, role, is_active FROM admin_users LIMIT 5");
    $debug['step11_admin_users'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
} catch (Exception $e) {
    $debug['db_error'] = $e->getMessage();
}

// Cookie settings
$debug['step12_cookie_params'] = session_get_cookie_params();
$debug['step13_server_https'] = $_SERVER['HTTPS'] ?? 'not set';
$debug['step14_server_host'] = $_SERVER['HTTP_HOST'] ?? 'not set';

echo json_encode($debug, JSON_PRETTY_PRINT);

