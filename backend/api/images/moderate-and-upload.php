<?php
/**
 * Image Moderation and Upload API
 * POST /api/images/moderate-and-upload.php
 * 
 * Processing Flow (ENFORCED ORDER):
 * 1. File validation (type, size, corruption check)
 * 2. Google Vision API call
 * 3. SafeSearch evaluation
 * 4. Human detection (face OR object localization only, NOT labels alone)
 * 5. Animal detection (object localization OR label+object, NOT labels alone)
 * 6. Property context scoring
 * 7. Final decision (approve / reject / manual review)
 */

// Step 1: Setup Error Handling and Headers
// Temporarily enable error display for debugging (disable in production)
// Set to 1 to see errors, 0 for production
$debugMode = isset($_GET['debug']) && $_GET['debug'] === '1';
ini_set('display_errors', $debugMode ? 1 : 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// Start output buffering FIRST
ob_start();

// Helper function to send clean JSON responses (defined early so error handlers can use it)
function sendJsonResponse($data, $statusCode = 200) {
    // Clean output buffer to remove any warnings/notices
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    // Set headers (replace any existing)
    header('Content-Type: application/json', true);
    header('Access-Control-Allow-Origin: *', true);
    header('Access-Control-Allow-Methods: POST, OPTIONS', true);
    header('Access-Control-Allow-Headers: Content-Type, Authorization', true);
    
    // Send JSON
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

// Set error handler to catch PHP errors
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    error_log("PHP Error [$errno]: $errstr in $errfile on line $errline");
    if ($errno === E_ERROR || $errno === E_PARSE || $errno === E_CORE_ERROR || $errno === E_COMPILE_ERROR) {
        // Use sendJsonResponse if available, otherwise fallback
        if (function_exists('sendJsonResponse')) {
            sendJsonResponse([
                'status' => 'error',
                'message' => 'Server error occurred',
                'error_code' => 'php_error',
                'details' => defined('ENVIRONMENT') && ENVIRONMENT === 'development' ? "$errstr in $errfile on line $errline" : 'Please try again'
            ], 500);
        } else {
            // Fallback if function not available yet
            while (ob_get_level() > 0) {
                ob_end_clean();
            }
            header('Content-Type: application/json', true);
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'message' => 'Server error occurred',
                'error_code' => 'php_error',
                'details' => defined('ENVIRONMENT') && ENVIRONMENT === 'development' ? "$errstr in $errfile on line $errline" : 'Please try again'
            ]);
            exit;
        }
    }
    return false; // Let PHP handle other errors
});

// Set exception handler
set_exception_handler(function($e) {
    error_log("Uncaught Exception: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine());
    // Use sendJsonResponse if available, otherwise fallback
    if (function_exists('sendJsonResponse')) {
        sendJsonResponse([
            'status' => 'error',
            'message' => 'Server error occurred',
            'error_code' => 'exception',
            'details' => defined('ENVIRONMENT') && ENVIRONMENT === 'development' ? $e->getMessage() : 'Please try again'
        ], 500);
    } else {
        // Fallback if function not available yet
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: application/json', true);
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'message' => 'Server error occurred',
            'error_code' => 'exception',
            'details' => defined('ENVIRONMENT') && ENVIRONMENT === 'development' ? $e->getMessage() : 'Please try again'
        ]);
        exit;
    }
});

// Set headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle OPTIONS request (CORS preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// CRITICAL: Check request method EARLY (before any other processing)
// Handle method override (for servers that convert POST to GET due to redirects)
$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN';

