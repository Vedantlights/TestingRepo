<?php
/**
 * Login with OTP - Verify OTP and Issue JWT (mobile only)
 * POST /api/auth/login-otp-verify.php
 * Body: { phone, otp, userType, requestId? }
 * Verifies OTP via MSG91, finds user by phone, issues JWT.
 */

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/admin-config.php';
require_once __DIR__ . '/../../utils/response.php';
require_once __DIR__ . '/../../utils/validation.php';
require_once __DIR__ . '/../../utils/auth.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', null, 405);
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    $phone = $input['phone'] ?? '';
    $otp = $input['otp'] ?? '';
    $userType = sanitizeInput($input['userType'] ?? 'buyer');
    $requestId = $input['requestId'] ?? null;

    if (empty($phone)) {
        sendError('Phone number is required', null, 400);
    }

    if (empty($otp)) {
        sendError('OTP is required', null, 400);
    }

    if (!in_array($userType, ['buyer', 'seller', 'agent'])) {
        sendError('Invalid user type', null, 400);
    }

    $validatedPhone = validatePhone($phone);
    if (!$validatedPhone) {
        sendError('Invalid phone number format', null, 400);
    }

    // Handle MSG91 Widget Verification
    $isVerified = false;
    if ($otp === 'WIDGET') {
        // trust widget verification for now (matches register.php logic)
        $isVerified = true;
        error_log("Login OTP Verify: Widget verification used for phone=$validatedPhone");
    } else {
        if (!preg_match('/^\d{4,8}$/', $otp)) {
            sendError('Invalid OTP format', null, 400);
        }

        // Verify OTP with MSG91 (v5 API POST with JSON body to match registration)
        $mobileDigits = preg_replace('/\D/', '', $validatedPhone);
        $payload = [
            'mobile' => $mobileDigits,
            'otp'    => $otp,
        ];
        if (!empty($requestId)) {
            $payload['request_id'] = $requestId;
        }
        $verifyUrl = MSG91_VERIFY_OTP_URL;

        $headers = [
            'Content-Type: application/json',
            'authkey: ' . MSG91_AUTH_KEY,
        ];

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $verifyUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_POSTFIELDS     => json_encode($payload),
        ]);

        $responseBody = curl_exec($ch);
        $httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError    = curl_error($ch);
        curl_close($ch);

        if ($responseBody === false) {
            error_log("Login OTP Verify MSG91 cURL error: " . $curlError);
            sendError('OTP verification failed. Please try again.', null, 500);
        }

        $responseJson = json_decode($responseBody, true);
        if ($httpCode !== 200) {
            error_log("Login OTP Verify MSG91 error: Code=$httpCode, Body=" . substr($responseBody, 0, 500));
            sendError($responseJson['message'] ?? 'Invalid or expired OTP. Please try again.', null, 400);
        }

        if (($responseJson['type'] ?? '') !== 'success') {
            error_log("Login OTP Verify MSG91 type!=success: " . substr($responseBody, 0, 500));
            sendError($responseJson['message'] ?? 'Invalid or expired OTP', null, 400);
        }
        $isVerified = true;
    }

    if (!$isVerified) {
        sendError('Verification failed', null, 400);
    }

    // OTP verified - find user and issue JWT
    $db = getDB();
    $stmt = $db->prepare("
        SELECT u.id, u.full_name, u.email, u.phone, u.user_type, u.email_verified, u.phone_verified,
               up.profile_image
        FROM users u
        LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE u.phone = ?
    ");
    $stmt->execute([$validatedPhone]);
    $user = $stmt->fetch();

    if (!$user) {
        sendError('No account found. Please sign up first.', null, 404);
    }

    // Check role access
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

    // Store session
    $stmt = $db->prepare("INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))");
    $stmt->execute([$user['id'], $token, time() + JWT_EXPIRATION]);

    // Normalize profile image
    $profileImage = $user['profile_image'] ?? null;
    if (!empty($profileImage)) {
        $profileImage = trim($profileImage);
        if (strpos($profileImage, 'http') !== 0) {
            $profileImage = UPLOAD_BASE_URL . '/' . ltrim($profileImage, '/');
        }
    }

    $userData = [
        'id' => $user['id'],
        'full_name' => $user['full_name'],
        'email' => $user['email'],
        'phone' => $user['phone'],
        'user_type' => $userType,
        'email_verified' => (bool)$user['email_verified'],
        'phone_verified' => (bool)$user['phone_verified'],
        'profile_image' => $profileImage
    ];

    sendSuccess('Login successful', [
        'token' => $token,
        'user' => $userData
    ]);
} catch (Exception $e) {
    error_log("Login OTP Verify Exception: " . $e->getMessage());
    sendError('Login failed. Please try again.', null, 500);
}
