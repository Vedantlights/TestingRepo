<?php
/**
 * Response Helper Functions
 */

// Set CORS headers
if (!function_exists('setCorsHeaders')) {
function setCorsHeaders() {
    // Allowed origins - add production URLs here
    $allowedOrigins = [
        // Local development
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        // Test API
        'https://testapi.360coordinates.com',
        'https://www.testapi.360coordinates.com',
        // Production
        'https://360coordinates.com',
        'https://www.360coordinates.com',
        'https://demo1.360coordinates.com',
        'https://www.demo1.360coordinates.com',
    ];
    
    // Get origin from request
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
    
    // If no origin header, try Referer header
    if (empty($origin) && isset($_SERVER['HTTP_REFERER'])) {
        $parsedUrl = parse_url($_SERVER['HTTP_REFERER']);
        if (isset($parsedUrl['scheme']) && isset($parsedUrl['host'])) {
            // Build origin from scheme and host
            $origin = $parsedUrl['scheme'] . '://' . $parsedUrl['host'];
            // Include port if present (and not default port)
            if (isset($parsedUrl['port'])) {
                $defaultPort = ($parsedUrl['scheme'] === 'https') ? 443 : 80;
                if ($parsedUrl['port'] != $defaultPort) {
                    $origin .= ':' . $parsedUrl['port'];
                }
            }
        }
    }
    
    // Set CORS origin header
    // Website requests: If Origin header exists, check if it's allowed
    if (!empty($origin)) {
        if (in_array($origin, $allowedOrigins)) {
            // Website request from allowed origin - set CORS header
            header("Access-Control-Allow-Origin: $origin");
        } elseif (defined('ENVIRONMENT') && ENVIRONMENT === 'development') {
            // In development, allow any origin for easier testing
            header("Access-Control-Allow-Origin: $origin");
        }
        // If origin exists but not allowed (production), don't set CORS header (blocks request)
    }
    // Mobile app requests: No Origin header - don't set Access-Control-Allow-Origin
    // Mobile apps don't need CORS headers, so request will work without them
    // Other CORS headers (methods, headers, credentials) are still set below for OPTIONS requests
    
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400'); // Cache preflight for 24 hours
    header('Content-Type: application/json; charset=utf-8');
    
    // Security headers
    header('X-Content-Type-Options: nosniff');
    header('X-XSS-Protection: 1; mode=block');
    header('X-Frame-Options: SAMEORIGIN');
    // Only add Strict-Transport-Security in production with HTTPS
    if (defined('ENVIRONMENT') && ENVIRONMENT === 'production' && 
        (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')) {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
    // Content-Security-Policy for API responses (minimal since it's JSON)
    header("Content-Security-Policy: default-src 'self'");
}
}

// Handle preflight requests
if (!function_exists('handlePreflight')) {
function handlePreflight() {
    // Clear any output buffer before setting headers
    if (ob_get_level() > 0) {
        ob_clean();
    }
    
    // Always set CORS headers first
    setCorsHeaders();
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        // Preflight request - just send headers and exit
        http_response_code(200);
        // Clean exit without any output
        if (ob_get_level() > 0) {
            ob_end_clean();
        }
        exit();
    }
}
}

// Send JSON response
if (!function_exists('sendResponse')) {
function sendResponse($success, $message = '', $data = null, $statusCode = 200) {
    // Clear ALL output buffers to ensure clean JSON (catch any PHP warnings/notices)
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    // Make sure headers haven't been sent
    if (headers_sent($file, $line)) {
        error_log("Headers already sent in $file at line $line");
        // If headers were sent, we can't send proper JSON, but try anyway
        echo "\n"; // Add newline to separate from any previous output
    }
    
    setCorsHeaders();
    http_response_code($statusCode);
    
    $response = [
        'success' => $success,
        'message' => $message,
    ];
    
    if ($data !== null) {
        $response['data'] = $data;
    }
    
    $json = json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    
    if ($json === false) {
        // JSON encoding failed - log error and send error response
        error_log("JSON encoding failed: " . json_last_error_msg());
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'message' => 'Server error: Failed to encode response',
            'error' => json_last_error_msg()
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit();
    }
    
    echo $json;
    exit();
}
}

// Send success response
if (!function_exists('sendSuccess')) {
function sendSuccess($message = 'Success', $data = null, $statusCode = 200) {
    sendResponse(true, $message, $data, $statusCode);
}
}

// Send error response
if (!function_exists('sendError')) {
function sendError($message = 'Error', $data = null, $statusCode = 400) {
    sendResponse(false, $message, $data, $statusCode);
}
}

// Send validation error response
if (!function_exists('sendValidationError')) {
function sendValidationError($errors, $message = 'Validation failed') {
    sendResponse(false, $message, ['errors' => $errors], 422);
}
}

