<?php
/**
 * Google OAuth Login/Signup API
 * POST /api/auth/google.php
 * 
 * Accepts Google ID token (credential), verifies with Google, then:
 * - If user exists (by google_id): login
 * - If user exists (by email) but no google_id: link Google to account, login
 * - If new user: create account, login
 * 
 * Request: { credential, userType }
 * Response: { token, user, isNewUser, needsPhone } - needsPhone=true means show Add Mobile modal
 */

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../utils/response.php';
require_once __DIR__ . '/../../utils/validation.php';
require_once __DIR__ . '/../../utils/auth.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', null, 405);
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    $credential = $input['credential'] ?? '';
    $userType = sanitizeInput($input['userType'] ?? 'buyer');

    if (empty($credential)) {
        sendError('Google credential is required', null, 400);
    }

    if (!in_array($userType, ['buyer', 'seller', 'agent'])) {
        sendError('Invalid user type', null, 400);
    }

    if (empty(GOOGLE_CLIENT_ID) || empty(GOOGLE_CLIENT_SECRET)) {
        error_log('Google auth: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured in .env');
        sendError('Google Sign-In is not configured. Please contact support.', null, 503);
    }

    // Verify Google ID token
    $tokenInfo = @file_get_contents('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential));
    if (!$tokenInfo) {
        error_log('Google auth: Failed to verify token - no response');
        sendError('Invalid Google credential. Please try again.', null, 401);
    }

    $tokenData = json_decode($tokenInfo, true);
    if (!$tokenData || isset($tokenData['error'])) {
        error_log('Google auth: Token verification failed - ' . ($tokenData['error'] ?? 'unknown'));
        sendError('Invalid or expired Google credential. Please try again.', null, 401);
    }

    // Validate token was issued for our app
    if (($tokenData['aud'] ?? '') !== GOOGLE_CLIENT_ID) {
        error_log('Google auth: Token audience mismatch');
        sendError('Invalid credential for this application.', null, 401);
    }

    $googleId = $tokenData['sub'] ?? '';
    $email = strtolower(trim($tokenData['email'] ?? ''));
    $name = trim($tokenData['name'] ?? '');
    $picture = trim($tokenData['picture'] ?? '');

    if (empty($googleId) || empty($email)) {
        sendError('Google account must have email. Please use a different account.', null, 400);
    }

    $db = getDB();

    // Check if user exists by google_id
    $stmt = $db->prepare("
        SELECT u.id, u.full_name, u.email, u.phone, u.user_type, u.email_verified, u.phone_verified, u.auth_method,
               up.profile_image
        FROM users u
        LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE u.google_id = ?
    ");
    $stmt->execute([$googleId]);
    $user = $stmt->fetch();

    if (!$user) {
        // Check if user exists by email (e.g. registered with password earlier)
        $stmt = $db->prepare("
            SELECT u.id, u.full_name, u.email, u.phone, u.user_type, u.email_verified, u.phone_verified, u.auth_method,
                   up.profile_image
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE LOWER(TRIM(u.email)) = ?
        ");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user) {
            // Link Google to existing account
            $stmt = $db->prepare("UPDATE users SET google_id = ?, auth_method = 'google' WHERE id = ?");
            $stmt->execute([$googleId, $user['id']]);
            $user['auth_method'] = 'google';
        }
    }

    if (!$user) {
        // New user - create account
        $roleAccessMap = [
            'buyer' => ['buyer', 'seller'],
            'seller' => ['buyer', 'seller'],
            'agent' => ['agent']
        ];
        $allowedRoles = $roleAccessMap[$userType] ?? ['buyer', 'seller'];
        $defaultType = in_array($userType, ['agent']) ? 'agent' : 'buyer';

        $stmt = $db->prepare("
            INSERT INTO users (full_name, email, phone, password, user_type, auth_method, google_id, email_verified, phone_verified)
            VALUES (?, ?, NULL, NULL, ?, 'google', ?, 1, 0)
        ");
        $stmt->execute([
            $name ?: 'User',
            $email,
            $defaultType,
            $googleId
        ]);
        $userId = $db->lastInsertId();

        // Create user_profiles record
        try {
            $profileStmt = $db->prepare("INSERT INTO user_profiles (user_id) VALUES (?)");
            $profileStmt->execute([$userId]);
            if (!empty($picture)) {
                $db->prepare("UPDATE user_profiles SET profile_image = ? WHERE user_id = ?")->execute([$picture, $userId]);
            }
        } catch (PDOException $e) {
            error_log('Google auth: Could not create user_profiles: ' . $e->getMessage());
        }

        // Fetch the new user
        $stmt = $db->prepare("
            SELECT u.id, u.full_name, u.email, u.phone, u.user_type, u.email_verified, u.phone_verified,
                   up.profile_image
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE u.id = ?
        ");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        $user['auth_method'] = 'google';

        $isNewUser = true;
        $needsPhone = true; // New Google user - ask for mobile
    } else {
        $isNewUser = false;
        $needsPhone = empty($user['phone']) || !$user['phone_verified'];
    }

    // Role access check
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

    // Generate token (use email from user for JWT - handle nullable)
    $userEmail = $user['email'] ?? $email;
    $token = generateToken($user['id'], $userType, $userEmail);

    // Store session
    try {
        $stmt = $db->prepare("INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))");
        $stmt->execute([$user['id'], $token, time() + JWT_EXPIRATION]);
    } catch (PDOException $e) {
        error_log('Google auth: Could not store session: ' . $e->getMessage());
    }

    // Normalize profile image
    $profileImage = $user['profile_image'] ?? null;
    if (!empty($profileImage)) {
        $profileImage = trim($profileImage);
        if (strpos($profileImage, 'http://') !== 0 && strpos($profileImage, 'https://') !== 0) {
            if (strpos($profileImage, '/uploads/') === 0 || strpos($profileImage, 'uploads/') === 0) {
                $profileImage = BASE_URL . (strpos($profileImage, '/') === 0 ? '' : '/') . $profileImage;
            } else {
                $profileImage = UPLOAD_BASE_URL . '/' . ltrim($profileImage, '/');
            }
        }
    }

    $userData = [
        'id' => $user['id'],
        'full_name' => $user['full_name'],
        'email' => $user['email'] ?? $email,
        'phone' => $user['phone'],
        'user_type' => $userType,
        'email_verified' => (bool)($user['email_verified'] ?? 1),
        'phone_verified' => (bool)($user['phone_verified'] ?? 0),
        'profile_image' => $profileImage
    ];

    sendSuccess('Authentication successful', [
        'token' => $token,
        'user' => $userData,
        'isNewUser' => $isNewUser ?? false,
        'needsPhone' => $needsPhone ?? false
    ]);

} catch (Exception $e) {
    error_log('Google auth error: ' . $e->getMessage());
    error_log('Google auth trace: ' . $e->getTraceAsString());
    sendError('Authentication failed. Please try again.', null, 500);
}
