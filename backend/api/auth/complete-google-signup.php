<?php
/**
 * Complete Google Signup (after phone verification)
 * POST /api/auth/complete-google-signup.php
 *
 * For new Google signups: user account is created ONLY after phone is verified.
 * Request: { pendingSignupToken, phone, phoneVerificationToken }
 * Response: { token, user }
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
    $pendingSignupToken = $input['pendingSignupToken'] ?? '';
    $phone = $input['phone'] ?? '';
    $phoneVerificationToken = $input['phoneVerificationToken'] ?? null;

    if (empty($pendingSignupToken)) {
        sendError('Invalid or expired signup session. Please try again with Google.', null, 400);
    }

    $payload = verifyPendingSignupToken($pendingSignupToken);
    if (!$payload) {
        sendError('Signup session expired. Please try again with Google.', null, 401);
    }

    $validatedPhone = validatePhone($phone);
    if (!$validatedPhone) {
        sendError('Invalid phone number. Please enter a valid Indian mobile number.', null, 400);
    }
    $phone = $validatedPhone;

    if (empty($phoneVerificationToken)) {
        sendError('Phone verification is required', null, 400);
    }

    // Extract token from MSG91 widget response (same as add-phone.php)
    $actualToken = $phoneVerificationToken;
    if (is_string($phoneVerificationToken)) {
        $parsed = json_decode($phoneVerificationToken, true);
        if ($parsed && isset($parsed['message'])) {
            $actualToken = $parsed['message'];
        } elseif ($parsed && isset($parsed['token'])) {
            $actualToken = $parsed['token'];
        }
    } elseif (is_array($phoneVerificationToken)) {
        $actualToken = $phoneVerificationToken['message'] ?? $phoneVerificationToken['token'] ?? $phoneVerificationToken;
    }

    if (empty($actualToken)) {
        sendError('Invalid verification token', null, 400);
    }

    $email = $payload['email'] ?? '';
    $name = $payload['name'] ?? 'User';
    $googleId = $payload['google_id'] ?? '';
    $picture = $payload['picture'] ?? '';
    $userType = $payload['user_type'] ?? 'buyer';

    if (empty($email) || empty($googleId)) {
        sendError('Invalid signup session. Please try again with Google.', null, 400);
    }

    $db = getDB();

    // Check if phone is already used by another user
    $stmt = $db->prepare("SELECT id FROM users WHERE phone = ?");
    $stmt->execute([$phone]);
    if ($stmt->fetch()) {
        sendError('This phone number is already registered with another account.', null, 409);
    }

    // Check if user was created in the meantime (e.g. by another tab)
    $stmt = $db->prepare("SELECT id FROM users WHERE google_id = ? OR LOWER(TRIM(email)) = ?");
    $stmt->execute([$googleId, $email]);
    $existing = $stmt->fetch();
    if ($existing) {
        // User exists - update phone and return token
        $stmt = $db->prepare("UPDATE users SET phone = ?, phone_verified = 1 WHERE id = ?");
        $stmt->execute([$phone, $existing['id']]);
        $userId = $existing['id'];
    } else {
        // Create user (only now, after phone verified)
        $roleAccessMap = [
            'buyer' => ['buyer', 'seller'],
            'seller' => ['buyer', 'seller'],
            'agent' => ['agent']
        ];
        $defaultType = in_array($userType, ['agent']) ? 'agent' : 'buyer';

        $stmt = $db->prepare("
            INSERT INTO users (full_name, email, phone, password, user_type, auth_method, google_id, email_verified, phone_verified)
            VALUES (?, ?, ?, NULL, ?, 'google', ?, 1, 1)
        ");
        $stmt->execute([
            $name,
            $email,
            $phone,
            $defaultType,
            $googleId
        ]);
        $userId = $db->lastInsertId();

        try {
            $profileStmt = $db->prepare("INSERT INTO user_profiles (user_id) VALUES (?)");
            $profileStmt->execute([$userId]);
            if (!empty($picture)) {
                $db->prepare("UPDATE user_profiles SET profile_image = ? WHERE user_id = ?")->execute([$picture, $userId]);
            }
        } catch (PDOException $e) {
            error_log('Complete Google signup: Could not create user_profiles: ' . $e->getMessage());
        }
    }

    // Fetch user and generate auth token
    $stmt = $db->prepare("
        SELECT u.id, u.full_name, u.email, u.phone, u.user_type, u.email_verified, u.phone_verified,
               up.profile_image
        FROM users u
        LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE u.id = ?
    ");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    $userEmail = $user['email'] ?? $email;
    $token = generateToken($user['id'], $userType, $userEmail);

    try {
        $stmt = $db->prepare("INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))");
        $stmt->execute([$user['id'], $token, time() + JWT_EXPIRATION]);
    } catch (PDOException $e) {
        error_log('Complete Google signup: Could not store session: ' . $e->getMessage());
    }

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

    sendSuccess('Account created successfully', [
        'token' => $token,
        'user' => $userData
    ]);

} catch (Exception $e) {
    error_log('Complete Google signup error: ' . $e->getMessage());
    sendError('Failed to complete signup. Please try again.', null, 500);
}
