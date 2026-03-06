<?php
/**
 * List available plans
 * GET /api/payment/plans.php
 */

ob_start();
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../utils/response.php';

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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', null, 405);
}

try {
    $db = getDB();

    $stmt = $db->query("SELECT code, name, price_in_paise, properties_limit, duration_months, features, is_popular, sort_order FROM plans WHERE is_active = 1 ORDER BY sort_order ASC");
    $plans = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($plans as &$plan) {
        $plan['price_in_paise'] = intval($plan['price_in_paise']);
        $plan['properties_limit'] = intval($plan['properties_limit']);
        $plan['duration_months'] = intval($plan['duration_months']);
        $plan['is_popular'] = (bool) $plan['is_popular'];
        $plan['features'] = json_decode($plan['features'], true) ?: [];
    }
    unset($plan);

    sendSuccess('Plans retrieved', ['plans' => $plans]);

} catch (Throwable $e) {
    error_log("Plans list error: " . $e->getMessage());
    sendError('Failed to load plans. Please try again.', null, 500);
}