// Check for method override header (some frameworks/servers use this)
if (isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
    $overrideMethod = strtoupper(trim($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']));
    if (in_array($overrideMethod, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
        $requestMethod = $overrideMethod;
        error_log("moderate-and-upload.php: Method override detected - using {$requestMethod} from X-HTTP-Method-Override header");
    }
}

// Check for method override headers (some servers/proxies use these)
if ($requestMethod === 'GET' || $requestMethod === 'POST') {
    // Check X-HTTP-Method-Override header (common in some frameworks)
    if (isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
        $overrideMethod = strtoupper(trim($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']));
        if ($overrideMethod === 'POST') {
            $requestMethod = 'POST';
            error_log("moderate-and-upload.php: Method override detected - using POST from X-HTTP-Method-Override header");
        }
    }
    
    // Check if it's actually a POST request that was converted to GET (check for POST data in query string or input)
    // Some servers redirect POST to GET, but we can detect it by checking for form data
    if ($requestMethod === 'GET') {
        // Check if there's POST-like data in the request (indicates it might be a converted POST)
        $hasPostData = !empty($_POST) || !empty($_FILES);
        $inputData = file_get_contents('php://input');
        $hasInputData = !empty($inputData) && strlen($inputData) > 0;
        
        // If we have POST/FILES data or input data, it's likely a POST that was converted
        if ($hasPostData || $hasInputData) {
            error_log("moderate-and-upload.php: WARNING: GET request has POST/FILES data - likely a converted POST request");
            error_log("moderate-and-upload.php: Attempting to process as POST based on data presence");
            // Don't change method here - we'll handle it in the actual processing
            // But log it for debugging
        }
    }
}

$contentType = $_SERVER['CONTENT_TYPE'] ?? 'NOT SET';
$requestUri = $_SERVER['REQUEST_URI'] ?? 'NOT SET';

// Log request details for debugging
error_log("moderate-and-upload.php: === REQUEST DEBUG ===");
error_log("moderate-and-upload.php: Method: {$requestMethod}");
error_log("moderate-and-upload.php: Content-Type: {$contentType}");
error_log("moderate-and-upload.php: Request URI: {$requestUri}");
error_log("moderate-and-upload.php: Has POST data: " . (empty($_POST) ? 'NO' : 'YES'));
error_log("moderate-and-upload.php: Has FILES data: " . (empty($_FILES) ? 'NO' : 'YES'));
$inputPreview = file_get_contents('php://input');
error_log("moderate-and-upload.php: php://input size: " . strlen($inputPreview) . " bytes");
if (strlen($inputPreview) > 0 && strlen($inputPreview) < 200) {
    error_log("moderate-and-upload.php: php://input preview: " . substr($inputPreview, 0, 200));
}

// CRITICAL FIX: Handle GET requests that should be POST
// Some servers/proxies convert POST to GET, but we can detect this
$isConvertedPost = false;

if ($requestMethod === 'GET') {
    // Check if this is a true GET (browser direct access) or converted POST
    $hasPostData = !empty($_POST) || !empty($_FILES);
    $hasInputData = !empty($inputPreview) && strlen($inputPreview) > 0;
    
    // Check query string for POST data (some servers put POST data in query string)
    $hasQueryData = !empty($_GET) && (isset($_GET['firebase_url']) || isset($_GET['property_id']));
    
    if ($hasPostData || $hasInputData || $hasQueryData) {
        $isConvertedPost = true;
        error_log("moderate-and-upload.php: ⚠️ Detected converted POST (GET with data) - treating as POST");
    } else {
        // True GET request - this is likely a direct browser access
        error_log("moderate-and-upload.php: ❌ True GET request detected - no POST data found");
        error_log("moderate-and-upload.php: This endpoint requires POST. Are you accessing it directly in a browser?");
        sendJsonResponse([
            'status' => 'error', 
            'message' => 'Method not allowed',
            'error_code' => 'method_not_allowed',
            'details' => "This endpoint only accepts POST requests. Received: GET. This endpoint cannot be accessed directly in a browser. It must be called via POST from your application.",
            'received_method' => $requestMethod,
            'allowed_methods' => ['POST', 'OPTIONS'],
            'content_type' => $contentType,
            'request_uri' => $requestUri,
            'debug_info' => [
                'has_post' => $hasPostData,
                'has_files' => !empty($_FILES),
                'has_input' => $hasInputData,
                'has_query' => $hasQueryData,
                'server_method' => $_SERVER['REQUEST_METHOD'] ?? 'NOT SET',
                'http_method_override' => $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? 'NOT SET',
            ],
            'solution' => 'This is an API endpoint that requires POST method. Ensure your frontend code is sending a POST request with FormData. Check browser Network tab to verify the request method is POST, not GET.'
        ], 405);
    }
}

// Reject non-POST requests (unless converted POST)
if ($requestMethod !== 'POST' && !$isConvertedPost) {
    error_log("moderate-and-upload.php: ❌ Rejecting {$requestMethod} request - only POST is allowed");
    sendJsonResponse([
        'status' => 'error', 
        'message' => 'Method not allowed',
        'error_code' => 'method_not_allowed',
        'details' => "This endpoint only accepts POST requests. Received: {$requestMethod}",
        'received_method' => $requestMethod,
        'allowed_methods' => ['POST', 'OPTIONS'],
        'content_type' => $contentType,
        'request_uri' => $requestUri,
        'debug_info' => [
            'has_post' => !empty($_POST),
            'has_files' => !empty($_FILES),
            'has_input' => !empty($inputPreview),
            'server_method' => $_SERVER['REQUEST_METHOD'] ?? 'NOT SET',
            'http_method_override' => $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? 'NOT SET',
        ],
        'solution' => 'Ensure your frontend is sending a POST request with FormData. Check browser Network tab to verify the request method is POST.'
    ], 405);
}

// If it's a converted POST (GET with POST data), treat it as POST
if ($isConvertedPost) {
    error_log("moderate-and-upload.php: ⚠️ Treating GET request with POST data as POST (likely server redirect issue)");
    $requestMethod = 'POST';
}

error_log("moderate-and-upload.php: ✅ POST request accepted (method: {$requestMethod})");

// Step 2: Load Composer autoload FIRST (before other requires)
// Check root vendor first (where vendor directory is located), then backend vendor as fallback
$rootVendorPath = __DIR__ . '/../../../vendor/autoload.php';  // Root vendor
$backendVendorPath = __DIR__ . '/../../vendor/autoload.php';  // Backend vendor (fallback)
$parentVendorPath = __DIR__ . '/../../../../vendor/autoload.php';  // Parent (in case vendor is one level above backend/)

$vendorAutoloadPath = null;
if (file_exists($rootVendorPath)) {
    $vendorAutoloadPath = $rootVendorPath;
} elseif (file_exists($backendVendorPath)) {
    $vendorAutoloadPath = $backendVendorPath;
} elseif (file_exists($parentVendorPath)) {
    $vendorAutoloadPath = $parentVendorPath;
}

$composerAvailable = ($vendorAutoloadPath !== null);
if ($composerAvailable) {
    require_once $vendorAutoloadPath;
    error_log("Composer autoload loaded successfully from: {$vendorAutoloadPath}");
} else {
    error_log("WARNING: Composer autoload not found at root vendor: {$rootVendorPath}");
    error_log("WARNING: Composer autoload not found at backend vendor: {$backendVendorPath}");
    error_log("Google Vision moderation will be skipped. Image will be marked as PENDING.");
}

// Step 3: Load config files (wrap in try-catch to catch fatal errors)
try {
    require_once __DIR__ . '/../../config/config.php';
    require_once __DIR__ . '/../../config/database.php';
    require_once __DIR__ . '/../../config/moderation.php';
    
    // Verify critical constants are defined after loading
    if (!defined('UPLOAD_TEMP_PATH') || !defined('UPLOAD_PROPERTIES_PATH')) {
        error_log("WARNING: Upload path constants not defined after loading moderation.php");
        error_log("UPLOAD_TEMP_PATH defined: " . (defined('UPLOAD_TEMP_PATH') ? 'YES' : 'NO'));
        error_log("UPLOAD_PROPERTIES_PATH defined: " . (defined('UPLOAD_PROPERTIES_PATH') ? 'YES' : 'NO'));
    }
    
    if (!defined('UPLOAD_BASE_URL')) {
        error_log("WARNING: UPLOAD_BASE_URL not defined after loading config.php");
    }
    
    if (!defined('MAX_IMAGE_SIZE_BYTES')) {
        error_log("WARNING: MAX_IMAGE_SIZE_BYTES not defined after loading moderation.php");
    }
} catch (Throwable $e) {
    error_log("FATAL: Failed to load config files: " . $e->getMessage());
    error_log("File: " . $e->getFile() . " Line: " . $e->getLine());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse([
        'status' => 'error',
        'message' => 'Configuration error',
        'error_code' => 'config_error',
        'details' => defined('ENVIRONMENT') && ENVIRONMENT === 'development' ? $e->getMessage() : 'Please contact support',
        'error_file' => $e->getFile(),
        'error_line' => $e->getLine()
    ], 500);
}

// Step 4: Load services (only if Composer is available)
if ($composerAvailable) {
    // Check if classes will be available before requiring
    // Note: We can't check before require, but we'll catch errors
    try {
        require_once __DIR__ . '/../../services/GoogleVisionService.php';
        // Verify class was loaded successfully
        if (!class_exists('GoogleVisionService')) {
            error_log("WARNING: GoogleVisionService class not found after require");
            $composerAvailable = false; // Mark as unavailable
        }
    } catch (Throwable $e) {
        error_log("ERROR: Failed to load GoogleVisionService: " . $e->getMessage());
        error_log("This usually means Composer dependencies are not installed");
        error_log("Exception type: " . get_class($e));
        error_log("Exception file: " . $e->getFile() . " Line: " . $e->getLine());
        $composerAvailable = false; // Mark as unavailable
    }
    
    if ($composerAvailable && file_exists(__DIR__ . '/../../services/ModerationDecisionService.php')) {
        require_once __DIR__ . '/../../services/ModerationDecisionService.php';
    }
}

// Load WatermarkService (wrap in try-catch)
try {
    require_once __DIR__ . '/../../services/WatermarkService.php';
    if (!class_exists('WatermarkService')) {
        error_log("WARNING: WatermarkService class not found");
    }
} catch (Throwable $e) {
    error_log("WARNING: Failed to load WatermarkService: " . $e->getMessage());
    // Continue anyway - watermark is optional
}

// Load FirebaseStorageService for re-uploading watermarked Firebase images
try {
    require_once __DIR__ . '/../../services/FirebaseStorageService.php';
} catch (Throwable $e) {
    error_log("WARNING: Failed to load FirebaseStorageService: " . $e->getMessage());
}

// Step 5: Load helpers (wrap in try-catch)
try {
    require_once __DIR__ . '/../../helpers/FileHelper.php';
    if (file_exists(__DIR__ . '/../../helpers/BlurDetector.php')) {
        require_once __DIR__ . '/../../helpers/BlurDetector.php';
    }
} catch (Throwable $e) {
    error_log("FATAL: Failed to load helpers: " . $e->getMessage());
    sendJsonResponse([
        'status' => 'error',
        'message' => 'Helper files error',
        'error_code' => 'helper_error'
    ], 500);
}

// Step 6: Load utilities (wrap in try-catch)
try {
    require_once __DIR__ . '/../../utils/auth.php';
    
    // Verify getCurrentUser function exists
    if (!function_exists('getCurrentUser')) {
        error_log("FATAL: getCurrentUser function not found in auth.php");
        sendJsonResponse([
            'status' => 'error',
            'message' => 'Authentication system error',
            'error_code' => 'auth_function_missing'
        ], 500);
    }
} catch (Throwable $e) {
    error_log("FATAL: Failed to load auth utilities: " . $e->getMessage());
    sendJsonResponse([
        'status' => 'error',
        'message' => 'Authentication system error',
        'error_code' => 'auth_error'
    ], 500);
}

// Ensure moderation thresholds are defined (with fallback defaults)
// These are already defined in moderation.php, but provide fallbacks just in case
if (!defined('MODERATION_ADULT_THRESHOLD')) {
    define('MODERATION_ADULT_THRESHOLD', 0.6);
}
if (!defined('MODERATION_VIOLENCE_THRESHOLD')) {
    define('MODERATION_VIOLENCE_THRESHOLD', 0.6);
}
if (!defined('MODERATION_RACY_THRESHOLD')) {
    define('MODERATION_RACY_THRESHOLD', 0.6);
}
if (!defined('MODERATION_FACE_THRESHOLD')) {
    define('MODERATION_FACE_THRESHOLD', 0.5);  // Strict threshold for human face detection
}
if (!defined('MODERATION_HUMAN_OBJECT_THRESHOLD')) {
    define('MODERATION_HUMAN_OBJECT_THRESHOLD', 0.5);  // Strict threshold for human object detection
}
if (!defined('MODERATION_HUMAN_LABEL_THRESHOLD')) {
    define('MODERATION_HUMAN_LABEL_THRESHOLD', 0.3);  // Lowered to 0.3 to catch more human detections (very sensitive)
}
if (!defined('MODERATION_ANIMAL_OBJECT_THRESHOLD')) {
    define('MODERATION_ANIMAL_OBJECT_THRESHOLD', 0.5);  // Strict threshold for animal object detection
}
if (!defined('MODERATION_ANIMAL_LABEL_THRESHOLD')) {
    define('MODERATION_ANIMAL_LABEL_THRESHOLD', 0.6);  // Strict threshold for animal label detection
}
if (!defined('MIN_IMAGE_WIDTH')) {
    define('MIN_IMAGE_WIDTH', 400);
}
if (!defined('MIN_IMAGE_HEIGHT')) {
    define('MIN_IMAGE_HEIGHT', 300);
}
if (!defined('MODERATION_BLUR_THRESHOLD')) {
    // Use BLUR_THRESHOLD if defined, otherwise use default
    if (defined('BLUR_THRESHOLD')) {
        define('MODERATION_BLUR_THRESHOLD', BLUR_THRESHOLD);
    } else {
        define('MODERATION_BLUR_THRESHOLD', 0.4);
    }
}
if (!defined('PROPERTY_CONTEXT_THRESHOLD')) {
    define('PROPERTY_CONTEXT_THRESHOLD', 0.3);
}

//ob_clean();

// Method check already done above - this is just a safety check
// (Method validation moved earlier to catch issues before config loading)

try {
    // Step 2: Check Authentication
    // Note: Using JWT token authentication, not sessions - session_start() not needed
    // session_start(); // REMOVED - causes header issues and not needed for JWT auth
    $user = getCurrentUser();
    if (!$user) {
        sendJsonResponse(['status' => 'error', 'message' => 'Please login to upload images'], 401);
    }
    
    $userId = $user['id'];
    
    // Check if this is validation-only mode (for new properties)
    $validateOnly = isset($_POST['validate_only']) && $_POST['validate_only'] === 'true';
    
    // Validate property_id
    $propertyId = isset($_POST['property_id']) ? intval($_POST['property_id']) : 0;
    
    // If validate_only mode, property_id can be 0
    if (!$validateOnly && $propertyId <= 0) {
        sendJsonResponse(['status' => 'error', 'message' => 'Valid property ID is required'], 400);
    }
    
    // Verify property belongs to user (skip if validate_only)
    if (!$validateOnly && $propertyId > 0) {
        $db = getDB();
        $stmt = $db->prepare("SELECT id, user_id FROM properties WHERE id = ?");
        $stmt->execute([$propertyId]);
        $property = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$property) {
            sendJsonResponse(['status' => 'error', 'message' => 'Property not found'], 404);
        }
        
        if ($property['user_id'] != $userId) {
            sendJsonResponse(['status' => 'error', 'message' => 'You do not have permission to upload images for this property'], 403);
        }
    }
    
    // Step 3: Check if Firebase URL is provided instead of file upload
    $firebaseUrl = null;
    $firebaseTempFile = null;
    
    // Check for Firebase URL in POST data (from FormData or JSON)
    if (isset($_POST['firebase_url']) && !empty($_POST['firebase_url'])) {
        $firebaseUrl = trim($_POST['firebase_url']);
    } elseif (isset($_FILES['firebase_url']) && !empty($_FILES['firebase_url']['tmp_name'])) {
        // Sometimes FormData sends it as a file field
        $firebaseUrl = file_get_contents($_FILES['firebase_url']['tmp_name']);
        $firebaseUrl = trim($firebaseUrl);
    }
    
    // Step 3.5: Get Uploaded File (if Firebase URL not provided)
    $file = null;
    $fileKey = null;
    
    // If Firebase URL is provided, download from Firebase and process it
    if ($firebaseUrl && strpos($firebaseUrl, 'firebasestorage.googleapis.com') !== false) {
        // Set Firebase service account credentials before any Firebase Storage usage
        putenv('GOOGLE_APPLICATION_CREDENTIALS=' . __DIR__ . '/../../firebase-key.json');

        // Validate Firebase URL format
        if (!filter_var($firebaseUrl, FILTER_VALIDATE_URL)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid Firebase URL format'], 400);
        }
        
        // Check if curl extension is available
        if (!function_exists('curl_init')) {
            error_log("ERROR: cURL extension not available - cannot download from Firebase");
            sendJsonResponse([
                'status' => 'error', 
                'message' => 'Server configuration error: cURL extension required for Firebase uploads',
                'error_code' => 'curl_missing',
                'fallback' => 'Please install PHP cURL extension or use regular file upload'
            ], 500);
        }
        
        // Download image from Firebase Storage
        $firebaseTempFile = tempnam(sys_get_temp_dir(), 'firebase_img_');
        if ($firebaseTempFile === false) {
            error_log("ERROR: Failed to create temp file for Firebase download");
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to create temporary file'], 500);
        }
        
        $ch = curl_init($firebaseUrl);
        if ($ch === false) {
            error_log("ERROR: Failed to initialize cURL");
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to initialize download'], 500);
        }
        
        $fp = fopen($firebaseTempFile, 'wb');
        if ($fp === false) {
            curl_close($ch);
            @unlink($firebaseTempFile);
            error_log("ERROR: Failed to open temp file for writing");
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to create temporary file'], 500);
        }
        
        curl_setopt($ch, CURLOPT_FILE, $fp);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        
        $curlResult = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        fclose($fp);
        
        if ($curlResult === false || $httpCode !== 200) {
            if ($firebaseTempFile && file_exists($firebaseTempFile)) {
                @unlink($firebaseTempFile);
            }
            error_log("Failed to download from Firebase: HTTP {$httpCode}, Error: {$curlError}");
            sendJsonResponse([
                'status' => 'error', 
                'message' => 'Failed to download image from Firebase: ' . ($curlError ?: "HTTP {$httpCode}"),
                'error_code' => 'firebase_download_failed'
            ], 400);
        }
        
        // Verify it's a valid image file
        $imageInfo = @getimagesize($firebaseTempFile);
        if (!$imageInfo || !isset($imageInfo['mime'])) {
            if ($firebaseTempFile && file_exists($firebaseTempFile)) {
                unlink($firebaseTempFile);
            }
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid image file from Firebase'], 400);
        }
        
        // Create file array similar to $_FILES
        $file = [
            'name' => basename(parse_url($firebaseUrl, PHP_URL_PATH)) ?: 'firebase_image.jpg',
            'type' => $imageInfo['mime'],
            'tmp_name' => $firebaseTempFile,
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($firebaseTempFile)
        ];
        
        $fileKey = 'firebase_url';
        error_log("Firebase URL provided: {$firebaseUrl}, downloaded to: {$firebaseTempFile}");
        
        // For Firebase URLs, we still need to process the file through moderation
        // but we'll skip server saving later. Continue with normal file processing.
    } else {
        // Check multiple possible keys for regular file upload
        if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['image'];
            $fileKey = 'image';
        } elseif (isset($_FILES['images']) && $_FILES['images']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['images'];
            $fileKey = 'images';
        } elseif (isset($_FILES['images']) && is_array($_FILES['images']['error'])) {
            // Handle array of files - take first one
            if (isset($_FILES['images']['error'][0]) && $_FILES['images']['error'][0] === UPLOAD_ERR_OK) {
                $file = [
                    'name' => $_FILES['images']['name'][0],
                    'type' => $_FILES['images']['type'][0],
                    'tmp_name' => $_FILES['images']['tmp_name'][0],
                    'error' => $_FILES['images']['error'][0],
                    'size' => $_FILES['images']['size'][0]
                ];
                $fileKey = 'images[0]';
            }
        } elseif (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['file'];
            $fileKey = 'file';
        }
        
        // Ensure fileKey is set
        if (!isset($fileKey)) {
            $fileKey = 'unknown';
        }
        
        // Validate file
        if (!$file || !isset($file['tmp_name'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'No image file uploaded or Firebase URL provided'], 400);
        }
        
        // For regular uploads (not Firebase), verify it's an uploaded file
        if ($fileKey !== 'firebase_url' && !is_uploaded_file($file['tmp_name'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid file upload'], 400);
        }
    }
    
    // Step 4: Get MIME type for later use (no validation, just for metadata)
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    
    // Get MIME type using multiple methods (for metadata only, not validation)
    $mimeType = null;
    if (function_exists('finfo_file')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $mimeType = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);
        }
    }
    
    if (!$mimeType && function_exists('mime_content_type')) {
        $mimeType = mime_content_type($file['tmp_name']);
    }
    
    if (!$mimeType) {
        $imageInfo = @getimagesize($file['tmp_name']);
        if ($imageInfo && isset($imageInfo['mime'])) {
            $mimeType = $imageInfo['mime'];
        }
    }
    
    // Get image info for dimensions check (Step 6)
    $imageInfo = @getimagesize($file['tmp_name']);
    if ($imageInfo === false) {
        // If we can't read image info, we'll let Google Vision API handle it
        // But we still need dimensions, so set defaults
        $imageInfo = [0, 0]; // width, height
    }
    
    // Step 5: File Size Validation (Maximum 5MB)
    // Ensure MAX_IMAGE_SIZE_BYTES is defined
    if (!defined('MAX_IMAGE_SIZE_BYTES')) {
        error_log("WARNING: MAX_IMAGE_SIZE_BYTES not defined, using default 5MB");
        define('MAX_IMAGE_SIZE_BYTES', 5 * 1024 * 1024); // 5MB default
    }
    $maxSizeBytes = MAX_IMAGE_SIZE_BYTES;
    if ($file['size'] > $maxSizeBytes) {
        $fileSizeMB = round($file['size'] / (1024 * 1024), 2);
        $maxSizeMB = round($maxSizeBytes / (1024 * 1024), 2);
        sendJsonResponse([
            'status' => 'error',
            'message' => getErrorMessage('file_too_large'),
            'error_code' => 'file_too_large'
        ], 400);
    }
    
    // Step 6: Image Dimensions Check - DISABLED
    // Dimension validation has been removed from the moderation system
    
    // Step 7: Blur Detection - DISABLED
    // Blur detection has been removed from the moderation system
    
    // Step 8: Save to Temp Folder
    $uniqueFilename = FileHelper::generateUniqueFilename($file['name']);
    $originalFilename = $file['name'];
    $fileSize = $file['size'];
    $mimeType = $mimeType ?: 'image/jpeg'; // Fallback
    
    // Ensure temp directory exists (use constant from moderation.php - NO hardcoded paths)
    if (!defined('UPLOAD_TEMP_PATH')) {
        error_log("ERROR: UPLOAD_TEMP_PATH not defined in moderation.php");
        error_log("Attempting to load moderation.php again...");
        // Try to load moderation.php again in case it failed earlier
        try {
            require_once __DIR__ . '/../../config/moderation.php';
        } catch (Throwable $e) {
            error_log("Failed to load moderation.php: " . $e->getMessage());
        }
        
        // Check again after reload attempt
        if (!defined('UPLOAD_TEMP_PATH')) {
            error_log("CRITICAL: UPLOAD_TEMP_PATH still not defined after reload attempt");
            sendJsonResponse([
                'status' => 'error', 
                'message' => 'Server configuration error: Upload paths not configured',
                'error_code' => 'config_missing',
                'details' => 'UPLOAD_TEMP_PATH constant is not defined. Please check moderation.php file.'
            ], 500);
        }
    }
    // Bug #3 Fix: Ensure trailing slash in temp directory path
    $tempDir = rtrim(UPLOAD_TEMP_PATH, '/') . '/';
    if (!is_dir($tempDir)) {
        if (!@mkdir($tempDir, 0755, true)) {
            error_log("Failed to create temp directory: {$tempDir}");
            sendJsonResponse([
                'status' => 'error', 
                'message' => 'Failed to create upload directory',
                'error_code' => 'directory_error',
                'path' => $tempDir
            ], 500);
        }
    }
    
    // Save to temp directory
    $tempPath = $tempDir . $uniqueFilename;
    
    // For Firebase URLs, file is already in temp location, just copy it
    // For regular uploads, use move_uploaded_file
    if (isset($fileKey) && $fileKey === 'firebase_url') {
        // Firebase file is already in temp location, just copy to our temp dir
        if (!@copy($file['tmp_name'], $tempPath)) {
            error_log("Failed to copy Firebase file to temp: {$tempPath}");
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to save uploaded file'], 500);
        }
    } else {
        // Regular upload - use move_uploaded_file
        if (!move_uploaded_file($file['tmp_name'], $tempPath)) {
            error_log("Failed to move uploaded file to temp: {$tempPath}");
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to save uploaded file'], 500);
        }
    }
    
    // Step 9: Google Vision API Call and Moderation
    $apiResponse = null;
    $moderationStatus = 'PENDING';  // Start as PENDING, will be updated based on checks
    $moderationReason = 'Moderation in progress';
    $confidenceScores = null;
    $apiResponseJson = null;
    $apisUsed = [];
    
    // Initialize variables
    $adult = null;
    $violence = null;
    $racy = null;
    $scores = [];
    $faces = [];
    $objects = [];
    $labels = [];
    
    // Call Google Vision API if available
    if ($composerAvailable && class_exists('GoogleVisionService')) {
        try {
            error_log("Calling Google Vision API for image moderation...");
            $visionService = new GoogleVisionService();
            $apiResponse = $visionService->analyzeImage($tempPath);
            
            if ($apiResponse && isset($apiResponse['success']) && $apiResponse['success']) {
                error_log("Google Vision API call successful");
                $apisUsed[] = 'google_vision';
                $apiResponseJson = $apiResponse['raw_response'] ?? null;
                
                // Extract data from API response
                $scores = $apiResponse['safesearch_scores'] ?? [];
                $adult = $scores['adult'] ?? null;
                $violence = $scores['violence'] ?? null;
                $racy = $scores['racy'] ?? null;
                $faces = $apiResponse['faces'] ?? [];
                $objects = $apiResponse['objects'] ?? [];
                $labels = $apiResponse['labels'] ?? [];
                
                // Use ModerationDecisionService to evaluate the response
                if (class_exists('ModerationDecisionService')) {
                    $decisionService = new ModerationDecisionService();
                    $decision = $decisionService->evaluate($apiResponse, $tempPath);
                    
                    $moderationStatus = $decision['status'];
                    $moderationReason = $decision['message'];
                    
                    // If rejected, return error immediately
                    if ($moderationStatus === 'REJECTED') {
                        FileHelper::deleteFile($tempPath);
                        sendJsonResponse([
                            'status' => 'error',
                            'message' => $decision['message'],
                            'error_code' => $decision['reason_code'] ?? 'moderation_failed',
                            'details' => $decision['details'] ?? []
                        ], 400);
                    }
                    
                    // If needs review, continue but mark as PENDING
                    if ($moderationStatus === 'NEEDS_REVIEW') {
                        $moderationStatus = 'PENDING';
                    }
                } else {
                    error_log("WARNING: ModerationDecisionService not found, using inline moderation logic");
                    // Fallback to inline logic if service not available
                    goto inline_moderation;
                }
            } else {
                // API call failed
                $errorMsg = $apiResponse['error'] ?? 'Unknown error';
                error_log("Google Vision API call failed: {$errorMsg}");
                $moderationStatus = 'PENDING';
                $moderationReason = 'Google Vision API failed - requires manual review';
            }
        } catch (Exception $e) {
            error_log("Exception during Google Vision API call: " . $e->getMessage());
            $moderationStatus = 'PENDING';
            $moderationReason = 'Google Vision API error - requires manual review';
        } catch (Error $e) {
            error_log("Fatal error during Google Vision API call: " . $e->getMessage());
            $moderationStatus = 'PENDING';
            $moderationReason = 'Google Vision API unavailable - requires manual review';
        }
    } else {
        // Google Vision API not available
        error_log("Google Vision API not available - marking image for manual review");
        $moderationStatus = 'PENDING';
        $moderationReason = 'Moderation service unavailable - requires manual review';
    }
    
    // Inline moderation logic (fallback if ModerationDecisionService not used)
    inline_moderation:
    if ($apiResponse && $apiResponse['success'] && !class_exists('ModerationDecisionService')) {
        // Track moderation checks
        $humanDetectionRan = false;
        $animalDetectionRan = false;
        $humanDetected = false;
        $animalDetected = false;
        $hasAnyDetectionData = false;
        $hasHumanDetectionData = !empty($faces) || !empty($objects);
        $hasAnimalDetectionData = !empty($objects) || !empty($labels);
        
        // Extract SafeSearch scores
        if ($adult === null || $violence === null || $racy === null) {
            error_log("WARNING: SafeSearch scores are missing (null) - marking for manual review");
            $moderationStatus = 'PENDING';
            $moderationReason = 'SafeSearch data incomplete - requires manual review';
        } else {
            $adult = (float)$adult;
            $violence = (float)$violence;
            $racy = (float)$racy;
        }
        
        $hasAnyDetectionData = !empty($faces) || !empty($objects) || !empty($labels) || !empty($scores);
        
        // Step 10: Check for HUMANS
        $humanDetectionRan = true; // Mark that human detection is running
    if (!empty($faces)) {
        foreach ($faces as $idx => $face) {
            $faceConfidence = $face['detection_confidence'] ?? 0.0;
            error_log("Face #{$idx}: confidence={$faceConfidence}, threshold=" . MODERATION_FACE_THRESHOLD);
        }
    }
    if (!empty($objects)) {
        foreach ($objects as $idx => $object) {
            $objectName = strtolower($object['name'] ?? '');
            $objectScore = $object['score'] ?? 0.0;
            error_log("Object #{$idx}: name={$objectName}, score={$objectScore}");
        }
    }
    
    // Check Face Detection (HIGHEST PRIORITY)
    $lowConfidenceHumanDetections = [];
    if (!empty($faces)) {
        foreach ($faces as $face) {
            $faceConfidence = $face['detection_confidence'] ?? 0.0;
            if ($faceConfidence >= MODERATION_FACE_THRESHOLD) {
                $humanDetected = true; // Mark that human was detected
                error_log("REJECTED: Human face detected with confidence {$faceConfidence} (threshold: " . MODERATION_FACE_THRESHOLD . ")");
                FileHelper::deleteFile($tempPath);
                sendJsonResponse([
                    'status' => 'error',
                    'message' => getErrorMessage('human_detected'),
                    'error_code' => 'human_detected',
                    'details' => [
                        'detection_method' => 'face_detection',
                        'confidence' => round($faceConfidence * 100, 1)
                    ]
                ], 400);
            } else if ($faceConfidence >= (MODERATION_FACE_THRESHOLD - 0.15) && $faceConfidence > 0.0) {
                // Flag borderline cases (within 15% of threshold) for review
                $lowConfidenceHumanDetections[] = [
                    'type' => 'face',
                    'confidence' => round($faceConfidence * 100, 1),
                    'threshold' => round(MODERATION_FACE_THRESHOLD * 100, 1)
                ];
                error_log("WARNING: Low-confidence human face detected: {$faceConfidence} (threshold: " . MODERATION_FACE_THRESHOLD . ") - Flagging for review");
            }
        }
    }
    
    // Check Object Localization for Person/People
    $detectedHumanObjects = [];
    $detectedHumanFaces = !empty($faces);
    
    if (!empty($objects)) {
        foreach ($objects as $object) {
            $objectName = strtolower($object['name'] ?? '');
            $objectScore = $object['score'] ?? 0.0;
            
            // Check if object is "Person" or "People" with confidence ≥ 0.5 (STRICT)
            if (($objectName === 'person' || $objectName === 'people' || $objectName === 'human') && 
                $objectScore >= MODERATION_HUMAN_OBJECT_THRESHOLD) {
                $detectedHumanObjects[] = [
                    'name' => ucfirst($object['name']),
                    'confidence' => round($objectScore * 100, 1)
                ];
            } else if (($objectName === 'person' || $objectName === 'people' || $objectName === 'human') && 
                       $objectScore >= (MODERATION_HUMAN_OBJECT_THRESHOLD - 0.15) && $objectScore > 0.0) {
                // Flag borderline cases for review
                $lowConfidenceHumanDetections[] = [
                    'type' => 'object',
                    'name' => ucfirst($object['name']),
                    'confidence' => round($objectScore * 100, 1),
                    'threshold' => round(MODERATION_HUMAN_OBJECT_THRESHOLD * 100, 1)
                ];
                error_log("WARNING: Low-confidence human object detected: {$objectName} with confidence {$objectScore} (threshold: " . MODERATION_HUMAN_OBJECT_THRESHOLD . ") - Flagging for review");
            }
        }
    }
    
    // Reject immediately if human object detected (STRICT)
    if (!empty($detectedHumanObjects)) {
        $humanDetected = true; // Mark that human was detected
        $topHuman = $detectedHumanObjects[0];
        error_log("REJECTED: Human object detected - name={$topHuman['name']}, confidence={$topHuman['confidence']}% (threshold: " . MODERATION_HUMAN_OBJECT_THRESHOLD . ")");
        FileHelper::deleteFile($tempPath);
        sendJsonResponse([
            'status' => 'error',
            'message' => getErrorMessage('human_detected'),
            'error_code' => 'human_detected',
            'details' => [
                'detection_method' => 'object_localization',
                'detected' => $topHuman['name'],
                'confidence' => $topHuman['confidence']
            ]
        ], 400);
    }
    
    // Check Labels for humans (as backup detection - STRICT MODE)
    // Reject if human label detected with confidence ≥ 0.4 (NO confirmation needed - reject on label alone)
    $humanLabels = defined('HUMAN_LABELS') ? HUMAN_LABELS : [];
    $detectedHumanLabels = [];
    
    // Log all labels for debugging
    error_log("Human label detection: Checking " . count($labels) . " labels against " . count($humanLabels) . " human label patterns");
    if (!empty($labels)) {
        error_log("All labels received: " . json_encode(array_map(function($l) { 
            return ['description' => $l['description'] ?? '', 'score' => $l['score'] ?? 0.0]; 
        }, $labels)));
    }
    
    foreach ($labels as $label) {
        $description = strtolower($label['description'] ?? '');
        $score = $label['score'] ?? 0.0;
        
        // Check if label matches any human label
        foreach ($humanLabels as $humanLabel) {
            $humanLabelLower = strtolower($humanLabel);
            if (stripos($description, $humanLabelLower) !== false || $description === $humanLabelLower) {
                error_log("Human label match found: '{$description}' matches '{$humanLabelLower}' with score {$score} (threshold: " . MODERATION_HUMAN_LABEL_THRESHOLD . ")");
                if ($score >= MODERATION_HUMAN_LABEL_THRESHOLD) {
                    $detectedHumanLabels[] = [
                        'name' => $label['description'],
                        'confidence' => round($score * 100, 1)
                    ];
                    error_log("Human label ABOVE threshold: '{$label['description']}' with confidence " . round($score * 100, 1) . "%");
                } else {
                    error_log("Human label BELOW threshold: '{$label['description']}' with confidence " . round($score * 100, 1) . "% (need " . (MODERATION_HUMAN_LABEL_THRESHOLD * 100) . "%)");
                }
            }
        }
    }
    
    // Reject if human label detected with confidence ≥ 0.3 (NO face/object confirmation needed)
    if (!empty($detectedHumanLabels)) {
        $humanDetected = true; // Mark that human was detected
        usort($detectedHumanLabels, function($a, $b) {
            return $b['confidence'] <=> $a['confidence'];
        });
        $topHumanLabel = $detectedHumanLabels[0];
        
        error_log("REJECTED: Human label detected - name={$topHumanLabel['name']}, confidence={$topHumanLabel['confidence']}%");
        FileHelper::deleteFile($tempPath);
        sendJsonResponse([
            'status' => 'error',
            'message' => getErrorMessage('human_detected'),
            'error_code' => 'human_detected',
            'details' => [
                'detection_method' => 'label_detection',
                'detected' => $topHumanLabel['name'],
                'confidence' => $topHumanLabel['confidence']
            ]
        ], 400);
    } else {
        error_log("No human labels detected above threshold " . MODERATION_HUMAN_LABEL_THRESHOLD . " (checked " . count($labels) . " labels)");
    }
    
    // Flag for manual review if low-confidence detections found
    if (!empty($lowConfidenceHumanDetections)) {
        error_log("WARNING: Low-confidence human detections found - marking for manual review");
        $moderationStatus = 'PENDING';
        $moderationReason = 'Low-confidence human detection - requires manual review';
    }
    
    // Step 11: Check for ANIMALS - STRICT MODE
    // Reject image STRICTLY IF:
    // - Object localization detects an animal with confidence ≥ 0.5 (STRICT threshold)
    // OR
    // - Animal label detected with confidence ≥ 0.6 (NO object confirmation needed - reject on label alone)
    // This ensures comprehensive animal detection - any animal appearance is rejected
    // IMPORTANT: Animal detection runs even with partial API data to catch edge cases
    
    // Validate API response data - check if we have meaningful detection data
    $hasDetectionData = false;
    if ($apiResponse && $apiResponse['success']) {
        $hasDetectionData = !empty($faces) || !empty($objects) || !empty($labels);
        if (!$hasDetectionData) {
            error_log("WARNING: API succeeded but returned no detection data (faces, objects, labels all empty)");
            error_log("API Response structure: " . json_encode(array_keys($apiResponse ?? [])));
            // Mark for review if API claims success but provides no data
            $moderationStatus = 'PENDING';
            $moderationReason = 'API returned no detection data - requires manual review';
        }
    }
    
    // Run animal detection if we have any detection data (even if API partially failed)
    // This ensures we catch animals even with partial API responses
    $hasAnimalDetectionData = !empty($faces) || !empty($objects) || !empty($labels);
    if ($hasAnimalDetectionData || ($apiResponse && $apiResponse['success'])) {
        $animalDetectionRan = true; // Mark that animal detection is running
    }
    
    $animalLabels = defined('ANIMAL_LABELS') ? ANIMAL_LABELS : [];
    $detectedAnimalObjects = [];
    $detectedAnimalLabels = [];
    $lowConfidenceAnimalDetections = [];
    
    // Log for debugging
    error_log("Animal detection check: labels_count=" . count($labels) . ", objects_count=" . count($objects) . ", has_detection_data=" . ($hasDetectionData ? 'yes' : 'no'));
    
    // First, check Object Localization for animals (runs even with partial API data)
    if (!empty($objects)) {
        foreach ($objects as $object) {
            $objectName = strtolower($object['name'] ?? '');
            $objectScore = $object['score'] ?? 0.0;
            
            // Check if object matches any animal label
            foreach ($animalLabels as $animalLabel) {
                $animalLabelLower = strtolower($animalLabel);
                if ($objectName === $animalLabelLower || stripos($objectName, $animalLabelLower) !== false) {
                    if ($objectScore >= MODERATION_ANIMAL_OBJECT_THRESHOLD) {
                        $detectedAnimalObjects[] = [
                            'name' => $object['name'],
                            'confidence' => round($objectScore * 100, 1)
                        ];
                    } else if ($objectScore >= (MODERATION_ANIMAL_OBJECT_THRESHOLD - 0.15) && $objectScore > 0.0) {
                        // Flag borderline cases for review
                        $lowConfidenceAnimalDetections[] = [
                            'type' => 'object',
                            'name' => $object['name'],
                            'confidence' => round($objectScore * 100, 1),
                            'threshold' => round(MODERATION_ANIMAL_OBJECT_THRESHOLD * 100, 1)
                        ];
                        error_log("WARNING: Low-confidence animal object detected: {$objectName} with confidence {$objectScore} (threshold: " . MODERATION_ANIMAL_OBJECT_THRESHOLD . ") - Flagging for review");
                    }
                }
            }
        }
    }
    
    // Check Labels for animals (reject on label alone - no object confirmation needed)
    foreach ($labels as $label) {
        $description = strtolower($label['description'] ?? '');
        $score = $label['score'] ?? 0.0;
        
        // Check if label matches any animal label
        foreach ($animalLabels as $animalLabel) {
            $animalLabelLower = strtolower($animalLabel);
            if (stripos($description, $animalLabelLower) !== false || $description === $animalLabelLower) {
                if ($score >= MODERATION_ANIMAL_LABEL_THRESHOLD) {
                    $detectedAnimalLabels[] = [
                        'name' => $label['description'],
                        'confidence' => round($score * 100, 1)
                    ];
                }
            }
        }
    }
    
    // Reject if object detected with confidence ≥ 0.5 (STRICT)
    if (!empty($detectedAnimalObjects)) {
        $animalDetected = true; // Mark that animal was detected
        usort($detectedAnimalObjects, function($a, $b) {
            return $b['confidence'] <=> $a['confidence'];
        });
        $topAnimal = $detectedAnimalObjects[0];
        
        error_log("REJECTED: Animal object detected - name={$topAnimal['name']}, confidence={$topAnimal['confidence']}%");
        FileHelper::deleteFile($tempPath);
        sendJsonResponse([
            'status' => 'error',
            'message' => getErrorMessage('animal_detected', [
                'animal_name' => $topAnimal['name']
            ]),
            'error_code' => 'animal_detected',
            'details' => [
                'detected' => $topAnimal['name'],
                'confidence' => $topAnimal['confidence'],
                'detection_method' => 'object_localization'
            ]
        ], 400);
    }
    
    // Reject if animal label detected with high confidence (NO object confirmation needed)
    if (!empty($detectedAnimalLabels)) {
        $animalDetected = true; // Mark that animal was detected
        usort($detectedAnimalLabels, function($a, $b) {
            return $b['confidence'] <=> $a['confidence'];
        });
        $topAnimalLabel = $detectedAnimalLabels[0];
        
        error_log("REJECTED: Animal label detected - name={$topAnimalLabel['name']}, confidence={$topAnimalLabel['confidence']}%");
        FileHelper::deleteFile($tempPath);
        sendJsonResponse([
            'status' => 'error',
            'message' => getErrorMessage('animal_detected', [
                'animal_name' => $topAnimalLabel['name']
            ]),
            'error_code' => 'animal_detected',
            'details' => [
                'detected' => $topAnimalLabel['name'],
                'confidence' => $topAnimalLabel['confidence'],
                'detection_method' => 'label_detection'
            ]
        ], 400);
    }
    
    // Flag for manual review if low-confidence animal detections found
    if (!empty($lowConfidenceAnimalDetections)) {
        error_log("WARNING: Low-confidence animal detections found - marking for manual review");
        if ($moderationStatus !== 'PENDING') {
            $moderationStatus = 'PENDING';
            $moderationReason = 'Low-confidence animal detection - requires manual review';
        }
    }
    
    // Step 12: Check SafeSearch (only if API succeeded)
    // SafeSearch checks must run AFTER image quality checks but BEFORE final approval
    if ($apiResponse && $apiResponse['success']) {
        // CRITICAL FIX: Validate SafeSearch scores are not null before checking thresholds
        // If SafeSearch data is missing, we already marked as PENDING above, but still need to check
        // Skip threshold checks if data is null (already handled above)
        if ($adult !== null && $violence !== null && $racy !== null) {
            // Log SafeSearch scores for debugging
            error_log("SafeSearch scores: adult={$adult}, violence={$violence}, racy={$racy}");
            error_log("SafeSearch thresholds: adult=" . MODERATION_ADULT_THRESHOLD . ", violence=" . MODERATION_VIOLENCE_THRESHOLD . ", racy=" . MODERATION_RACY_THRESHOLD);
            
            if ($adult >= MODERATION_ADULT_THRESHOLD) {
            error_log("REJECTED: Adult content detected - score={$adult} (threshold: " . MODERATION_ADULT_THRESHOLD . ")");
            FileHelper::deleteFile($tempPath);
            sendJsonResponse([
                'status' => 'error',
                'message' => getErrorMessage('adult_content'),
                'error_code' => 'adult_content'
            ], 400);
        }
        
        if ($violence >= MODERATION_VIOLENCE_THRESHOLD) {
            error_log("REJECTED: Violence content detected - score={$violence} (threshold: " . MODERATION_VIOLENCE_THRESHOLD . ")");
            FileHelper::deleteFile($tempPath);
            sendJsonResponse([
                'status' => 'error',
                'message' => getErrorMessage('violence_content'),
                'error_code' => 'violence_content'
            ], 400);
        }
        
            if ($racy >= MODERATION_RACY_THRESHOLD) {
                error_log("REJECTED: Racy content detected - score={$racy} (threshold: " . MODERATION_RACY_THRESHOLD . ")");
                FileHelper::deleteFile($tempPath);
                sendJsonResponse([
                    'status' => 'error',
                    'message' => 'This image contains suggestive content and cannot be uploaded.',
                    'error_code' => 'racy_content'
                ], 400);
            }
            
            error_log("SafeSearch checks passed - all scores below thresholds");
        } else {
            // SafeSearch data is null - already marked as PENDING above, but log for debugging
            error_log("WARNING: Skipping SafeSearch threshold checks - scores are null (already marked as PENDING)");
        }
        
        // Final safety check: Verify no human/animal detections were missed
        // Double-check that we didn't miss any detections due to edge cases
        if (!empty($faces) || !empty($objects)) {
            $suspiciousDetections = [];
            
            // Check for any faces with any confidence (even below threshold)
            if (!empty($faces)) {
                foreach ($faces as $face) {
                    $faceConf = $face['detection_confidence'] ?? 0.0;
                    if ($faceConf > 0.0 && $faceConf < MODERATION_FACE_THRESHOLD) {
                        $suspiciousDetections[] = "Face (confidence: " . round($faceConf * 100, 1) . "%)";
                    }
                }
            }
            
            // Check for any human objects with any confidence
            if (!empty($objects)) {
                foreach ($objects as $obj) {
                    $objName = strtolower($obj['name'] ?? '');
                    $objScore = $obj['score'] ?? 0.0;
                    if (($objName === 'person' || $objName === 'people' || $objName === 'human') && 
                        $objScore > 0.0 && $objScore < MODERATION_HUMAN_OBJECT_THRESHOLD) {
                        $suspiciousDetections[] = "Human object: {$objName} (confidence: " . round($objScore * 100, 1) . "%)";
                    }
                }
            }
            
            if (!empty($suspiciousDetections)) {
                error_log("SAFETY CHECK: Found suspicious detections below threshold: " . implode(", ", $suspiciousDetections));
                // If we have multiple suspicious detections, mark for review
                if (count($suspiciousDetections) >= 2) {
                    error_log("WARNING: Multiple suspicious detections found - marking for manual review");
                    $moderationStatus = 'PENDING';
                    $moderationReason = 'Multiple suspicious detections found - requires manual review';
                }
            }
        }
        
        // CRITICAL FIX: Only set status to 'SAFE' if ALL checks explicitly passed:
        // 1. No humans detected (if detection ran, it found nothing - if it didn't run, API failed so mark PENDING)
        // 2. No animals detected (if detection ran, it found nothing - if it didn't run, API failed so mark PENDING)
        // 3. SafeSearch passed (all scores below thresholds)
        // 4. Status is not already PENDING for other reasons
        
        // If status is already PENDING, don't change it
        if ($moderationStatus === 'PENDING') {
            error_log("Image checks completed but status remains PENDING (incomplete data or suspicious detections)");
        } else {
            // Verify all checks passed - be explicit about each requirement
            $humanCheckPassed = !$humanDetected; // No humans detected (if detected, sendJsonResponse would have exited)
            $animalCheckPassed = !$animalDetected; // No animals detected (if detected, sendJsonResponse would have exited)
            $safeSearchPassed = ($adult === null || $adult < MODERATION_ADULT_THRESHOLD) && 
                               ($violence === null || $violence < MODERATION_VIOLENCE_THRESHOLD) && 
                               ($racy === null || $racy < MODERATION_RACY_THRESHOLD);
            
            // CRITICAL: Verify detection actually ran - if API failed, detection didn't run, so don't approve
            // Detection ran if API succeeded AND (human detection ran OR no human data) AND (animal detection ran OR no animal data)
            $apiSucceeded = ($apiResponse && $apiResponse['success']);
            
            // If API failed, detection definitely didn't run
            if (!$apiSucceeded) {
                $detectionRan = false;
            } else {
                // API succeeded - check if detection ran (either detection executed OR we verified no data available)
                $humanDetectionCompleted = $humanDetectionRan || (!$hasHumanDetectionData);
                $animalDetectionCompleted = $animalDetectionRan || (!$hasAnimalDetectionData);
                $detectionRan = $humanDetectionCompleted && $animalDetectionCompleted;
            }
            
            error_log("Final moderation check: api_succeeded=" . ($apiSucceeded ? 'yes' : 'no') .
                     ", human_detected=" . ($humanDetected ? 'yes' : 'no') . 
                     ", animal_detected=" . ($animalDetected ? 'yes' : 'no') . 
                     ", human_check_passed=" . ($humanCheckPassed ? 'yes' : 'no') . 
                     ", animal_check_passed=" . ($animalCheckPassed ? 'yes' : 'no') . 
                     ", safesearch_passed=" . ($safeSearchPassed ? 'yes' : 'no') . 
                     ", detection_ran=" . ($detectionRan ? 'yes' : 'no') .
                     ", human_detection_ran=" . ($humanDetectionRan ? 'yes' : 'no') .
                     ", animal_detection_ran=" . ($animalDetectionRan ? 'yes' : 'no'));
            
            // Only approve as SAFE if: API succeeded, no humans, no animals, SafeSearch passed, AND detection ran
            // If API failed, status should remain PENDING (already set above)
            if ($apiSucceeded && $humanCheckPassed && $animalCheckPassed && $safeSearchPassed && $detectionRan) {
                error_log("Image passed all moderation checks - APPROVED");
                error_log("Final moderation decision: SAFE (no humans, no animals, SafeSearch passed)");
                $moderationStatus = 'SAFE';
                $moderationReason = 'Image approved successfully - passed all moderation checks (no human/animal appearance detected)';
            } else {
                error_log("WARNING: Cannot approve as SAFE - some checks failed or detection did not run");
                if ($moderationStatus !== 'PENDING') {
                    $moderationStatus = 'PENDING';
                    $moderationReason = 'Moderation checks incomplete or failed - requires manual review';
                }
            }
        }
    } else {
        // API failed - image will be marked as PENDING (already set above at line 483 or 498)
        error_log("Skipping SafeSearch checks - Vision API not available");
        error_log("API failed - status already set to PENDING, will require manual review");
        
        // Ensure status is PENDING (should already be set, but double-check)
        if ($moderationStatus !== 'PENDING') {
            error_log("WARNING: API failed but status was not PENDING - forcing PENDING");
            $moderationStatus = 'PENDING';
            $moderationReason = 'Google Vision API failed - requires manual review';
        }
        
        // Additional safety: If API failed but we somehow have detection data, mark for review
        if (!empty($faces) || !empty($objects) || !empty($labels)) {
            error_log("WARNING: API failed but detection data exists - marking for manual review");
            $moderationStatus = 'PENDING';
            $moderationReason = 'API failed but detection data present - requires manual review';
        }
    }
    } // End of inline moderation logic (fallback)
    
    // Step 13: Image Processing - Handle based on moderation status
    // Check if this is a Firebase URL (skip server file saving if so)
    // Ensure $firebaseUrl is set (it should be set earlier, but add safety check)
    if (!isset($firebaseUrl)) {
        $firebaseUrl = null;
    }
    $isFirebaseUrl = ($firebaseUrl && strpos($firebaseUrl, 'firebasestorage.googleapis.com') !== false);
    
    // If validate_only mode, return success without saving to database
    if ($validateOnly) {
        sendJsonResponse([
            'status' => 'success',
            'message' => $moderationStatus === 'SAFE' ? 'Image approved' : 'Image requires review',
            'data' => [
                'validated' => true,
                'filename' => $uniqueFilename, // Return only filename, not full path
                'moderation_status' => $moderationStatus,
                'moderation_reason' => $moderationReason,
                'validate_only' => true
            ]
        ], 200);
    }
    
    // Fallback when Firebase re-upload fails: use server URL for watermarked image (set in Firebase branch)
    $firebaseFallbackToServer = false;
    $fallbackRelativePath = null;
    $fallbackServerUrl = null;

    // Normal mode: Add Watermark and Save (only for server uploads, skip for Firebase URLs)
    if (!$isFirebaseUrl) {
        // Move to properties folder first
        // Save to /backend/uploads/properties/{property_id}/
        // Use constant from moderation.php - NO hardcoded paths
        if (!defined('UPLOAD_PROPERTIES_PATH')) {
            error_log("ERROR: UPLOAD_PROPERTIES_PATH not defined in moderation.php");
            error_log("Attempting to load moderation.php again...");
            // Try to load moderation.php again in case it failed earlier
            try {
                require_once __DIR__ . '/../../config/moderation.php';
            } catch (Throwable $e) {
                error_log("Failed to load moderation.php: " . $e->getMessage());
            }
            
            // Check again after reload attempt
            if (!defined('UPLOAD_PROPERTIES_PATH')) {
                error_log("CRITICAL: UPLOAD_PROPERTIES_PATH still not defined after reload attempt");
                sendJsonResponse([
                    'status' => 'error', 
                    'message' => 'Server configuration error: Upload paths not configured',
                    'error_code' => 'config_missing',
                    'details' => 'UPLOAD_PROPERTIES_PATH constant is not defined. Please check moderation.php file.'
                ], 500);
            }
        }
    // Bug #3 Fix: Ensure trailing slash in property directory path
    $basePropertiesDir = rtrim(UPLOAD_PROPERTIES_PATH, '/') . '/';
    $propertyFolder = $basePropertiesDir . $propertyId . '/';
    
    // Log directory creation attempt with detailed info
    error_log("=== IMAGE UPLOAD DEBUG ===");
    error_log("Property ID: {$propertyId}");
    error_log("Base properties directory: {$basePropertiesDir}");
    error_log("Property folder: {$propertyFolder}");
    error_log("Base directory exists: " . (is_dir($basePropertiesDir) ? 'YES' : 'NO'));
    error_log("Base directory writable: " . (is_writable($basePropertiesDir) ? 'YES' : 'NO'));
    
    // Ensure base properties directory exists first
    if (!is_dir($basePropertiesDir)) {
        error_log("Base properties directory does not exist, creating: " . $basePropertiesDir);
        $parentDir = dirname($basePropertiesDir);
        error_log("Parent directory: {$parentDir}");
        error_log("Parent exists: " . (is_dir($parentDir) ? 'YES' : 'NO'));
        error_log("Parent writable: " . (is_writable($parentDir) ? 'YES' : 'NO'));
        
        if (!@mkdir($basePropertiesDir, 0755, true)) {
            $error = error_get_last();
            error_log("FAILED to create base properties directory: " . $basePropertiesDir);
            error_log("Error: " . ($error ? $error['message'] : 'Unknown error'));
            error_log("Parent directory exists: " . (is_dir($parentDir) ? 'YES' : 'NO'));
            error_log("Parent directory writable: " . (is_writable($parentDir) ? 'YES' : 'NO'));
        } else {
            error_log("Base properties directory created successfully");
        }
    }
    
    // Create property-specific folder
    if (!is_dir($propertyFolder)) {
        error_log("Property folder does not exist, creating: {$propertyFolder}");
        if (!@mkdir($propertyFolder, 0755, true)) {
            $error = error_get_last();
            error_log("FAILED to create property folder: {$propertyFolder}");
            error_log("Error: " . ($error ? $error['message'] : 'Unknown error'));
            error_log("Base directory exists: " . (is_dir($basePropertiesDir) ? 'YES' : 'NO'));
            error_log("Base directory writable: " . (is_writable($basePropertiesDir) ? 'YES' : 'NO'));
            FileHelper::deleteFile($tempPath);
            sendJsonResponse([
                'status' => 'error', 
                'message' => 'Failed to create property folder',
                'debug' => [
                    'property_folder' => $propertyFolder,
                    'base_dir_exists' => is_dir($basePropertiesDir),
                    'base_dir_writable' => is_writable($basePropertiesDir),
                    'error' => $error ? $error['message'] : 'Unknown'
                ]
            ], 500);
        } else {
            error_log("Property folder created successfully: {$propertyFolder}");
        }
    } else {
        error_log("Property folder already exists: {$propertyFolder}");
    }
    
    error_log("Property folder verified: {$propertyFolder}");
    error_log("Property folder writable: " . (is_writable($propertyFolder) ? 'YES' : 'NO'));
    
    $finalPath = $propertyFolder . $uniqueFilename;
    
    // Log the paths for debugging
    error_log("=== FILE SAVE DEBUG ===");
    error_log("Property folder: {$propertyFolder}");
    error_log("Final path: {$finalPath}");
    error_log("Temp path: {$tempPath}");
    error_log("Temp file exists: " . (file_exists($tempPath) ? 'YES' : 'NO'));
    error_log("Temp file size: " . (file_exists($tempPath) ? filesize($tempPath) : 0) . " bytes");
    error_log("Destination folder exists: " . (is_dir($propertyFolder) ? 'YES' : 'NO'));
    error_log("Destination folder writable: " . (is_writable($propertyFolder) ? 'YES' : 'NO'));
    
    // Move file from temp to final location
    // NOTE: move_uploaded_file() only works for $_FILES['tmp_name']
    // After first move, use rename() instead
    if (!@rename($tempPath, $finalPath)) {
        // Fallback: try copy + delete
        if (@copy($tempPath, $finalPath)) {
            @unlink($tempPath);
            error_log("File moved using copy+delete fallback method");
        } else {
            $error = error_get_last();
            error_log("FAILED to move file to property folder");
            error_log("Error: " . ($error ? $error['message'] : 'Unknown error'));
            error_log("Source exists: " . (file_exists($tempPath) ? 'YES' : 'NO'));
            error_log("Source readable: " . (is_readable($tempPath) ? 'YES' : 'NO'));
            error_log("Destination folder exists: " . (is_dir($propertyFolder) ? 'YES' : 'NO'));
            error_log("Destination folder writable: " . (is_writable($propertyFolder) ? 'YES' : 'NO'));
            FileHelper::deleteFile($tempPath);
            sendJsonResponse([
                'status' => 'error', 
                'message' => 'Failed to save image file',
                'debug' => [
                    'source' => $tempPath,
                    'destination' => $finalPath,
                    'source_exists' => file_exists($tempPath),
                    'dest_folder_exists' => is_dir($propertyFolder),
                    'dest_folder_writable' => is_writable($propertyFolder),
                    'error' => $error ? $error['message'] : 'Unknown'
                ]
            ], 500);
        }
    } else {
        error_log("File moved successfully using rename()");
    }
    
    // Verify file was saved
    if (!file_exists($finalPath)) {
        error_log("CRITICAL: File move reported success but file not found at: {$finalPath}");
        FileHelper::deleteFile($tempPath);
        sendJsonResponse(['status' => 'error', 'message' => 'Image file was not saved correctly'], 500);
    }
    
    error_log("Image successfully saved to: {$finalPath}");
    error_log("File size: " . filesize($finalPath) . " bytes");
    error_log("File permissions: " . substr(sprintf('%o', fileperms($finalPath)), -4));
    
        // Add 360coordinates watermark (only for server uploads)
        try {
            if (class_exists('WatermarkService')) {
                if (!WatermarkService::addWatermark($finalPath)) {
                    error_log("Failed to add watermark to image: {$finalPath}");
                } else {
                    error_log("Watermark added successfully to: {$finalPath}");
                }
            } else {
                error_log("WatermarkService not loaded - skipping watermark");
            }
        } catch (Exception $e) {
            error_log("Watermark error: " . $e->getMessage());
        }
        
        // Step 14: Move to Properties Folder (already done above)
    } else {
        // Firebase URL: apply watermark to temp file, then re-upload to Firebase OR fallback to server
        error_log("Firebase URL provided - applying watermark and re-uploading to Firebase");
        if (isset($tempPath) && file_exists($tempPath) && isset($firebaseUrl)) {
            $watermarkApplied = false;
            if (class_exists('WatermarkService')) {
                try {
                    $watermarkApplied = WatermarkService::addWatermark($tempPath);
                    if ($watermarkApplied) {
                        error_log("Firebase: Watermark applied to temp file");
                    } else {
                        error_log("Firebase: WatermarkService::addWatermark returned false");
                    }
                } catch (Throwable $e) {
                    error_log("Firebase: Watermark error: " . $e->getMessage());
                }
            }
            $reuploadOk = false;
            if (class_exists('FirebaseStorageService')) {
                try {
                    $firebaseCredentialsPath = __DIR__ . '/../../firebase-key.json';
                    $reuploadOk = FirebaseStorageService::uploadFileToFirebaseUrl($tempPath, $firebaseUrl, $firebaseCredentialsPath);
                    if ($reuploadOk) {
                        error_log("Firebase: Watermarked image re-uploaded to Firebase successfully");
                        if (isset($firebaseTempFile) && $firebaseTempFile && file_exists($firebaseTempFile)) {
                            if (!@unlink($firebaseTempFile)) {
                                error_log("Firebase: failed to unlink downloaded temp: {$firebaseTempFile}");
                            }
                        }
                        if (isset($tempPath) && $tempPath && file_exists($tempPath)) {
                            if (!@unlink($tempPath)) {
                                error_log("Firebase: failed to unlink watermarked temp: {$tempPath}");
                            }
                        }
                    } else {
                        error_log("Firebase: Re-upload to Firebase failed (will use server fallback if watermark was applied)");
                    }
                } catch (Throwable $e) {
                    error_log("Firebase upload failed: " . $e->getMessage());
                }
            } else {
                error_log("Firebase: FirebaseStorageService not loaded - cannot re-upload");
            }
            // Fallback: if we applied watermark but re-upload failed (or service missing), save to server and use server URL
            if ($watermarkApplied && !$reuploadOk && defined('UPLOAD_PROPERTIES_PATH') && defined('UPLOAD_BASE_URL')) {
                $baseDir = rtrim(UPLOAD_PROPERTIES_PATH, '/') . '/';
                $propFolder = $baseDir . $propertyId . '/';
                if (!is_dir($propFolder)) {
                    @mkdir($propFolder, 0755, true);
                }
                if (is_dir($propFolder) && is_writable($propFolder)) {
                    $serverPath = $propFolder . $uniqueFilename;
                    if (@copy($tempPath, $serverPath)) {
                        $firebaseFallbackToServer = true;
                        $fallbackRelativePath = 'properties/' . $propertyId . '/' . $uniqueFilename;
                        $fallbackServerUrl = UPLOAD_BASE_URL . '/' . $fallbackRelativePath;
                        error_log("Firebase fallback: Watermarked image saved to server: {$fallbackServerUrl}");
                    } else {
                        error_log("Firebase fallback: Failed to copy watermarked file to server path: {$serverPath}");
                    }
                } else {
                    error_log("Firebase fallback: Property folder not writable: {$propFolder}");
                }
            }
        }
        // Always clean up Firebase temp files (whether re-upload succeeded or failed)
        if (isset($firebaseTempFile) && $firebaseTempFile !== '' && file_exists($firebaseTempFile)) {
            if (!@unlink($firebaseTempFile)) {
                error_log("Firebase cleanup: failed to unlink downloaded temp file: {$firebaseTempFile}");
            }
        }
        if (isset($tempPath) && $tempPath !== '' && file_exists($tempPath)) {
            if (!@unlink($tempPath)) {
                error_log("Firebase cleanup: failed to unlink watermarked temp file: {$tempPath}");
            }
        }
        // Variables ($uniqueFilename, $originalFilename, $fileSize, $mimeType) 
        // are already set during file processing above, no need to set them again
    }
    
    // Step 15: Save to Database
    
    // Calculate relative path from backend/uploads folder (only for server uploads)
    $relativePath = null;
    $imageUrl = null;
    
    if ($isFirebaseUrl && isset($firebaseUrl)) {
        // Use Firebase URL (with cache-busting) when re-upload succeeded; otherwise server fallback if re-upload failed
        if (!empty($firebaseFallbackToServer) && $fallbackServerUrl !== null) {
            $imageUrl = $fallbackServerUrl;
            $relativePath = $fallbackRelativePath;
            error_log("Using server fallback URL for image (watermarked): {$imageUrl}");
        } else {
            $imageUrl = $firebaseUrl . '?v=' . time();
            $relativePath = null; // No relative path for Firebase URLs
        }
    } else {
        // Build server URL
        $relativePath = 'properties/' . $propertyId . '/' . $uniqueFilename;
        
        // Build full URL - use UPLOAD_BASE_URL (which points to /backend/uploads)
        // Files are saved to: /backend/uploads/properties/{id}/{filename}
        // URLs: https://testapi.360coordinates.com/backend/uploads/properties/{id}/{filename}
        if (!defined('UPLOAD_BASE_URL')) {
            error_log("ERROR: UPLOAD_BASE_URL not defined in config.php");
            error_log("Attempting to load config.php again...");
            // Try to load config.php again in case it failed earlier
            try {
                require_once __DIR__ . '/../../config/config.php';
            } catch (Throwable $e) {
                error_log("Failed to load config.php: " . $e->getMessage());
            }
            
            // Check again after reload attempt
            if (!defined('UPLOAD_BASE_URL')) {
                error_log("CRITICAL: UPLOAD_BASE_URL still not defined after reload attempt");
                // Fallback: always use testapi.360coordinates.com for image upload URLs
                define('UPLOAD_BASE_URL', 'https://testapi.360coordinates.com/backend/uploads');
                error_log("Using fallback UPLOAD_BASE_URL: " . UPLOAD_BASE_URL);
            }
        }
        $imageUrl = UPLOAD_BASE_URL . '/' . $relativePath;
    }
    
    error_log("=== URL GENERATION ===");
    error_log("UPLOAD_BASE_URL: " . (defined('UPLOAD_BASE_URL') ? UPLOAD_BASE_URL : 'NOT DEFINED'));
    error_log("Relative path: {$relativePath}");
    error_log("Final image URL: {$imageUrl}");
    
    // Log the URL being returned
    error_log("Image URL being returned: {$imageUrl}");
    error_log("Relative path: {$relativePath}");
    error_log("BASE_URL: " . (defined('BASE_URL') ? BASE_URL : 'NOT DEFINED'));
    
    // Prepare data for database
    $confidenceScores = null;
    if (!empty($scores)) {
        $confidenceScores = json_encode($scores);
    }
    
    try {
        $db = getDB();
        $stmt = $db->prepare("
            INSERT INTO property_images (
                property_id, image_url, file_name, file_path, original_filename,
                file_size, mime_type, moderation_status, moderation_reason,
                apis_used, confidence_scores, api_response, checked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ");
        
            $stmt->execute([
                $propertyId,
                $imageUrl, // Firebase URL or server URL
                $uniqueFilename,
                $relativePath, // null for Firebase URLs, path for server uploads
                $originalFilename,
                $fileSize,
                $mimeType,
                $moderationStatus,
                $moderationReason,
                !empty($apisUsed) ? json_encode($apisUsed) : null,
                $confidenceScores,
                $apiResponseJson
            ]);
        
        $imageId = $db->lastInsertId();
        
        // Update cover_image in properties table if it's NULL or empty
        // This ensures the first uploaded image becomes the cover image
        try {
            $updateCoverStmt = $db->prepare("
                UPDATE properties 
                SET cover_image = ? 
                WHERE id = ? 
                AND (cover_image IS NULL OR cover_image = '')
            ");
            $updateCoverStmt->execute([$imageUrl, $propertyId]);
            
            if ($updateCoverStmt->rowCount() > 0) {
                error_log("Updated cover_image for property {$propertyId}: {$imageUrl}");
            }
        } catch (PDOException $e) {
            // Log error but don't fail the image upload
            error_log("Failed to update cover_image for property {$propertyId}: " . $e->getMessage());
        }
        
        // Step 16: Return Success
        // Verify the URL is correct before returning
        error_log("Final image URL: {$imageUrl}");
        error_log("Image ID: {$imageId}");
        error_log("Relative path: {$relativePath}");
        
        // Clean up Firebase temp files if they still exist (final pass)
        if ($isFirebaseUrl) {
            if (isset($firebaseTempFile) && $firebaseTempFile && file_exists($firebaseTempFile)) {
                if (!@unlink($firebaseTempFile)) {
                    error_log("Final cleanup: failed to unlink firebase temp: {$firebaseTempFile}");
                }
            }
            if (isset($tempPath) && $tempPath && file_exists($tempPath)) {
                if (!@unlink($tempPath)) {
                    error_log("Final cleanup: failed to unlink temp path: {$tempPath}");
                }
            }
        }
        
        // Use helper function to send clean JSON response
        sendJsonResponse([
            'status' => 'success',
            'message' => 'Image approved',
            'data' => [
                'image_id' => $imageId,
                'image_url' => $imageUrl, // Firebase URL or server URL
                'relative_path' => $relativePath, // null for Firebase URLs, path for server uploads
                'filename' => $uniqueFilename,
                'moderation_status' => $moderationStatus,
                'moderation_reason' => $moderationReason,
                'storage_type' => $isFirebaseUrl ? 'firebase' : 'server'
            ]
        ], 200);
        
    } catch (PDOException $e) {
        error_log("Failed to save image record: " . $e->getMessage());
        FileHelper::deleteFile($finalPath);
        sendJsonResponse(['status' => 'error', 'message' => 'Failed to save image record'], 500);
    }
    // End of database try-catch block
    
} catch (Throwable $e) {
    // Catch all exceptions and errors (Error extends Throwable)
    $isFatalError = ($e instanceof Error);
    $errorType = get_class($e);
    
    $errorMessage = $e->getMessage();
    $errorFile = $e->getFile();
    $errorLine = $e->getLine();
    $errorTrace = $e->getTraceAsString();
    
    error_log("Image moderation " . ($isFatalError ? "fatal error" : "error") . ": " . $errorMessage);
    error_log("Error type: " . $errorType);
    error_log("File: " . $errorFile . " Line: " . $errorLine);
    error_log("Stack trace: " . $errorTrace);
    
    // Send detailed error in development, generic in production
    $errorDetails = defined('ENVIRONMENT') && ENVIRONMENT === 'development' 
        ? [
            'error_type' => $errorType,
            'error_message' => $errorMessage,
            'error_file' => $errorFile,
            'error_line' => $errorLine,
            'stack_trace' => $errorTrace
        ]
        : [
            'error_type' => $errorType,
            'error_message' => 'An error occurred during image upload. Please check server logs for details.'
        ];
    
    // Clean up any temp files if they exist
    if (isset($tempPath) && file_exists($tempPath)) {
        @unlink($tempPath);
    }
    if (isset($finalPath) && file_exists($finalPath)) {
        @unlink($finalPath);
    }
    if (isset($firebaseTempFile) && $firebaseTempFile && file_exists($firebaseTempFile)) {
        @unlink($firebaseTempFile);
    }
    
    sendJsonResponse([
        'status' => 'error', 
        'message' => $isFatalError ? 'A fatal error occurred while processing the image' : 'An error occurred while processing the image',
        'error_code' => $isFatalError ? 'fatal_error' : 'processing_error',
        'details' => defined('ENVIRONMENT') && ENVIRONMENT === 'development' ? $e->getMessage() : 'Please try again or contact support'
    ], 500);
}
