<?php
/**
 * Activate Property API (Seller/Agent)
 * POST /api/seller/properties/activate.php
 * 
 * Re-activates a deactivated property by linking it to the seller's
 * current active subscription (if slots are available).
 */

ob_start();
require_once __DIR__ . '/../../../config/config.php';
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../../utils/response.php';
require_once __DIR__ . '/../../../utils/auth.php';

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

try {
    $user = requireUserType(['seller', 'agent']);
    
    $input = json_decode(file_get_contents('php://input'), true);
    $propertyId = intval($input['property_id'] ?? 0);
    
    if ($propertyId <= 0) {
        sendError('Property ID is required', null, 400);
    }
    
    $db = getDB();
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Verify property belongs to this user
    $stmt = $db->prepare("SELECT id, user_id, is_active, subscription_id FROM properties WHERE id = ? LIMIT 1");
    $stmt->execute([$propertyId]);
    $property = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$property) {
        sendError('Property not found', null, 404);
    }
    
    if (intval($property['user_id']) !== intval($user['id'])) {
        sendError('You do not own this property', null, 403);
    }
    
    if ((bool)$property['is_active']) {
        sendSuccess('Property is already active', ['property_id' => $propertyId]);
        exit;
    }
    
    // Agents bypass subscription checks
    $effectiveUserType = strtolower($user['user_type'] ?? '');
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
    if (empty($authHeader) && function_exists('getallheaders')) {
        $hdrs = getallheaders();
        $authHeader = $hdrs['Authorization'] ?? $hdrs['authorization'] ?? null;
    }
    if (!empty($authHeader) && preg_match('/Bearer\s+(.*)$/i', $authHeader, $m)) {
        $tokenPayload = verifyToken($m[1]);
        if ($tokenPayload && !empty($tokenPayload['user_type'])) {
            $tokenType = strtolower(trim($tokenPayload['user_type']));
            if (in_array($tokenType, ['seller', 'agent'])) {
                $effectiveUserType = $tokenType;
            }
        }
    }
    
    if ($effectiveUserType === 'agent') {
        // Agents can activate without subscription
        $stmt = $db->prepare("UPDATE properties SET is_active = 1 WHERE id = ?");
        $stmt->execute([$propertyId]);
        
        sendSuccess('Property activated successfully', ['property_id' => $propertyId]);
        exit;
    }
    
    // For sellers: require active subscription with available slots
    
    // Auto-expire subscriptions first (include subs past end_date regardless of is_active)
    $expStmt = $db->prepare("SELECT id FROM subscriptions WHERE user_id = ? AND end_date IS NOT NULL AND end_date < NOW()");
    $expStmt->execute([$user['id']]);
    $expSubIds = $expStmt->fetchAll(PDO::FETCH_COLUMN);
    
    $db->prepare("UPDATE subscriptions SET is_active = 0 WHERE user_id = ? AND is_active = 1 AND end_date IS NOT NULL AND end_date < NOW()")
       ->execute([$user['id']]);
    
    if (!empty($expSubIds)) {
        $colChk = $db->query("SHOW COLUMNS FROM properties LIKE 'subscription_id'");
        if ($colChk->rowCount() > 0) {
            $ph = implode(',', array_fill(0, count($expSubIds), '?'));
            $db->prepare("UPDATE properties SET is_active = 0 WHERE subscription_id IN ($ph) AND is_active = 1")
               ->execute($expSubIds);
        }
    }
    
    // Find active subscription
    $stmt = $db->prepare("
        SELECT s.id AS subscription_id, s.plan_type, s.properties_limit AS sub_limit,
               p.properties_limit AS plan_limit
        FROM subscriptions s
        LEFT JOIN plans p ON p.code = s.plan_type AND p.is_active = 1
        WHERE s.user_id = ? AND s.is_active = 1
          AND (s.end_date IS NULL OR s.end_date > NOW())
        ORDER BY s.created_at DESC LIMIT 1
    ");
    $stmt->execute([$user['id']]);
    $subscription = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$subscription || $subscription['plan_type'] === 'free') {
        sendError(
            'You need an active listing plan to make this property live. Please purchase a plan.',
            ['code' => 'NO_ACTIVE_PLAN', 'requires_subscription' => true],
            403
        );
    }
    
    $subId = intval($subscription['subscription_id']);
    $limit = intval($subscription['sub_limit'] ?: $subscription['plan_limit'] ?: 0);
    
    // Count properties currently using this subscription
    $stmt = $db->prepare("SELECT COUNT(*) as count FROM properties WHERE subscription_id = ? AND is_active = 1");
    $stmt->execute([$subId]);
    $usedCount = intval($stmt->fetch()['count']);
    
    if ($limit > 0 && $usedCount >= $limit) {
        sendError(
            "Your current plan allows $limit active properties and all slots are used. Please upgrade your plan.",
            [
                'code' => 'PLAN_LIMIT_REACHED',
                'properties_limit' => $limit,
                'properties_used' => $usedCount
            ],
            403
        );
    }
    
    // Activate the property and link to current subscription
    $stmt = $db->prepare("UPDATE properties SET is_active = 1, subscription_id = ? WHERE id = ?");
    $stmt->execute([$subId, $propertyId]);
    
    sendSuccess('Property is now live!', [
        'property_id' => $propertyId,
        'subscription_id' => $subId,
        'slots_remaining' => max(0, $limit - $usedCount - 1)
    ]);
    
} catch (Throwable $e) {
    error_log("Activate property error: " . $e->getMessage() . " | Trace: " . $e->getTraceAsString());
    if (ob_get_level()) ob_clean();
    sendError('Failed to activate property: ' . $e->getMessage(), null, 500);
}
