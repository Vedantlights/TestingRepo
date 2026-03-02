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
if (ob_get_level()) ob_clean();
handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', null, 405);
}

$razorpayKeySecret = getenv('RAZORPAY_KEY_SECRET') ?: 'G0SvpcWghvo1A2Dz6mFW7RX4';

// Plan definitions - must match create-order.php
$plans = [
    'basic_listing' => ['properties' => 1, 'months' => 1, 'plan_type' => 'basic_listing'],
    'pro_listing' => ['properties' => 5, 'months' => 1, 'plan_type' => 'pro_listing'],
];

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
    
    if (!isset($plans[$planId])) {
        sendError('Invalid plan', null, 400);
    }
    
    $plan = $plans[$planId];
    
    // Verify signature: HMAC SHA256(order_id|payment_id, secret)
    $expectedSignature = hash_hmac('sha256', $orderId . '|' . $paymentId, $razorpayKeySecret);
    if (!hash_equals($expectedSignature, $signature)) {
        sendError('Payment verification failed. Invalid signature.', null, 400);
    }
    
    $db = getDB();
    
    // Check if already processed (idempotency) - if payment_id column exists
    try {
        $stmt = $db->query("SHOW COLUMNS FROM subscriptions LIKE 'payment_id'");
        if ($stmt->rowCount() > 0) {
            $stmt = $db->prepare("SELECT id FROM subscriptions WHERE user_id = ? AND payment_id = ? LIMIT 1");
            $stmt->execute([$user['id'], $paymentId]);
            if ($stmt->fetch()) {
                sendSuccess('Payment already processed', [
                    'payment_id' => $paymentId,
                    'plan_id' => $planId,
                    'plan_name' => $planId === 'basic_listing' ? 'Basic Plan' : 'Pro Plan',
                ]);
                exit;
            }
        }
    } catch (Exception $e) {
        // Column might not exist, proceed
    }
    
    // Deactivate previous subscriptions
    $stmt = $db->prepare("UPDATE subscriptions SET is_active = 0 WHERE user_id = ?");
    $stmt->execute([$user['id']]);
    
    // Compute end date
    $startDate = date('Y-m-d H:i:s');
    $endDate = date('Y-m-d H:i:s', strtotime("+{$plan['months']} month"));
    
    // Check if payment_id column exists (migration may not have run)
    $stmt = $db->query("SHOW COLUMNS FROM subscriptions LIKE 'payment_id'");
    $hasPaymentId = $stmt->rowCount() > 0;
    
    if ($hasPaymentId) {
        $stmt = $db->prepare("
            INSERT INTO subscriptions (user_id, plan_type, start_date, end_date, is_active, payment_id, order_id, created_at)
            VALUES (?, ?, ?, ?, 1, ?, ?, NOW())
        ");
        $stmt->execute([$user['id'], $plan['plan_type'], $startDate, $endDate, $paymentId, $orderId]);
    } else {
        $stmt = $db->prepare("
            INSERT INTO subscriptions (user_id, plan_type, start_date, end_date, is_active, created_at)
            VALUES (?, ?, ?, ?, 1, NOW())
        ");
        $stmt->execute([$user['id'], $plan['plan_type'], $startDate, $endDate]);
    }
    
    sendSuccess('Payment verified successfully', [
        'payment_id' => $paymentId,
        'plan_id' => $planId,
        'plan_name' => $planId === 'basic_listing' ? 'Basic Plan' : 'Pro Plan',
        'properties_allowed' => $plan['properties'],
        'end_date' => $endDate,
    ]);
    
} catch (Exception $e) {
    error_log("Verify payment error: " . $e->getMessage());
    sendError($e->getMessage(), null, 500);
}
