<?php
/**
 * Seller Dashboard Stats API
 * GET /api/seller/dashboard/stats.php
 */

require_once __DIR__ . '/../../../config/config.php';
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../../utils/response.php';
require_once __DIR__ . '/../../../utils/auth.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', null, 405);
}

try {
    $user = requireUserType(['seller', 'agent']);
    
    $db = getDB();
    
    // Total properties
    $stmt = $db->prepare("SELECT COUNT(*) as total FROM properties WHERE user_id = ?");
    $stmt->execute([$user['id']]);
    $totalProperties = $stmt->fetch()['total'];
    
    // Active properties
    $stmt = $db->prepare("SELECT COUNT(*) as total FROM properties WHERE user_id = ? AND is_active = 1");
    $stmt->execute([$user['id']]);
    $activeProperties = $stmt->fetch()['total'];
    
    // Total inquiries
    $stmt = $db->prepare("SELECT COUNT(*) as total FROM inquiries WHERE seller_id = ?");
    $stmt->execute([$user['id']]);
    $totalInquiries = $stmt->fetch()['total'];
    
    // New inquiries (pending)
    $stmt = $db->prepare("SELECT COUNT(*) as total FROM inquiries WHERE seller_id = ? AND status = 'new'");
    $stmt->execute([$user['id']]);
    $newInquiries = $stmt->fetch()['total'];
    
    // Total views
    $stmt = $db->prepare("SELECT SUM(views_count) as total FROM properties WHERE user_id = ?");
    $stmt->execute([$user['id']]);
    $totalViews = $stmt->fetch()['total'] ?? 0;
    
    // Views from properties created in last 7 days (recent properties)
    $stmt = $db->prepare("SELECT SUM(views_count) as total FROM properties WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
    $stmt->execute([$user['id']]);
    $viewsLast7Days = $stmt->fetch()['total'] ?? 0;
    
    // Views from properties created 7-14 days ago (previous period)
    $stmt = $db->prepare("SELECT SUM(views_count) as total FROM properties WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
    $stmt->execute([$user['id']]);
    $viewsPrevious7Days = $stmt->fetch()['total'] ?? 0;
    
    // Calculate views percentage change
    $viewsPercentageChange = 0;
    if ($viewsPrevious7Days > 0) {
        $viewsPercentageChange = round((($viewsLast7Days - $viewsPrevious7Days) / $viewsPrevious7Days) * 100, 0);
    } else if ($viewsLast7Days > 0) {
        // If no previous period data but we have recent views, show positive growth
        $viewsPercentageChange = 100;
    } else if ($totalViews > 0 && $totalProperties > 0) {
        // Fallback: Calculate based on average views per property (simple growth estimate)
        $avgViewsPerProperty = $totalViews / $totalProperties;
        // If average is above 5, show positive growth
        $viewsPercentageChange = $avgViewsPerProperty > 5 ? 25 : ($avgViewsPerProperty > 2 ? 15 : 5);
    }
    
    // Properties by status
    $stmt = $db->prepare("SELECT status, COUNT(*) as count FROM properties WHERE user_id = ? GROUP BY status");
    $stmt->execute([$user['id']]);
    $propertiesByStatus = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    
    // Recent inquiries (last 5)
    $stmt = $db->prepare("
        SELECT i.*, p.title as property_title
        FROM inquiries i
        INNER JOIN properties p ON i.property_id = p.id
        WHERE i.seller_id = ?
        ORDER BY i.created_at DESC
        LIMIT 5
    ");
    $stmt->execute([$user['id']]);
    $recentInquiries = $stmt->fetchAll();
    
    // Auto-expire subscriptions that have passed their end_date
    // Include BOTH: (a) still-active subs past end_date, (b) already-inactive subs past end_date
    // (b) covers manual DB edits where is_active was set to 0 but properties weren't deactivated)
    $expireStmt = $db->prepare("SELECT id FROM subscriptions WHERE user_id = ? AND end_date IS NOT NULL AND end_date < NOW()");
    $expireStmt->execute([$user['id']]);
    $expiredSubIds = $expireStmt->fetchAll(PDO::FETCH_COLUMN);
    
    // Mark still-active expired subs as inactive
    $db->prepare("UPDATE subscriptions SET is_active = 0 WHERE user_id = ? AND is_active = 1 AND end_date IS NOT NULL AND end_date < NOW()")
       ->execute([$user['id']]);
    
    // Deactivate properties linked to ANY expired subscription (by date), regardless of sub's is_active
    if (!empty($expiredSubIds)) {
        $colCheck = $db->query("SHOW COLUMNS FROM properties LIKE 'subscription_id'");
        if ($colCheck->rowCount() > 0) {
            $placeholders = implode(',', array_fill(0, count($expiredSubIds), '?'));
            $deactivateStmt = $db->prepare("UPDATE properties SET is_active = 0 WHERE subscription_id IN ($placeholders) AND is_active = 1");
            $deactivateStmt->execute($expiredSubIds);
        }
    }
    
    // Subscription info (join with plans to get properties_limit, only non-expired)
    $stmt = $db->prepare("
        SELECT s.id AS subscription_id, s.plan_type, s.start_date, s.end_date,
               s.properties_limit AS sub_limit, p.properties_limit AS plan_limit
        FROM subscriptions s
        LEFT JOIN plans p ON p.code = s.plan_type AND p.is_active = 1
        WHERE s.user_id = ? AND s.is_active = 1
          AND (s.end_date IS NULL OR s.end_date > NOW())
        ORDER BY s.created_at DESC LIMIT 1
    ");
    $stmt->execute([$user['id']]);
    $subscription = $stmt->fetch();
    
    $propertiesLimit = 0;
    $propertiesInCurrentPlan = 0;
    if ($subscription) {
        $propertiesLimit = intval($subscription['sub_limit'] ?? $subscription['plan_limit'] ?? 0);
        $subId = intval($subscription['subscription_id']);
        
        // Count properties linked to this subscription (exact tracking)
        $colCheck = $db->query("SHOW COLUMNS FROM properties LIKE 'subscription_id'");
        if ($colCheck->rowCount() > 0) {
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM properties WHERE subscription_id = ?");
            $stmt->execute([$subId]);
            $propertiesInCurrentPlan = intval($stmt->fetch()['count']);
        } else if (!empty($subscription['start_date'])) {
            // Fallback for pre-migration: count by date range
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM properties WHERE user_id = ? AND created_at >= ?");
            $stmt->execute([$user['id'], $subscription['start_date']]);
            $propertiesInCurrentPlan = intval($stmt->fetch()['count']);
        }
    }
    
    // Count deactivated properties (expired plan)
    $stmt = $db->prepare("SELECT COUNT(*) as total FROM properties WHERE user_id = ? AND is_active = 0");
    $stmt->execute([$user['id']]);
    $expiredProperties = intval($stmt->fetch()['total']);
    
    $stats = [
        'total_properties' => intval($totalProperties),
        'active_properties' => intval($activeProperties),
        'expired_properties' => $expiredProperties,
        'total_inquiries' => intval($totalInquiries),
        'new_inquiries' => intval($newInquiries),
        'total_views' => intval($totalViews),
        'views_percentage_change' => intval($viewsPercentageChange),
        'properties_by_status' => [
            'sale' => intval($propertiesByStatus['sale'] ?? 0),
            'rent' => intval($propertiesByStatus['rent'] ?? 0)
        ],
        'recent_inquiries' => $recentInquiries,
        'properties_in_current_plan' => $propertiesInCurrentPlan,
        'subscription' => $subscription ? [
            'plan_type' => $subscription['plan_type'],
            'start_date' => $subscription['start_date'],
            'end_date' => $subscription['end_date'],
            'properties_limit' => $propertiesLimit
        ] : null
    ];
    
    sendSuccess('Stats retrieved successfully', $stats);
    
} catch (Exception $e) {
    error_log("Dashboard Stats Error: " . $e->getMessage());
    sendError('Failed to retrieve stats', null, 500);
}

