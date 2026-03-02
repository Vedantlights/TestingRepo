<?php
/**
 * List Properties for Buyers API
 * GET /api/buyer/properties/list.php
 */

require_once __DIR__ . '/../../../config/config.php';
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../../utils/response.php';
require_once __DIR__ . '/../../../utils/validation.php';
require_once __DIR__ . '/../../../utils/auth.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Method not allowed', null, 405);
}

try {
    // Optional authentication for buyers
    $user = null;
    try {
        $user = getCurrentUser();
    } catch (Exception $e) {
        // Allow unauthenticated access
    }
    
    $db = getDB();
    
    // Get query parameters
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    $limit = isset($_GET['limit']) ? min(MAX_PAGE_SIZE, max(1, intval($_GET['limit']))) : DEFAULT_PAGE_SIZE;
    $offset = ($page - 1) * $limit;
    
    $status = isset($_GET['status']) ? sanitizeInput($_GET['status']) : null;
    $propertyType = isset($_GET['property_type']) ? urldecode(sanitizeInput($_GET['property_type'])) : null;
    $city = isset($_GET['city']) ? sanitizeInput($_GET['city']) : null;
    $location = isset($_GET['location']) ? sanitizeInput($_GET['location']) : null;
    $minPrice = isset($_GET['min_price']) ? floatval($_GET['min_price']) : null;
    $maxPrice = isset($_GET['max_price']) ? floatval($_GET['max_price']) : null;
    $bedrooms = isset($_GET['bedrooms']) ? sanitizeInput($_GET['bedrooms']) : null;
    $search = isset($_GET['search']) ? sanitizeInput($_GET['search']) : null;
    $uploadTime = isset($_GET['upload_time']) ? intval($_GET['upload_time']) : null;
    $availableForBachelors = isset($_GET['available_for_bachelors']) ? filter_var($_GET['available_for_bachelors'], FILTER_VALIDATE_BOOLEAN) : null;
    $projectTypeFilter = isset($_GET['project_type']) ? sanitizeInput($_GET['project_type']) : null;
    
    // Parse budget range (e.g., "25L-50L", "1Cr-2Cr", "5K-10K")
    $budgetRange = isset($_GET['budget']) ? sanitizeInput($_GET['budget']) : null;
    if ($budgetRange && $minPrice === null && $maxPrice === null) {
        // Budget range mapping for different property types
        $budgetMap = [
            // Rent Residential (including PG/Hostel)
            '0K-5K' => [0, 5000],
            '5K-10K' => [5000, 10000],
            '10K-20K' => [10000, 20000],
            '20K-30K' => [20000, 30000],
            '30K-50K' => [30000, 50000],
            '50K-75K' => [50000, 75000],
            '75K-1L' => [75000, 100000],
            '1L-2L' => [100000, 200000],
            '2L+' => [200000, null],
            // Sale Residential (must match SearchBar.jsx / SearchResults.jsx ranges)
            '0-25L' => [0, 2500000],
            '25L-50L' => [2500000, 5000000],
            '50L-75L' => [5000000, 7500000],
            '75L-1Cr' => [7500000, 10000000],
            '1Cr-2Cr' => [10000000, 20000000],
            '2Cr-5Cr' => [20000000, 50000000],
            '5Cr+' => [50000000, null],
            '2Cr+' => [20000000, null],
            // Commercial Sale
            '0-50L' => [0, 5000000],
            '50L-1Cr' => [5000000, 10000000],
            '1Cr-2Cr' => [10000000, 20000000],
            '2Cr-5Cr' => [20000000, 50000000],
            '5Cr-10Cr' => [50000000, 100000000],
            '10Cr-25Cr' => [100000000, 250000000],
            '25Cr+' => [250000000, null],
            // Commercial Rent
            '10K-25K' => [10000, 25000],
            '25K-50K' => [25000, 50000],
            '50K-1L' => [50000, 100000],
            '1L-2L' => [100000, 200000],
            '2L-5L' => [200000, 500000],
            '5L+' => [500000, null]
        ];
        
        if (isset($budgetMap[$budgetRange])) {
            [$min, $max] = $budgetMap[$budgetRange];
            if ($min !== null) {
                $minPrice = $min;
            }
            if ($max !== null) {
                $maxPrice = $max;
            }
        }
    }
    
    // Parse area range (e.g., "0-500 sq ft", "1000-2000 sq ft", "10000+ sq ft")
    $areaRange = isset($_GET['area']) ? sanitizeInput($_GET['area']) : null;
    $minArea = null;
    $maxArea = null;
    if ($areaRange) {
        // Extract min and max area from range string
        if (preg_match('/(\d+)-(\d+)\s*sq\s*ft/i', $areaRange, $matches)) {
            $minArea = floatval($matches[1]);
            $maxArea = floatval($matches[2]);
        } elseif (preg_match('/(\d+)\+\s*sq\s*ft/i', $areaRange, $matches)) {
            $minArea = floatval($matches[1]);
            $maxArea = null;
        }
    }
    
    // Build query
    // Use user_full_name from properties (denormalized) for optimization
    $query = "
        SELECT p.*,
               COALESCE(p.user_full_name, u.full_name) as seller_name,
               u.phone as seller_phone,
               GROUP_CONCAT(DISTINCT pi.image_url ORDER BY pi.image_order) as images,
               GROUP_CONCAT(DISTINCT pa.amenity_id) as amenities
        FROM properties p
        INNER JOIN users u ON p.user_id = u.id
        LEFT JOIN property_images pi ON p.id = pi.property_id
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        WHERE p.is_active = 1
    ";
    
    $params = [];
    
    if ($status && in_array($status, ['sale', 'rent'])) {
        $query .= " AND p.status = ?";
        $params[] = $status;
    }
    
    if ($propertyType) {
        // Handle compound property types (e.g., "Plot / Land / Industrial Property")
        // Split by " / " or "/" (with or without spaces) and match any property that contains any of the individual types
        // This handles cases where:
        // - Search: "Villa / Row House / Bungalow / Farm House"
        // - DB has: "Villa", "Row House", "Villa / Banglow", "Row House/ Farm House", etc.
        // - Also handles typos: "Industrial" vs "Indusrtial", "Bungalow" vs "Banglow"
        
        // Ensure property type is properly decoded and trimmed
        $propertyType = trim($propertyType);
        
        // Normalize: replace " / " and "/" with a consistent delimiter for splitting
        // Also handle URL-encoded slashes (%2F) and plus signs (+) from URL encoding
        $propertyType = str_replace(['+', '%2F', '%2f'], [' ', '/', '/'], $propertyType);
        $normalized = preg_replace('/\s*\/\s*/', ' / ', $propertyType);
        $types = array_map('trim', explode(' / ', $normalized));
        
        if (count($types) > 1) {
            // Multiple types - use LIKE with OR to match any type that contains any search term
            $likeConditions = [];
            foreach ($types as $type) {
                // Handle common typos and variations
                $searchTerms = [$type];
                
                // Handle "Industrial" vs "Indusrtial" typo - add both spellings
                if (stripos($type, 'Industrial') !== false) {
                    $searchTerms[] = str_ireplace('Industrial', 'Indusrtial', $type);
                } elseif (stripos($type, 'Indusrtial') !== false) {
                    $searchTerms[] = str_ireplace('Indusrtial', 'Industrial', $type);
                }
                
                // Handle "Bungalow" vs "Banglow" typo - add both spellings
                if (stripos($type, 'Bungalow') !== false) {
                    $searchTerms[] = str_ireplace('Bungalow', 'Banglow', $type);
                } elseif (stripos($type, 'Banglow') !== false) {
                    $searchTerms[] = str_ireplace('Banglow', 'Bungalow', $type);
                }
                
                // Add LIKE conditions for each search term
                foreach ($searchTerms as $searchTerm) {
                    $likeConditions[] = "p.property_type LIKE ?";
                    $params[] = "%" . $searchTerm . "%";
                }
            }
            $query .= " AND (" . implode(" OR ", $likeConditions) . ")";
        } else {
            // Single type - use LIKE to match exact or compound types containing this type
            // Also handle typos
            $searchTerms = [$propertyType];
            
            // Handle "Industrial" vs "Indusrtial" typo - add both spellings
            if (stripos($propertyType, 'Industrial') !== false) {
                $searchTerms[] = str_ireplace('Industrial', 'Indusrtial', $propertyType);
            } elseif (stripos($propertyType, 'Indusrtial') !== false) {
                $searchTerms[] = str_ireplace('Indusrtial', 'Industrial', $propertyType);
            }
            
            // Handle "Bungalow" vs "Banglow" typo - add both spellings
            if (stripos($propertyType, 'Bungalow') !== false) {
                $searchTerms[] = str_ireplace('Bungalow', 'Banglow', $propertyType);
            } elseif (stripos($propertyType, 'Banglow') !== false) {
                $searchTerms[] = str_ireplace('Banglow', 'Bungalow', $propertyType);
            }
            
            $likeConditions = [];
            foreach ($searchTerms as $searchTerm) {
                $likeConditions[] = "p.property_type LIKE ?";
                $params[] = "%" . $searchTerm . "%";
            }
            $query .= " AND (" . implode(" OR ", $likeConditions) . ")";
        }
    }
    
    // Use location if provided, otherwise use city
    $locationFilter = $location ? $location : $city;
    if ($locationFilter) {
        $query .= " AND p.location LIKE ?";
        $params[] = "%$locationFilter%";
    }
    
    if ($minPrice !== null) {
        $query .= " AND p.price >= ?";
        $params[] = $minPrice;
    }
    
    if ($maxPrice !== null) {
        $query .= " AND p.price <= ?";
        $params[] = $maxPrice;
    }
    
    if ($bedrooms) {
        // Handle BHK format like "1 BHK", "2 BHK", "5+ BHK" or plain numbers like "1", "2", "5+"
        $bedroomStr = trim($bedrooms);
        $bedroomCount = null;
        $isPlus = false;
        
        // Extract number from formats: "1", "2", "1 BHK", "2 BHK", "5+", "5+ BHK"
        if (preg_match('/(\d+)\s*\+?/i', $bedroomStr, $matches)) {
            $bedroomCount = intval($matches[1]);
            $isPlus = (strpos($bedroomStr, '+') !== false);
        }
        
        if ($bedroomCount !== null) {
            if ($isPlus) {
                // For "5+" or "5+ BHK", find properties with >= 5 bedrooms
                // Handle both numeric strings and "X BHK" format in database
                $query .= " AND (CAST(p.bedrooms AS UNSIGNED) >= ? OR p.bedrooms LIKE ?)";
                $params[] = $bedroomCount;
                $params[] = $bedroomCount . '%';
            } else {
                // For exact match like "1", "2", "1 BHK", "2 BHK"
                // Match both the number and "X BHK" format
                $query .= " AND (CAST(p.bedrooms AS UNSIGNED) = ? OR p.bedrooms = ? OR p.bedrooms LIKE ?)";
                $params[] = $bedroomCount;
                $params[] = $bedroomCount;
                $params[] = $bedroomCount . ' BHK%';
            }
        } else {
            // Fallback: direct string match
            $query .= " AND p.bedrooms = ?";
            $params[] = $bedrooms;
        }
    }
    
    if ($minArea !== null) {
        $query .= " AND p.area >= ?";
        $params[] = $minArea;
    }
    
    if ($maxArea !== null) {
        $query .= " AND p.area <= ?";
        $params[] = $maxArea;
    }
    
    if ($search) {
        $query .= " AND (p.title LIKE ? OR p.location LIKE ? OR p.description LIKE ?)";
        $searchTerm = "%$search%";
        $params[] = $searchTerm;
        $params[] = $searchTerm;
        $params[] = $searchTerm;
    }
    
    // Filter by upload time (days)
    if ($uploadTime !== null && $uploadTime > 0) {
        $query .= " AND p.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)";
        $params[] = $uploadTime;
    }
    
    // Filter by available_for_bachelors
    if ($availableForBachelors !== null) {
        $query .= " AND p.available_for_bachelors = ?";
        $params[] = $availableForBachelors ? 1 : 0;
    }
    
    // Filter by project_type (e.g. upcoming = only upcoming/pre-launch projects)
    if ($projectTypeFilter === 'upcoming') {
        $query .= " AND (p.project_type = 'upcoming')";
    }
    
    $query .= " GROUP BY p.id ORDER BY p.created_at DESC LIMIT " . intval($limit) . " OFFSET " . intval($offset);
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $properties = $stmt->fetchAll();
    
    // Get total count
    $countQuery = "
        SELECT COUNT(DISTINCT p.id) as total
        FROM properties p
        WHERE p.is_active = 1
    ";
    $countParams = [];
    
    if ($status) {
        $countQuery .= " AND p.status = ?";
        $countParams[] = $status;
    }
    if ($propertyType) {
        // Handle compound property types (e.g., "Plot / Land / Industrial Property")
        // Split by " / " or "/" (with or without spaces) and match any property that contains any of the individual types
        // This handles cases where:
        // - Search: "Villa / Row House / Bungalow / Farm House"
        // - DB has: "Villa", "Row House", "Villa / Banglow", "Row House/ Farm House", etc.
        // - Also handles typos: "Industrial" vs "Indusrtial", "Bungalow" vs "Banglow"
        
        // Ensure property type is properly decoded and trimmed (re-process for count query)
        $propertyTypeForCount = trim($propertyType);
        $propertyTypeForCount = str_replace(['+', '%2F', '%2f'], [' ', '/', '/'], $propertyTypeForCount);
        $normalizedForCount = preg_replace('/\s*\/\s*/', ' / ', $propertyTypeForCount);
        $typesForCount = array_map('trim', explode(' / ', $normalizedForCount));
        
        if (count($typesForCount) > 1) {
            // Multiple types - use LIKE with OR to match any type that contains any search term
            $likeConditions = [];
            foreach ($typesForCount as $type) {
                // Handle common typos and variations
                $searchTerms = [$type];
                
                // Handle "Industrial" vs "Indusrtial" typo - add both spellings
                if (stripos($type, 'Industrial') !== false) {
                    $searchTerms[] = str_ireplace('Industrial', 'Indusrtial', $type);
                } elseif (stripos($type, 'Indusrtial') !== false) {
                    $searchTerms[] = str_ireplace('Indusrtial', 'Industrial', $type);
                }
                
                // Handle "Bungalow" vs "Banglow" typo - add both spellings
                if (stripos($type, 'Bungalow') !== false) {
                    $searchTerms[] = str_ireplace('Bungalow', 'Banglow', $type);
                } elseif (stripos($type, 'Banglow') !== false) {
                    $searchTerms[] = str_ireplace('Banglow', 'Bungalow', $type);
                }
                
                // Add LIKE conditions for each search term
                foreach ($searchTerms as $searchTerm) {
                    $likeConditions[] = "p.property_type LIKE ?";
                    $countParams[] = "%" . $searchTerm . "%";
                }
            }
            $countQuery .= " AND (" . implode(" OR ", $likeConditions) . ")";
        } else {
            // Single type - use LIKE to match exact or compound types containing this type
            // Also handle typos
            $searchTerms = [$propertyType];
            
            // Handle "Industrial" vs "Indusrtial" typo - add both spellings
            if (stripos($propertyType, 'Industrial') !== false) {
                $searchTerms[] = str_ireplace('Industrial', 'Indusrtial', $propertyType);
            } elseif (stripos($propertyType, 'Indusrtial') !== false) {
                $searchTerms[] = str_ireplace('Indusrtial', 'Industrial', $propertyType);
            }
            
            // Handle "Bungalow" vs "Banglow" typo - add both spellings
            if (stripos($propertyType, 'Bungalow') !== false) {
                $searchTerms[] = str_ireplace('Bungalow', 'Banglow', $propertyType);
            } elseif (stripos($propertyType, 'Banglow') !== false) {
                $searchTerms[] = str_ireplace('Banglow', 'Bungalow', $propertyType);
            }
            
            $likeConditions = [];
            foreach ($searchTerms as $searchTerm) {
                $likeConditions[] = "p.property_type LIKE ?";
                $countParams[] = "%" . $searchTerm . "%";
            }
            $countQuery .= " AND (" . implode(" OR ", $likeConditions) . ")";
        }
    }
    // Use location if provided, otherwise use city
    $locationFilter = $location ? $location : $city;
    if ($locationFilter) {
        $countQuery .= " AND p.location LIKE ?";
        $countParams[] = "%$locationFilter%";
    }
    if ($minPrice !== null) {
        $countQuery .= " AND p.price >= ?";
        $countParams[] = $minPrice;
    }
    if ($maxPrice !== null) {
        $countQuery .= " AND p.price <= ?";
        $countParams[] = $maxPrice;
    }
    if ($bedrooms) {
        // Handle BHK format like "1 BHK", "2 BHK", "5+ BHK" or plain numbers like "1", "2", "5+"
        $bedroomStr = trim($bedrooms);
        $bedroomCount = null;
        $isPlus = false;
        
        // Extract number from formats: "1", "2", "1 BHK", "2 BHK", "5+", "5+ BHK"
        if (preg_match('/(\d+)\s*\+?/i', $bedroomStr, $matches)) {
            $bedroomCount = intval($matches[1]);
            $isPlus = (strpos($bedroomStr, '+') !== false);
        }
        
        if ($bedroomCount !== null) {
            if ($isPlus) {
                // For "5+" or "5+ BHK", find properties with >= 5 bedrooms
                // Handle both numeric strings and "X BHK" format in database
                $countQuery .= " AND (CAST(p.bedrooms AS UNSIGNED) >= ? OR p.bedrooms LIKE ?)";
                $countParams[] = $bedroomCount;
                $countParams[] = $bedroomCount . '%';
            } else {
                // For exact match like "1", "2", "1 BHK", "2 BHK"
                // Match both the number and "X BHK" format
                $countQuery .= " AND (CAST(p.bedrooms AS UNSIGNED) = ? OR p.bedrooms = ? OR p.bedrooms LIKE ?)";
                $countParams[] = $bedroomCount;
                $countParams[] = $bedroomCount;
                $countParams[] = $bedroomCount . ' BHK%';
            }
        } else {
            // Fallback: direct string match
            $countQuery .= " AND p.bedrooms = ?";
            $countParams[] = $bedrooms;
        }
    }
    if ($minArea !== null) {
        $countQuery .= " AND p.area >= ?";
        $countParams[] = $minArea;
    }
    if ($maxArea !== null) {
        $countQuery .= " AND p.area <= ?";
        $countParams[] = $maxArea;
    }
    if ($search) {
        $countQuery .= " AND (p.title LIKE ? OR p.location LIKE ? OR p.description LIKE ?)";
        $searchTerm = "%$search%";
        $countParams[] = $searchTerm;
        $countParams[] = $searchTerm;
        $countParams[] = $searchTerm;
    }
    
    // Filter by upload time (days) in count query
    if ($uploadTime !== null && $uploadTime > 0) {
        $countQuery .= " AND p.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)";
        $countParams[] = $uploadTime;
    }
    
    // Filter by available_for_bachelors in count query
    if ($availableForBachelors !== null) {
        $countQuery .= " AND p.available_for_bachelors = ?";
        $countParams[] = $availableForBachelors ? 1 : 0;
    }
    
    // Filter by project_type in count query
    if ($projectTypeFilter === 'upcoming') {
        $countQuery .= " AND (p.project_type = 'upcoming')";
    }
    
    $stmt = $db->prepare($countQuery);
    $stmt->execute($countParams);
    $total = $stmt->fetch()['total'];
    
    // Format properties and check favorites if user is logged in
    $favoriteIds = [];
    if ($user) {
        $stmt = $db->prepare("SELECT property_id FROM favorites WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        $favoriteIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
    }
    
    foreach ($properties as &$property) {
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
                    // Use UPLOAD_BASE_URL which points to /uploads (not /backend/uploads)
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
        
        // Set cover_image if not set, use first image
        if (empty($property['cover_image']) && !empty($property['images'][0])) {
            $property['cover_image'] = $property['images'][0];
        } elseif (!empty($property['cover_image'])) {
            $coverImg = trim($property['cover_image']);
            // Ensure cover_image is also a full URL
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
        }
        
        $property['amenities'] = $property['amenities'] ? explode(',', $property['amenities']) : [];
        $property['is_favorite'] = in_array($property['id'], $favoriteIds);
        $property['price_negotiable'] = (bool)$property['price_negotiable'];
        $property['views_count'] = intval($property['views_count']);
    }
    
    sendSuccess('Properties retrieved successfully', [
        'properties' => $properties,
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => intval($total),
            'total_pages' => ceil($total / $limit)
        ]
    ]);
    
} catch (Exception $e) {
    error_log("List Properties Error: " . $e->getMessage());
    sendError('Failed to retrieve properties', null, 500);
}

