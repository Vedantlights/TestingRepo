<?php
/**
 * Forgot Password - Initialize
 * Validates email exists and returns identifier for OTP
 */

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../utils/response.php';
require_once __DIR__ . '/../../utils/validation.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', null, 405);
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    $emailOrPhone = sanitizeInput($input['emailOrPhone'] ?? $input['email'] ?? '');

    if (empty($emailOrPhone)) {
        sendError('Email or mobile number is required', null, 400);
    }

    $isEmail = validateEmail($emailOrPhone);
    $validatedPhone = validatePhone($emailOrPhone);

    if (!$isEmail && !$validatedPhone) {
        sendError('Enter a valid email or mobile number', null, 400);
    }

    $db = getDB();
    
    if ($isEmail) {
        $identifier = strtolower(trim($emailOrPhone));
        $stmt = $db->prepare("SELECT id, email, phone FROM users WHERE LOWER(TRIM(email)) = ?");
        $stmt->execute([$identifier]);
    } else {
        $identifier = $validatedPhone;
        $stmt = $db->prepare("SELECT id, email, phone FROM users WHERE phone = ?");
        $stmt->execute([$identifier]);
    }
    
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        sendError('No account found with this email or phone number', null, 404);
    }

    // Identifier for MSG91 widget: email or formatted phone (91XXXXXXXXXX for SMS)
    $widgetIdentifier = $isEmail ? $user['email'] : preg_replace('/\D/', '', $user['phone'] ?? '');
    if (!$isEmail && strlen($widgetIdentifier) === 10) {
        $widgetIdentifier = '91' . $widgetIdentifier;
    }
    $usedIdentifier = $isEmail ? $user['email'] : ($user['phone'] ?? $identifier);

    sendSuccess('Account found. Please verify OTP.', [
        'identifier' => $user['email'],
        'phone' => $user['phone'] ?? null,
        'hasPhone' => !empty($user['phone']),
        'widgetIdentifier' => $widgetIdentifier,
        'usedIdentifier' => $usedIdentifier,
        'isPhone' => !$isEmail
    ]);

} catch (PDOException $e) {
    error_log("Forgot Password Init Error: " . $e->getMessage());
    sendError('Database error. Please try again.', null, 500);
} catch (Exception $e) {
    error_log("Forgot Password Init Error: " . $e->getMessage());
    sendError('Something went wrong. Please try again.', null, 500);
}
