<?php
/**
 * Get Property Details API
 * GET /api/buyer/properties/details.php?id={property_id}
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
    $propertyId = isset($_GET['id']) ? intval($_GET['id']) : 0;
    if (!$propertyId) {
        sendError('Property ID is required', null, 400);
    }
    
    $db = getDB();
    
    // Get property details
    // Use user_full_name from properties for optimization (denormalized), but still join users for other data
    $stmt = $db->prepare("
        SELECT p.*,
               u.id as seller_id,
               u.user_type as seller_user_type,
               COALESCE(p.user_full_name, u.full_name) as seller_name,
               u.email as seller_email,
               u.phone as seller_phone,
               up.profile_image as seller_profile_image,
               GROUP_CONCAT(DISTINCT pi.image_url ORDER BY pi.image_order) as images,
               GROUP_CONCAT(DISTINCT pa.amenity_id) as amenities
        FROM properties p
        INNER JOIN users u ON p.user_id = u.id
        LEFT JOIN user_profiles up ON u.id = up.user_id
        LEFT JOIN property_images pi ON p.id = pi.property_id
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        WHERE p.id = ? AND p.is_active = 1
        GROUP BY p.id
    ");
    $stmt->execute([$propertyId]);
    $property = $stmt->fetch();
    
    if (!$property) {
        sendError('Property not found', null, 404);
    }
    
    // Increment views count
    $stmt = $db->prepare("UPDATE properties SET views_count = views_count + 1 WHERE id = ?");
    $stmt->execute([$propertyId]);
    
    // Check if user has favorited this property
    $isFavorite = false;
    try {
        $user = getCurrentUser();
        if ($user) {
            $stmt = $db->prepare("SELECT id FROM favorites WHERE user_id = ? AND property_id = ?");
            $stmt->execute([$user['id'], $propertyId]);
            $isFavorite = (bool)$stmt->fetch();
        }
    } catch (Exception $e) {
        // User not authenticated, that's fine
    }
    
    // Format response
    $property['images'] = $property['images'] ? explode(',', $property['images']) : [];
    
    // Ensure image URLs are full URLs (prepend base URL if relative)
    // Filter out empty values and normalize URLs
    if (!empty($property['images'])) {
        $property['images'] = array_filter(array_map(function($img) {
            // Remove whitespace and check if empty
            $img = trim($img);
            if (empty($img)) {
                return null;
            }
            
            // If it's already a full URL (http/https), return as is
            if (strpos($img, 'http://') === 0 || strpos($img, 'https://') === 0) {
                return $img;
            }
            
            // If it starts with /uploads, use UPLOAD_BASE_URL (not BASE_URL)
            if (strpos($img, '/uploads/') === 0) {
                if (defined('UPLOAD_BASE_URL')) {
                    return UPLOAD_BASE_URL . substr($img, 9); // Remove '/uploads/' prefix
                }
                // Fallback
                $host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
                $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                return $protocol . '://' . $host . $img;
            }
            
            // If it starts with uploads/, use UPLOAD_BASE_URL
            if (strpos($img, 'uploads/') === 0) {
                if (defined('UPLOAD_BASE_URL')) {
                    return UPLOAD_BASE_URL . '/' . substr($img, 8); // Remove 'uploads/' prefix
                }
                // Fallback
                $host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
                $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                return $protocol . '://' . $host . '/' . $img;
            }
            
            // Otherwise, prepend the upload base URL
            return UPLOAD_BASE_URL . '/' . ltrim($img, '/');
        }, $property['images']), function($img) {
            return $img !== null && $img !== '';
        });
        
        // Re-index array after filtering
        $property['images'] = array_values($property['images']);
    }
    
    // Normalize cover_image if it exists (use UPLOAD_BASE_URL, not BASE_URL)
    if (!empty($property['cover_image'])) {
        $coverImg = trim($property['cover_image']);
        if (strpos($coverImg, 'http://') === 0 || strpos($coverImg, 'https://') === 0) {
            $property['cover_image'] = $coverImg;
        } elseif (strpos($coverImg, '/uploads/') === 0) {
            // Use UPLOAD_BASE_URL (not BASE_URL)
            if (defined('UPLOAD_BASE_URL')) {
                $property['cover_image'] = UPLOAD_BASE_URL . substr($coverImg, 9); // Remove '/uploads/' prefix
            } else {
                $host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
                $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                $property['cover_image'] = $protocol . '://' . $host . $coverImg;
            }
        } elseif (strpos($coverImg, 'uploads/') === 0) {
            // Use UPLOAD_BASE_URL (not BASE_URL)
            if (defined('UPLOAD_BASE_URL')) {
                $property['cover_image'] = UPLOAD_BASE_URL . '/' . substr($coverImg, 8); // Remove 'uploads/' prefix
            } else {
                $host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
                $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                $property['cover_image'] = $protocol . '://' . $host . '/' . $coverImg;
            }
        } else {
            $property['cover_image'] = UPLOAD_BASE_URL . '/' . ltrim($coverImg, '/');
        }
    } elseif (!empty($property['images'][0])) {
        // Set cover_image if not set, use first image
        $property['cover_image'] = $property['images'][0];
    }
    
    // Normalize video_url if it exists (use UPLOAD_BASE_URL, not BASE_URL)
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
    
    // Normalize seller profile image
    $sellerProfileImage = $property['seller_profile_image'];
    if (!empty($sellerProfileImage)) {
        $sellerProfileImage = trim($sellerProfileImage);
        if (strpos($sellerProfileImage, 'http://') === 0 || strpos($sellerProfileImage, 'https://') === 0) {
            // Already a full URL
        } elseif (strpos($sellerProfileImage, '/uploads/') === 0) {
            $sellerProfileImage = BASE_URL . $sellerProfileImage;
        } elseif (strpos($sellerProfileImage, 'uploads/') === 0) {
            $sellerProfileImage = BASE_URL . '/' . $sellerProfileImage;
        } else {
            $sellerProfileImage = UPLOAD_BASE_URL . '/' . ltrim($sellerProfileImage, '/');
        }
    }
    
    $property['amenities'] = $property['amenities'] ? explode(',', $property['amenities']) : [];
    $property['is_favorite'] = $isFavorite;
    $property['price_negotiable'] = (bool)$property['price_negotiable'];
    $property['views_count'] = intval($property['views_count']);
    
    // Seller info
    $property['seller'] = [
        'id' => $property['seller_id'],
        'name' => $property['seller_name'],
        'email' => $property['seller_email'],
        'phone' => $property['seller_phone'],
        'profile_image' => $sellerProfileImage,
        'user_type' => $property['seller_user_type']
    ];
    
    // Add user_type directly to property for easy access
    $property['user_type'] = $property['seller_user_type'];
    
    // Remove individual seller fields
    unset($property['seller_id'], $property['seller_name'], $property['seller_email'], 
          $property['seller_phone'], $property['seller_profile_image'], $property['seller_user_type']);
    
    sendSuccess('Property details retrieved successfully', ['property' => $property]);
    
} catch (Exception $e) {
    error_log("Property Details Error: " . $e->getMessage());
    sendError('Failed to retrieve property details', null, 500);
}

