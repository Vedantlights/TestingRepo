<?php
/**
 * Seller Subscription History
 * GET /api/seller/subscriptions/history.php
 *
 * Returns:
 *  - Current active subscription details (plan name, validity, properties limit/used, status)
 *  - All past subscription history (plan, dates, payment IDs, properties uploaded during each)
 *  - Per-property validity info for the active plan
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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', null, 405);
}

try {
    $user = requireUserType(['seller', 'agent']);
    $userId = $user['id'];
    $db = getDB();
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Auto-expire subscriptions that have passed their end_date
    $expStmt = $db->prepare("SELECT id FROM subscriptions WHERE user_id = ? AND end_date IS NOT NULL AND end_date < NOW()");
    $expStmt->execute([$userId]);
    $expSubIds = $expStmt->fetchAll(PDO::FETCH_COLUMN);
    $db->prepare("UPDATE subscriptions SET is_active = 0 WHERE user_id = ? AND is_active = 1 AND end_date IS NOT NULL AND end_date < NOW()")
       ->execute([$userId]);
    if (!empty($expSubIds)) {
        $colChk = $db->query("SHOW COLUMNS FROM properties LIKE 'subscription_id'");
        if ($colChk->rowCount() > 0) {
            $ph = implode(',', array_fill(0, count($expSubIds), '?'));
            $db->prepare("UPDATE properties SET is_active = 0 WHERE subscription_id IN ($ph) AND is_active = 1")
               ->execute($expSubIds);
        }
    }

    // 1. Fetch ALL subscriptions for this user (newest first), joined with plans
    $stmt = $db->prepare("
        SELECT s.id, s.plan_id, s.plan_type, s.properties_limit AS sub_limit,
               s.start_date, s.end_date, s.is_active, s.payment_id, s.order_id,
               s.created_at,
               p.name AS plan_name, p.price_in_paise, p.properties_limit AS plan_limit,
               p.duration_months, p.features
        FROM subscriptions s
        LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC
    ");
    $stmt->execute([$userId]);
    $allSubscriptions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Check if subscription_id column exists on properties
    $hasSubIdCol = false;
    try {
        $colCheck = $db->query("SHOW COLUMNS FROM properties LIKE 'subscription_id'");
        $hasSubIdCol = $colCheck->rowCount() > 0;
    } catch (Exception $e) {
        $hasSubIdCol = false;
    }

    // 2. Identify active subscription
    $activeSub = null;
    $history = [];

    foreach ($allSubscriptions as $sub) {
        $isExpired = false;
        if (!empty($sub['end_date'])) {
            $isExpired = strtotime($sub['end_date']) < time();
        }

        $entry = [
            'id'               => intval($sub['id']),
            'plan_name'        => $sub['plan_name'] ?: ucfirst(str_replace('_', ' ', $sub['plan_type'])),
            'plan_type'        => $sub['plan_type'],
            'price'            => $sub['price_in_paise'] ? round(intval($sub['price_in_paise']) / 100, 2) : 0,
            'properties_limit' => intval($sub['sub_limit'] ?: $sub['plan_limit'] ?: 0),
            'duration_months'  => intval($sub['duration_months'] ?: 1),
            'features'         => $sub['features'] ? (json_decode($sub['features'], true) ?: []) : [],
            'start_date'       => $sub['start_date'],
            'end_date'         => $sub['end_date'],
            'is_active'        => (bool) $sub['is_active'],
            'is_expired'       => $isExpired,
            'payment_id'       => $sub['payment_id'],
            'order_id'         => $sub['order_id'],
            'purchased_at'     => $sub['created_at'],
        ];

        // Fetch properties linked to this subscription (names + count)
        $subId = intval($sub['id']);
        $subProperties = [];
        if ($hasSubIdCol) {
            $propStmt = $db->prepare("SELECT id, title FROM properties WHERE subscription_id = ? ORDER BY created_at DESC");
            $propStmt->execute([$subId]);
            $subProperties = $propStmt->fetchAll(PDO::FETCH_ASSOC);
            $entry['properties_used'] = count($subProperties);
        } else if (!empty($sub['start_date'])) {
            $endCondition = !empty($sub['end_date']) ? " AND pr.created_at <= ?" : "";
            $params = [$userId, $sub['start_date']];
            if ($endCondition) $params[] = $sub['end_date'];

            $propStmt = $db->prepare("
                SELECT pr.id, pr.title FROM properties pr
                WHERE pr.user_id = ? AND pr.created_at >= ? $endCondition
                ORDER BY pr.created_at DESC
            ");
            $propStmt->execute($params);
            $subProperties = $propStmt->fetchAll(PDO::FETCH_ASSOC);
            $entry['properties_used'] = count($subProperties);
        } else {
            $entry['properties_used'] = 0;
        }
        $entry['property_names'] = array_map(function($p) {
            return ['id' => intval($p['id']), 'title' => $p['title']];
        }, $subProperties);

        if ($sub['is_active'] && !$isExpired && !$activeSub) {
            $activeSub = $entry;
        }

        $history[] = $entry;
    }

    // 3. Fetch properties from ALL non-expired subscriptions
    $activeProperties = [];
    $seenPropIds = [];
    foreach ($history as $histSub) {
        if ($histSub['is_expired']) continue;

        $subId = $histSub['id'];
        $subEndDate = $histSub['end_date'];

        if ($hasSubIdCol) {
            $propStmt = $db->prepare("
                SELECT pr.id, pr.title, pr.property_type, pr.location, pr.price,
                       pr.status, pr.is_active, pr.created_at, pr.views_count,
                       (SELECT pi.image_url FROM property_images pi WHERE pi.property_id = pr.id ORDER BY pi.image_order ASC LIMIT 1) AS cover_image
                FROM properties pr
                WHERE pr.subscription_id = ?
                ORDER BY pr.created_at DESC
            ");
            $propStmt->execute([$subId]);
        } else {
            $propParams = [$userId, $histSub['start_date']];
            $endCond = "";
            if (!empty($subEndDate)) {
                $endCond = " AND pr.created_at <= ?";
                $propParams[] = $subEndDate;
            }
            $propStmt = $db->prepare("
                SELECT pr.id, pr.title, pr.property_type, pr.location, pr.price,
                       pr.status, pr.is_active, pr.created_at, pr.views_count,
                       (SELECT pi.image_url FROM property_images pi WHERE pi.property_id = pr.id ORDER BY pi.image_order ASC LIMIT 1) AS cover_image
                FROM properties pr
                WHERE pr.user_id = ? AND pr.created_at >= ? $endCond
                ORDER BY pr.created_at DESC
            ");
            $propStmt->execute($propParams);
        }
        $props = $propStmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($props as $prop) {
            $propId = intval($prop['id']);
            if (in_array($propId, $seenPropIds)) continue;
            $seenPropIds[] = $propId;

            $daysRemaining = 0;
            if ($subEndDate) {
                $diff = strtotime($subEndDate) - time();
                $daysRemaining = max(0, (int) ceil($diff / 86400));
            }

            $activeProperties[] = [
                'id'             => $propId,
                'title'          => $prop['title'],
                'property_type'  => $prop['property_type'],
                'location'       => $prop['location'],
                'price'          => floatval($prop['price']),
                'listing_type'   => $prop['status'],
                'is_active'      => (bool) $prop['is_active'],
                'cover_image'    => $prop['cover_image'],
                'views'          => intval($prop['views_count']),
                'listed_on'      => $prop['created_at'],
                'valid_until'    => $subEndDate,
                'days_remaining' => $daysRemaining,
                'plan_name'      => $histSub['plan_name'],
            ];
        }
    }

    // 4. Summary stats
    $totalProperties = 0;
    $stmtTotal = $db->prepare("SELECT COUNT(*) as count FROM properties WHERE user_id = ?");
    $stmtTotal->execute([$userId]);
    $totalProperties = intval($stmtTotal->fetch()['count']);

    $remainingUploads = 0;
    if ($activeSub) {
        $remainingUploads = max(0, $activeSub['properties_limit'] - $activeSub['properties_used']);
    }

    $daysLeft = 0;
    if ($activeSub && $activeSub['end_date']) {
        $diff = strtotime($activeSub['end_date']) - time();
        $daysLeft = max(0, (int) ceil($diff / 86400));
    }

    sendSuccess('Subscription history retrieved', [
        'active_subscription' => $activeSub,
        'history'             => $history,
        'active_properties'   => $activeProperties,
        'summary'             => [
            'total_properties'    => $totalProperties,
            'properties_used'     => $activeSub ? $activeSub['properties_used'] : 0,
            'properties_limit'    => $activeSub ? $activeSub['properties_limit'] : 0,
            'remaining_uploads'   => $remainingUploads,
            'days_left'           => $daysLeft,
            'total_subscriptions' => count($history),
        ],
    ]);

} catch (Throwable $e) {
    error_log("Subscription history error: " . $e->getMessage() . " | Trace: " . $e->getTraceAsString());
    sendError('Failed to retrieve subscription history: ' . $e->getMessage(), null, 500);
}
