<?php
/**
 * Login with OTP - Send OTP (mobile only)
 * POST /api/auth/login-otp-send.php
 * Body: { phone }
 * Checks if user exists by phone. If yes, sends OTP via MSG91.
 * If no account, returns error: "No account found. Please sign up first."
 */

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/admin-config.php';
require_once __DIR__ . '/../../utils/response.php';
require_once __DIR__ . '/../../utils/validation.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', null, 405);
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    $phone = $input['phone'] ?? '';

    if (empty($phone)) {
        sendError('Phone number is required', null, 400);
    }

    $validatedPhone = validatePhone($phone);
    if (!$validatedPhone) {
        sendError('Invalid phone number. Please enter a valid Indian mobile number.', null, 400);
    }

    $db = getDB();

    // Check if user exists by phone
    $stmt = $db->prepare("SELECT id FROM users WHERE phone = ?");
    $stmt->execute([$validatedPhone]);
    $user = $stmt->fetch();

    if (!$user) {
        sendError('No account found with this phone number. Please sign up first.', null, 404);
    }

    // Send OTP via MSG91
    $mobileDigits = preg_replace('/\D/', '', $validatedPhone);

    $payload = [
        'mobile'      => $mobileDigits,
        'template_id' => MSG91_TEMPLATE_ID,
    ];

    $headers = [
        'Content-Type: application/json',
        'authkey: ' . MSG91_AUTH_KEY,
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => MSG91_SEND_OTP_URL,
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
        error_log("Login OTP Send cURL error: " . $curlError);
        sendError('Failed to send OTP. Please try again later.', null, 500);
    }

    $responseJson = json_decode($responseBody, true);
    if ($httpCode !== 200 || !is_array($responseJson)) {
        error_log("Login OTP Send HTTP error: Code=$httpCode, Body=" . substr($responseBody, 0, 500));
        sendError('Failed to send OTP. Please try again later.', null, 500);
    }

    if (($responseJson['type'] ?? '') !== 'success') {
        error_log("Login OTP Send MSG91 error: " . $responseBody);
        $msg = $responseJson['message'] ?? 'Failed to send OTP';
        sendError($msg, null, 500);
    }

    $requestId = $responseJson['request_id'] ?? null;

    sendSuccess('OTP sent to your mobile number', [
        'requestId' => $requestId,
        'message'   => 'OTP sent successfully',
    ]);
} catch (Exception $e) {
    error_log("Login OTP Send Exception: " . $e->getMessage());
    sendError('Failed to send OTP. Please try again.', null, 500);
}
