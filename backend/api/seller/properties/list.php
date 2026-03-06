<?php
/**
 * List Seller Properties API
 * GET /api/seller/properties/list.php
 */

require_once __DIR__ . '/../../../config/config.php';
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../../utils/response.php';
require_once __DIR__ . '/../../../utils/auth.php';
require_once __DIR__ . '/../../../utils/validation.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', null, 405);
}

try {
    $user = requireUserType(['seller', 'agent']);
    
    $db = getDB();
    
    // Get query parameters
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    $limit = isset($_GET['limit']) ? min(MAX_PAGE_SIZE, max(1, intval($_GET['limit']))) : DEFAULT_PAGE_SIZE;
    $offset = ($page - 1) * $limit;
    $status = isset($_GET['status']) ? sanitizeInput($_GET['status']) : null;
    
    // Auto-expire subscriptions and deactivate their linked properties
    // Include subs past end_date regardless of is_active (covers manual DB edits)
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
    
    // Simplified query - get properties first, then fetch images separately to avoid GROUP BY issues
    $query = "SELECT p.* FROM properties p WHERE p.user_id = ?";
    $params = [$user['id']];
    
    if ($status && in_array($status, ['sale', 'rent'])) {
        $query .= " AND p.status = ?";
        $params[] = $status;
    }
    
    $query .= " ORDER BY p.created_at DESC LIMIT " . intval($limit) . " OFFSET " . intval($offset);
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $properties = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get total count
    $countQuery = "SELECT COUNT(*) as total FROM properties WHERE user_id = ?";
    $countParams = [$user['id']];
    
    if ($status) {
        $countQuery .= " AND status = ?";
        $countParams[] = $status;
    }
    
    $stmt = $db->prepare($countQuery);
    $stmt->execute($countParams);
    $total = $stmt->fetch()['total'];
    
    // Format properties - fetch images separately to avoid GROUP BY issues
    foreach ($properties as &$property) {
        // Get first image from property_images table
        try {
            $imgStmt = $db->prepare("SELECT image_url FROM property_images WHERE property_id = ? ORDER BY image_order ASC LIMIT 1");
            $imgStmt->execute([$property['id']]);
            $firstImage = $imgStmt->fetchColumn();
        } catch (Exception $e) {
            $firstImage = false;
        }
        
        // Get all images from property_images table
        try {
            $imgStmt = $db->prepare("SELECT image_url FROM property_images WHERE property_id = ? ORDER BY image_order");
            $imgStmt->execute([$property['id']]);
            $allImages = $imgStmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (Exception $e) {
            $allImages = [];
        }
        
        // Normalize image URLs - ensure all are full URLs
        $normalizeImageUrl = function($img) {
            if (empty($img)) return null;
            $img = trim($img);
            
            // If already a full URL, return as is
            if (strpos($img, 'http://') === 0 || strpos($img, 'https://') === 0) {
                return $img;
            }
            
            // If relative path, make it full URL using UPLOAD_BASE_URL
            if (defined('UPLOAD_BASE_URL')) {
                if (strpos($img, '/uploads/') === 0) {
                    return UPLOAD_BASE_URL . substr($img, 9); // Remove '/uploads/' prefix
                }
                if (strpos($img, 'uploads/') === 0) {
                    return UPLOAD_BASE_URL . '/' . substr($img, 8); // Remove 'uploads/' prefix
                }
                return UPLOAD_BASE_URL . '/' . $img;
            }
            
            // Fallback
            $host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            if (strpos($img, '/uploads/') === 0) {
                return $protocol . '://' . $host . $img;
            }
            return $protocol . '://' . $host . '/uploads/' . $img;
        };
        
        // Normalize all images
        $allImages = array_filter(array_map($normalizeImageUrl, $allImages), function($img) {
            return $img !== null && $img !== '';
        });
        $allImages = array_values($allImages);
        
        // Set display_image (for property cards) - prioritize first_image, then first of all_images, then cover_image
        $displayImage = $firstImage ? $normalizeImageUrl($firstImage) : (!empty($allImages[0]) ? $allImages[0] : null);
        if (empty($displayImage) && !empty($property['cover_image'])) {
            $displayImage = $normalizeImageUrl($property['cover_image']);
        }
        $property['display_image'] = $displayImage;
        
        // Set images array
        $property['images'] = $allImages;
        
        // Set cover_image (normalized)
        if (!empty($property['cover_image'])) {
            $property['cover_image'] = $normalizeImageUrl($property['cover_image']);
        } else {
            $property['cover_image'] = !empty($allImages[0]) ? $allImages[0] : null;
        }
        
        // Normalize video_url if it exists (use same logic as images)
        if (!empty($property['video_url'])) {
            $videoUrl = trim($property['video_url']);
            
            // Reject placeholder images or invalid video URLs
            if (strpos($videoUrl, 'placeholder') !== false || 
                strpos($videoUrl, '.jpg') !== false || 
                strpos($videoUrl, '.jpeg') !== false || 
                strpos($videoUrl, '.png') !== false ||
                strpos($videoUrl, '.gif') !== false ||
                strpos($videoUrl, '.webp') !== false) {
                // This is an image, not a video - clear it
                error_log("WARNING: video_url contains image file, clearing: {$videoUrl}");
                $property['video_url'] = null;
            } else {
                // Normalize the video URL
                if (strpos($videoUrl, 'http://') === 0 || strpos($videoUrl, 'https://') === 0) {
                    // Already a full URL
                    $property['video_url'] = $videoUrl;
                } elseif (strpos($videoUrl, '/uploads/') === 0) {
                    // Use UPLOAD_BASE_URL (not BASE_URL)
                    if (defined('UPLOAD_BASE_URL')) {
                        $property['video_url'] = UPLOAD_BASE_URL . substr($videoUrl, 9); // Remove '/uploads/' prefix
                    } else {
                        $host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
                        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                        $property['video_url'] = $protocol . '://' . $host . $videoUrl;
                    }
                } elseif (strpos($videoUrl, 'uploads/') === 0) {
                    // Use UPLOAD_BASE_URL (not BASE_URL)
                    if (defined('UPLOAD_BASE_URL')) {
                        $property['video_url'] = UPLOAD_BASE_URL . '/' . substr($videoUrl, 8); // Remove 'uploads/' prefix
                    } else {
                        $host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
                        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                        $property['video_url'] = $protocol . '://' . $host . '/' . $videoUrl;
                    }
                } else {
                    $property['video_url'] = UPLOAD_BASE_URL . '/' . ltrim($videoUrl, '/');
                }
            }
        }
        
        // Get amenities
        try {
            $amenStmt = $db->prepare("SELECT amenity_id FROM property_amenities WHERE property_id = ?");
            $amenStmt->execute([$property['id']]);
            $property['amenities'] = $amenStmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (Exception $e) {
            $property['amenities'] = [];
        }
        
        // Get counts
        try {
            $countStmt = $db->prepare("SELECT COUNT(*) FROM property_images WHERE property_id = ?");
            $countStmt->execute([$property['id']]);
            $property['image_count'] = intval($countStmt->fetchColumn());
        } catch (Exception $e) {
            $property['image_count'] = 0;
        }
        
        try {
            $countStmt = $db->prepare("SELECT COUNT(*) FROM inquiries WHERE property_id = ?");
            $countStmt->execute([$property['id']]);
            $property['inquiry_count'] = intval($countStmt->fetchColumn());
        } catch (Exception $e) {
            $property['inquiry_count'] = 0;
        }
        
        $property['price_negotiable'] = (bool)($property['price_negotiable'] ?? false);
        $property['is_active'] = (bool)($property['is_active'] ?? true);
        
        // Check if the property's subscription has expired (for "Make Live" prompt)
        $property['subscription_expired'] = false;
        if (!$property['is_active'] && !empty($property['subscription_id'])) {
            try {
                $subCheckStmt = $db->prepare("SELECT is_active, end_date FROM subscriptions WHERE id = ? LIMIT 1");
                $subCheckStmt->execute([$property['subscription_id']]);
                $subRow = $subCheckStmt->fetch(PDO::FETCH_ASSOC);
                if ($subRow) {
                    $subActive = (bool)$subRow['is_active'];
                    $subExpired = $subRow['end_date'] && strtotime($subRow['end_date']) < time();
                    if (!$subActive || $subExpired) {
                        $property['subscription_expired'] = true;
                    }
                }
            } catch (Exception $e) {
                error_log("List properties: subscription check error: " . $e->getMessage());
            }
        }
    }
    
    // Check for active subscription (for "Make Live" feature)
    $activeSubInfo = null;
    try {
        $activeSubStmt = $db->prepare("
            SELECT s.id AS subscription_id, s.plan_type, s.properties_limit AS sub_limit,
                   s.end_date, p.properties_limit AS plan_limit
            FROM subscriptions s
            LEFT JOIN plans p ON p.code = s.plan_type AND p.is_active = 1
            WHERE s.user_id = ? AND s.is_active = 1
              AND (s.end_date IS NULL OR s.end_date > NOW())
            ORDER BY s.created_at DESC LIMIT 1
        ");
        $activeSubStmt->execute([$user['id']]);
        $activeSub = $activeSubStmt->fetch(PDO::FETCH_ASSOC);
        
        if ($activeSub) {
            $subLimit = intval($activeSub['sub_limit'] ?: $activeSub['plan_limit'] ?: 0);
            $subId = intval($activeSub['subscription_id']);
            
            // Count properties already using this subscription
            $usedStmt = $db->prepare("SELECT COUNT(*) as count FROM properties WHERE subscription_id = ? AND is_active = 1");
            $usedStmt->execute([$subId]);
            $usedCount = intval($usedStmt->fetch()['count']);
            
            $activeSubInfo = [
                'subscription_id' => $subId,
                'plan_type' => $activeSub['plan_type'],
                'properties_limit' => $subLimit,
                'properties_used' => $usedCount,
                'slots_available' => max(0, $subLimit - $usedCount),
                'end_date' => $activeSub['end_date']
            ];
        }
    } catch (Exception $e) {
        error_log("List properties: active sub check error: " . $e->getMessage());
    }
    
    sendSuccess('Properties retrieved successfully', [
        'properties' => $properties,
        'active_subscription' => $activeSubInfo,
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => intval($total),
            'total_pages' => ceil($total / $limit)
        ]
    ]);
    
} catch (Exception $e) {
    $errorDetails = [
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ];
    error_log("List Properties Error: " . json_encode($errorDetails));
    
    // In production, don't expose internal error details
    if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
        sendError('Failed to retrieve properties. Please try again later.', null, 500);
    } else {
        // Don't expose internal error details in production
        if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
            sendError('Failed to retrieve properties. Please try again later.', null, 500);
        } else {
            sendError('Failed to retrieve properties: ' . $e->getMessage(), null, 500);
        }
    }
}

