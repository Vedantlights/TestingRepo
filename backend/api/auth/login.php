<?php
/**
 * User Login API
 * POST /api/auth/login.php
 */

// Enable error logging for debugging
error_reporting(E_ALL);
ini_set('display_errors', 0); // Don't display errors in production
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/login-error.log');

// Catch fatal errors
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        header('Content-Type: application/json');
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Server error: ' . $error['message'],
            'file' => $error['file'],
            'line' => $error['line']
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
});

error_log("=== LOGIN REQUEST START ===");
error_log("Request Method: " . ($_SERVER['REQUEST_METHOD'] ?? 'N/A'));
error_log("Request Time: " . date('Y-m-d H:i:s'));

try {
    require_once __DIR__ . '/../../config/config.php';
    error_log("Step 1: config.php loaded successfully");
} catch (Error $e) {
    error_log("ERROR loading config.php: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Server configuration error', 'error' => $e->getMessage()]);
    exit;
} catch (Exception $e) {
    error_log("EXCEPTION loading config.php: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Server configuration error', 'error' => $e->getMessage()]);
    exit;
}

try {
    require_once __DIR__ . '/../../config/database.php';
    error_log("Step 2: database.php loaded successfully");
    
    require_once __DIR__ . '/../../utils/response.php';
    error_log("Step 3: response.php loaded successfully");
    
    require_once __DIR__ . '/../../utils/validation.php';
    error_log("Step 4: validation.php loaded successfully");
    
    require_once __DIR__ . '/../../utils/auth.php';
    error_log("Step 5: auth.php loaded successfully");
} catch (Error $e) {
    error_log("ERROR: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    error_log("Stack trace: " . $e->getTraceAsString());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
    exit;
} catch (Exception $e) {
    error_log("EXCEPTION: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    error_log("Stack trace: " . $e->getTraceAsString());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
    exit;
}

handlePreflight();
error_log("Step 6: Preflight handled");

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    error_log("ERROR: Invalid request method: " . $_SERVER['REQUEST_METHOD']);
    sendError('Method not allowed', null, 405);
}

error_log("Step 7: Starting login processing");

try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Accept either 'email' (legacy) or 'emailOrPhone' for unified input
    $emailOrPhone = sanitizeInput($input['emailOrPhone'] ?? $input['email'] ?? '');
    $password = $input['password'] ?? '';
    $userType = sanitizeInput($input['userType'] ?? 'buyer');
    
    // Validation
    $errors = [];
    if (empty($emailOrPhone)) {
        $errors['emailOrPhone'] = 'Email or mobile number is required';
    } else {
        $isEmail = validateEmail($emailOrPhone);
        $validatedPhone = validatePhone($emailOrPhone);
        if (!$isEmail && !$validatedPhone) {
            $errors['emailOrPhone'] = 'Enter a valid email or mobile number';
        }
    }
    
    if (empty($password)) {
        $errors['password'] = 'Password is required';
    }
    
    if (!in_array($userType, ['buyer', 'seller', 'agent'])) {
        $errors['userType'] = 'Invalid user type';
    }
    
    if (!empty($errors)) {
        sendValidationError($errors);
    }
    
    // Get database connection
    $db = getDB();
    
    // Determine lookup: by email or by phone
    $isEmail = validateEmail($emailOrPhone);
    $user = null;
    
    if ($isEmail) {
        $identifier = strtolower(trim($emailOrPhone));
        $stmt = $db->prepare("
            SELECT u.id, u.full_name, u.email, u.phone, u.password, u.user_type, u.email_verified, u.phone_verified,
                   up.profile_image
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE LOWER(TRIM(u.email)) = ?
        ");
        $stmt->execute([$identifier]);
        $user = $stmt->fetch();
    } else {
        $validatedPhone = validatePhone($emailOrPhone);
        $identifier = $validatedPhone;
        $stmt = $db->prepare("
            SELECT u.id, u.full_name, u.email, u.phone, u.password, u.user_type, u.email_verified, u.phone_verified,
                   up.profile_image
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE u.phone = ?
        ");
        $stmt->execute([$identifier]);
        $user = $stmt->fetch();
    }
    
    if (!$user) {
        error_log("Login failed: User not found for identifier: " . ($identifier ?? $emailOrPhone));
        sendError('Invalid email or password', null, 401);
    }

    // Block Google/OTP-only users from password login
    if (empty($user['password'])) {
        error_log("Login failed: User has no password (Google/OTP account): " . ($user['email'] ?? $user['phone'] ?? 'unknown'));
        sendError('This account uses Google or OTP login. Please use the appropriate login option.', null, 401);
    }
    
    // Verify password
    if (!password_verify($password, $user['password'])) {
        error_log("Login failed: Password mismatch for identifier: " . ($user['email'] ?? $user['phone'] ?? 'unknown'));
        sendError('Invalid email or password', null, 401);
    }
    
    error_log("Login successful for: " . ($user['email'] ?? $user['phone']) . ", user_type: {$user['user_type']}");
    
    // Check if user can login with selected user type
    $registeredType = $user['user_type'];
    $roleAccessMap = [
        'buyer' => ['buyer', 'seller'],
        'seller' => ['buyer', 'seller'],
        'agent' => ['agent']
    ];
    
    $allowedRoles = $roleAccessMap[$registeredType] ?? [];
    if (!in_array($userType, $allowedRoles)) {
        $typeLabels = [
            'buyer' => 'Buyer/Tenant',
            'seller' => 'Seller/Owner',
            'agent' => 'Agent/Builder'
        ];
        
        if ($registeredType === 'agent' && $userType !== 'agent') {
            sendError('You are registered as an Agent/Builder. You can only access the Agent/Builder dashboard.', null, 403);
        } else {
            sendError("You are registered as {$typeLabels[$registeredType]}. You cannot access this dashboard.", null, 403);
        }
    }
    
    // Generate token
    $token = generateToken($user['id'], $userType, $user['email']);
    
    // Store session (optional)
    $stmt = $db->prepare("INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))");
    $stmt->execute([$user['id'], $token, time() + JWT_EXPIRATION]);
    
    // Prepare user data
    unset($user['password']);
    
    // Normalize profile image URL
    $profileImage = $user['profile_image'] ?? null;
    if (!empty($profileImage)) {
        $profileImage = trim($profileImage);
        if (strpos($profileImage, 'http://') === 0 || strpos($profileImage, 'https://') === 0) {
            // Already a full URL
        } elseif (strpos($profileImage, '/uploads/') === 0) {
            $profileImage = BASE_URL . $profileImage;
        } elseif (strpos($profileImage, 'uploads/') === 0) {
            $profileImage = BASE_URL . '/' . $profileImage;
        } else {
            $profileImage = UPLOAD_BASE_URL . '/' . ltrim($profileImage, '/');
        }
    }
    
    $userData = [
        'id' => $user['id'],
        'full_name' => $user['full_name'],
        'email' => $user['email'],
        'phone' => $user['phone'],
        'user_type' => $userType, // Return the login type, not registered type
        'email_verified' => (bool)$user['email_verified'],
        'phone_verified' => (bool)$user['phone_verified'],
        'profile_image' => $profileImage
    ];
    
    error_log("Login API: Sending success response for user: {$userData['email']}, type: {$userData['user_type']}");
    sendSuccess('Login successful', [
        'token' => $token,
        'user' => $userData
    ]);
    
} catch (PDOException $e) {
    error_log("=== LOGIN DATABASE ERROR ===");
    error_log("Login Database Error: " . $e->getMessage());
    error_log("Login Error Code: " . $e->getCode());
    error_log("File: " . $e->getFile());
    error_log("Line: " . $e->getLine());
    error_log("Stack trace: " . $e->getTraceAsString());
    error_log("Login SQL State: " . $e->errorInfo[0] ?? 'N/A');
    
    // Provide more specific error message for debugging
    $errorMessage = 'Login failed. Please try again.';
    if (strpos($e->getMessage(), 'Column not found') !== false) {
        $errorMessage = 'Database configuration error. Please contact support.';
        error_log("Column error detected - this is a database schema issue");
    }
    
    sendError($errorMessage, null, 500);
} catch (Exception $e) {
    error_log("=== LOGIN EXCEPTION ===");
    error_log("Login Error: " . $e->getMessage());
    error_log("File: " . $e->getFile());
    error_log("Line: " . $e->getLine());
    error_log("Login Error Trace: " . $e->getTraceAsString());
    sendError('Login failed. Please try again.', null, 500);
}

error_log("=== LOGIN REQUEST END ===");

