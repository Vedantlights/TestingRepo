<?php
/**
 * Add Phone to Account (for Google users)
 * POST /api/auth/add-phone.php
 * Requires: Authorization header with valid JWT
 * Body: { phone, phoneVerificationToken }
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

$user = requireAuth();

$input = json_decode(file_get_contents('php://input'), true);
$phone = $input['phone'] ?? '';
$phoneVerificationToken = $input['phoneVerificationToken'] ?? null;

$validatedPhone = validatePhone($phone);
if (!$validatedPhone) {
    sendError('Invalid phone number. Please enter a valid Indian mobile number.', null, 400);
}
$phone = $validatedPhone;

if (empty($phoneVerificationToken)) {
    sendError('Phone verification is required', null, 400);
}

// Extract token from MSG91 widget response (same as register.php)
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

$db = getDB();

// Check if phone is already used by another user
$stmt = $db->prepare("SELECT id FROM users WHERE phone = ? AND id != ?");
$stmt->execute([$phone, $user['id']]);
if ($stmt->fetch()) {
    sendError('This phone number is already registered with another account.', null, 409);
}

// Update user's phone (trust MSG91 widget verification)
$stmt = $db->prepare("UPDATE users SET phone = ?, phone_verified = 1 WHERE id = ?");
$stmt->execute([$phone, $user['id']]);

// Refresh user from DB for response
$stmt = $db->prepare("
    SELECT u.id, u.full_name, u.email, u.phone, u.user_type, u.email_verified, u.phone_verified,
           up.profile_image
    FROM users u
    LEFT JOIN user_profiles up ON u.id = up.user_id
    WHERE u.id = ?
");
$stmt->execute([$user['id']]);
$updatedUser = $stmt->fetch();

// Normalize profile image
$profileImage = $updatedUser['profile_image'] ?? null;
if (!empty($profileImage)) {
    $profileImage = trim($profileImage);
    if (strpos($profileImage, 'http') !== 0) {
        $profileImage = UPLOAD_BASE_URL . '/' . ltrim($profileImage, '/');
    }
}

$userData = [
    'id' => $updatedUser['id'],
    'full_name' => $updatedUser['full_name'],
    'email' => $updatedUser['email'],
    'phone' => $updatedUser['phone'],
    'user_type' => $updatedUser['user_type'],
    'email_verified' => (bool)$updatedUser['email_verified'],
    'phone_verified' => (bool)$updatedUser['phone_verified'],
    'profile_image' => $profileImage
];

sendSuccess('Phone number added successfully', ['user' => $userData]);
