<?php
/**
 * Verify Razorpay Payment
 * POST /api/payment/verify.php
 */

ob_start();
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../utils/response.php';
require_once __DIR__ . '/../../utils/auth.php';

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR]) && !headers_sent()) {
        if (ob_get_level()) ob_clean();
        header('Content-Type: application/json');
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
    }
});

if (ob_get_level()) ob_clean();
handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', null, 405);
}

$razorpayKeySecret = getenv('RAZORPAY_KEY_SECRET') ?: 'AcIrMqCFSVj3VZ0pO0IiW6cH';

try {
    $user = requireUserType(['seller', 'agent']);
    
    $input = json_decode(file_get_contents('php://input'), true);
    $orderId = $input['razorpay_order_id'] ?? null;
    $paymentId = $input['razorpay_payment_id'] ?? null;
    $signature = $input['razorpay_signature'] ?? null;
    $planId = $input['plan_id'] ?? null;
    
    if (empty($orderId) || empty($paymentId) || empty($signature) || empty($planId)) {
        sendError('Missing payment details', null, 400);
    }
    
    // Verify signature: HMAC SHA256(order_id|payment_id, secret)
    $expectedSignature = hash_hmac('sha256', $orderId . '|' . $paymentId, $razorpayKeySecret);
    if (!hash_equals($expectedSignature, $signature)) {
        sendError('Payment verification failed. Invalid signature.', null, 400);
    }
    
    $db = getDB();
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Fetch plan from DB
    $stmt = $db->prepare("SELECT id, code, name, properties_limit, duration_months FROM plans WHERE code = ? AND is_active = 1 LIMIT 1");
    $stmt->execute([$planId]);
    $plan = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$plan) {
        sendError('Invalid or inactive plan', null, 400);
    }
    
    // Auto-run migration: ensure plan_type ENUM includes all active plan codes and extra columns exist
    try {
        $stmt = $db->query("SHOW COLUMNS FROM subscriptions LIKE 'plan_type'");
        $col = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($col && strpos($col['Type'], $planId) === false) {
            // Build ENUM dynamically from all active plans
            $allPlans = $db->query("SELECT code FROM plans WHERE is_active = 1")->fetchAll(PDO::FETCH_COLUMN);
            $enumValues = array_merge(['free', 'basic', 'pro', 'premium'], $allPlans);
            $enumValues = array_unique($enumValues);
            $enumStr = implode("','", $enumValues);
            $db->exec("ALTER TABLE `subscriptions` MODIFY COLUMN `plan_type` ENUM('{$enumStr}') DEFAULT 'free'");
        }
        $stmt = $db->query("SHOW COLUMNS FROM subscriptions LIKE 'payment_id'");
        if ($stmt->rowCount() === 0) {
            $db->exec("ALTER TABLE `subscriptions` ADD COLUMN `payment_id` VARCHAR(100) NULL DEFAULT NULL AFTER `is_active`");
            $db->exec("ALTER TABLE `subscriptions` ADD COLUMN `order_id` VARCHAR(100) NULL DEFAULT NULL AFTER `payment_id`");
        }
        $stmt = $db->query("SHOW COLUMNS FROM subscriptions LIKE 'plan_id'");
        if ($stmt->rowCount() === 0) {
            $db->exec("ALTER TABLE `subscriptions` ADD COLUMN `plan_id` INT(11) NULL DEFAULT NULL AFTER `user_id`");
        }
        $stmt = $db->query("SHOW COLUMNS FROM subscriptions LIKE 'properties_limit'");
        if ($stmt->rowCount() === 0) {
            $db->exec("ALTER TABLE `subscriptions` ADD COLUMN `properties_limit` INT(11) NOT NULL DEFAULT 1 AFTER `plan_type`");
        }
    } catch (Exception $e) {
        error_log("Verify payment: migration check warning: " . $e->getMessage());
    }
    
    // Check if already processed (idempotency)
    $stmt = $db->prepare("SELECT id FROM subscriptions WHERE user_id = ? AND payment_id = ? LIMIT 1");
    $stmt->execute([$user['id'], $paymentId]);
    if ($stmt->fetch()) {
        sendSuccess('Payment already processed', [
            'payment_id' => $paymentId,
            'plan_id' => $planId,
            'plan_name' => $plan['name'],
        ]);
        exit;
    }
    
    // Deactivate previous subscriptions
    $stmt = $db->prepare("UPDATE subscriptions SET is_active = 0 WHERE user_id = ?");
    $stmt->execute([$user['id']]);
    
    // Compute end date (30 days per month)
    $months = intval($plan['duration_months']);
    $days = $months * 30;
    $startDate = date('Y-m-d H:i:s');
    $endDate = date('Y-m-d H:i:s', strtotime("+{$days} days"));
    
    $stmt = $db->prepare("
        INSERT INTO subscriptions (user_id, plan_id, plan_type, properties_limit, start_date, end_date, is_active, payment_id, order_id)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ");
    $stmt->execute([$user['id'], $plan['id'], $plan['code'], intval($plan['properties_limit']), $startDate, $endDate, $paymentId, $orderId]);
    
    sendSuccess('Payment verified successfully', [
        'payment_id' => $paymentId,
        'plan_id' => $planId,
        'plan_name' => $plan['name'],
        'properties_allowed' => intval($plan['properties_limit']),
        'end_date' => $endDate,
    ]);
    
} catch (Throwable $e) {
    error_log("Verify payment error: " . $e->getMessage() . " | Trace: " . $e->getTraceAsString());
    sendError('Payment verification failed: ' . $e->getMessage(), null, 500);
}
