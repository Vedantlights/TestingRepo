<?php
/**
 * Create Razorpay Order
 * POST /api/payment/create-order.php
 * Body: { "plan_id": "basic_listing"|"pro_listing" }
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

// Razorpay credentials (use env in production)
$razorpayKeyId = getenv('RAZORPAY_KEY_ID') ?: 'rzp_test_SMDn9pa64AbZIb';
$razorpayKeySecret = getenv('RAZORPAY_KEY_SECRET') ?: 'G0SvpcWghvo1A2Dz6mFW7RX4';

$plans = [
    'basic_listing' => ['amount' => 9900, 'name' => 'Basic Plan', 'properties' => 1, 'months' => 1],
    'pro_listing' => ['amount' => 39900, 'name' => 'Pro Plan', 'properties' => 5, 'months' => 1],
];

try {
    $user = requireUserType(['seller', 'agent']);
    
    $input = json_decode(file_get_contents('php://input'), true);
    $planId = $input['plan_id'] ?? null;
    
    if (!isset($plans[$planId])) {
        sendError('Invalid plan. Choose basic_listing or pro_listing.', null, 400);
    }
    
    $plan = $plans[$planId];
    $amount = $plan['amount']; // in paise
    $receipt = 'rcpt_' . $user['id'] . '_' . time();
    
    // Create Razorpay order via API
    $orderData = [
        'amount' => $amount,
        'currency' => 'INR',
        'receipt' => $receipt,
        'payment_capture' => 1,
        'notes' => [
            'user_id' => (string)$user['id'],
            'plan_id' => $planId,
            'plan_name' => $plan['name'],
        ]
    ];
    
    $ch = curl_init('https://api.razorpay.com/v1/orders');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($orderData),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Basic ' . base64_encode($razorpayKeyId . ':' . $razorpayKeySecret),
        ],
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode >= 400) {
        $err = json_decode($response, true);
        error_log("Razorpay create order error: " . ($err['error']['description'] ?? $response));
        sendError($err['error']['description'] ?? 'Failed to create order', null, 500);
    }
    
    $order = json_decode($response, true);
    
    sendSuccess('Order created', [
        'order_id' => $order['id'],
        'amount' => $amount,
        'currency' => $order['currency'] ?? 'INR',
        'key_id' => $razorpayKeyId,
        'plan' => $plan,
        'plan_id' => $planId,
    ]);
    
} catch (Exception $e) {
    error_log("Create order error: " . $e->getMessage());
    sendError($e->getMessage(), null, 500);
}
