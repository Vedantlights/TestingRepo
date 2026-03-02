<?php
/**
 * Add Property API (Seller/Agent)
 * POST /api/seller/properties/add.php
 */

// Start output buffering to catch any unexpected output
ob_start();

require_once __DIR__ . '/../../../config/config.php';
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../../utils/response.php';
require_once __DIR__ . '/../../../utils/validation.php';
require_once __DIR__ . '/../../../utils/auth.php';
require_once __DIR__ . '/../../../utils/upload.php';
require_once __DIR__ . '/../../../utils/geocoding.php';

// Clear any output that might have been generated during require
ob_clean();

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', null, 405);
}

try {
    $user = requireUserType(['seller', 'agent']);
    
    // AGENTS: NO LIMIT - Skip all limit checks for agents
    // SELLERS: Check property limit based on subscription
    $db = getDB();
    
    // Only check limits for sellers, not agents
    if ($user['user_type'] === 'seller') {
        $planType = 'free'; // Default
        try {
            // Check if subscriptions table exists
            $checkStmt = $db->query("SHOW TABLES LIKE 'subscriptions'");
            if ($checkStmt->rowCount() > 0) {
                $stmt = $db->prepare("SELECT plan_type FROM subscriptions WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1");
                $stmt->execute([$user['id']]);
                $subscription = $stmt->fetch();
                $planType = $subscription['plan_type'] ?? 'free';
            }
        } catch (Exception $e) {
            // Table doesn't exist or error, use default
            error_log("Add Property: Subscriptions table check failed: " . $e->getMessage());
            $planType = 'free';
        }
        
        // Get current property count
        $stmt = $db->prepare("SELECT COUNT(*) as count FROM properties WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        $countResult = $stmt->fetch();
        $currentCount = $countResult['count'];
        
        // Check limit
        $limits = [
            'free' => FREE_PLAN_PROPERTY_LIMIT,
            'basic' => BASIC_PLAN_PROPERTY_LIMIT,
            'pro' => PRO_PLAN_PROPERTY_LIMIT,
            'premium' => PREMIUM_PLAN_PROPERTY_LIMIT,
            'basic_listing' => defined('BASIC_LISTING_PROPERTY_LIMIT') ? BASIC_LISTING_PROPERTY_LIMIT : 1,
            'pro_listing' => defined('PRO_LISTING_PROPERTY_LIMIT') ? PRO_LISTING_PROPERTY_LIMIT : 5,
        ];
        
        $limit = $limits[$planType] ?? FREE_PLAN_PROPERTY_LIMIT;
        if ($limit > 0 && $currentCount >= $limit) {
            sendError("Property limit reached. You can list up to $limit properties in your current plan. Please upgrade to add more.", null, 403);
        }
    }
    // AGENTS: No limit check - they can add unlimited properties
    
    // Get input data
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Validate required fields (bedrooms/bathrooms are conditional based on property type)
    $requiredFields = ['title', 'property_type', 'location', 'area', 'price', 'description'];
    
    // Check if this is an upcoming project (skip bedrooms/bathrooms validation)
    $projectType = isset($input['project_type']) && !empty($input['project_type']) 
        ? sanitizeInput($input['project_type']) 
        : null;
    $isUpcomingProject = ($projectType === 'upcoming');
    
    // Check if property type requires bedrooms/bathrooms (skip for upcoming projects)
    $propertyType = sanitizeInput($input['property_type'] ?? '');
    
    // Studio Apartment doesn't need bedrooms (it's 0 bedrooms by definition)
    // Upcoming projects don't need bedrooms/bathrooms as they're pre-launch
    $needsBedrooms = !$isUpcomingProject && in_array($propertyType, ['Apartment', 'Flat', 'Villa', 'Independent House', 'Row House', 'Penthouse', 'Farm House', 'PG / Hostel']);
    $needsBathrooms = !$isUpcomingProject && in_array($propertyType, ['Apartment', 'Flat', 'Villa', 'Independent House', 'Row House', 'Penthouse', 'Studio Apartment', 'Farm House', 'PG / Hostel', 'Commercial Office', 'Commercial Shop']);
    
    if ($needsBedrooms) {
        $requiredFields[] = 'bedrooms';
    }
    if ($needsBathrooms) {
        $requiredFields[] = 'bathrooms';
    }
    
    $errors = validateRequired($input, $requiredFields);
    
    if (!empty($errors)) {
        sendValidationError($errors);
    }
    
    // Extract and validate data
    $title = sanitizeInput($input['title']);
    $status = in_array($input['status'] ?? 'sale', ['sale', 'rent']) ? $input['status'] : 'sale';
    $propertyType = sanitizeInput($input['property_type']);
    $location = sanitizeInput($input['location']);
    
    // Handle latitude/longitude - convert empty strings to null
    $latitude = null;
    $longitude = null;
    if (isset($input['latitude']) && $input['latitude'] !== '' && $input['latitude'] !== null) {
        $latitude = floatval($input['latitude']);
        // Validate latitude range
        if ($latitude < -90 || $latitude > 90) {
            $latitude = null;
        }
    }
    if (isset($input['longitude']) && $input['longitude'] !== '' && $input['longitude'] !== null) {
        $longitude = floatval($input['longitude']);
        // Validate longitude range
        if ($longitude < -180 || $longitude > 180) {
            $longitude = null;
        }
    }
    
    // Auto-geocode location if coordinates are missing or invalid
    if (($latitude === null || $longitude === null || $latitude == 0 || $longitude == 0) && !empty($location)) {
        $geocoded = geocodeIfNeeded($location, $latitude, $longitude);
        if ($geocoded['latitude'] && $geocoded['longitude']) {
            $latitude = $geocoded['latitude'];
            $longitude = $geocoded['longitude'];
            error_log("Auto-geocoded location '{$location}' to coordinates: {$latitude}, {$longitude}");
        } else {
            error_log("Failed to geocode location '{$location}'. Property will be saved without coordinates.");
        }
    }
    // Studio Apartment should have bedrooms as "0" or null
    // For upcoming projects, default to 0 if not provided
    if ($isUpcomingProject) {
        $bedrooms = isset($input['bedrooms']) ? intval($input['bedrooms']) : 0;
        $bathrooms = isset($input['bathrooms']) ? intval($input['bathrooms']) : 0;
    } else {
        $bedrooms = isset($input['bedrooms']) && !empty($input['bedrooms']) && $input['bedrooms'] !== '0' 
          ? sanitizeInput($input['bedrooms']) 
          : ($propertyType === 'Studio Apartment' ? '0' : null);
        $bathrooms = isset($input['bathrooms']) && !empty($input['bathrooms']) ? sanitizeInput($input['bathrooms']) : null;
    }
    $balconies = isset($input['balconies']) && !empty($input['balconies']) ? sanitizeInput($input['balconies']) : null;
    $area = floatval($input['area']);
    $carpetArea = isset($input['carpet_area']) && !empty($input['carpet_area']) ? floatval($input['carpet_area']) : null;
    // Allow 0 for ground floor (empty(0) is true in PHP, so check explicitly)
    $floor = null;
    if (isset($input['floor'])) {
        if ($input['floor'] === 0 || $input['floor'] === '0') {
            $floor = 0;
        } elseif (!empty($input['floor'])) {
            $floor = sanitizeInput($input['floor']);
        }
    }
    $totalFloors = isset($input['total_floors']) && !empty($input['total_floors']) ? intval($input['total_floors']) : null;
    $facing = isset($input['facing']) && !empty($input['facing']) ? sanitizeInput($input['facing']) : null;
    $age = isset($input['age']) && !empty($input['age']) ? sanitizeInput($input['age']) : null;
    $furnishing = isset($input['furnishing']) && !empty($input['furnishing']) ? sanitizeInput($input['furnishing']) : null;
    $state = isset($input['state']) && !empty($input['state']) ? sanitizeInput($input['state']) : null;
    $additionalAddress = isset($input['additional_address']) && !empty($input['additional_address']) ? sanitizeInput($input['additional_address']) : null;
    $description = sanitizeInput($input['description']);
    $price = floatval($input['price']);
    $priceNegotiable = isset($input['price_negotiable']) ? (bool)$input['price_negotiable'] : false;
    $maintenanceCharges = isset($input['maintenance_charges']) ? floatval($input['maintenance_charges']) : null;
    $depositAmount = isset($input['deposit_amount']) ? floatval($input['deposit_amount']) : null;
    $amenities = $input['amenities'] ?? [];
    $images = $input['images'] ?? []; // Array of base64 or URLs
    $videoUrl = $input['video_url'] ?? null;
    $brochureUrl = $input['brochure_url'] ?? null;
    
    // Plot/Land area limit: max 5 lakh (500000) sq.ft
    $plotLandTypes = ['Plot / Land / Indusrtial Property', 'Plot / Land / Industrial Property', 'Plot / Land'];
    $isPlotLand = in_array($propertyType, $plotLandTypes);
    if ($isPlotLand && $area > 500000) {
        sendError('Plot/Land area cannot exceed 5,00,000 sq.ft.', null, 400);
    }
    
    // Handle available_for_bachelors with business rules enforcement
    // Allowed when: status === "rent" AND property_type IN ("Apartment", "Flat", "Independent House", "Penthouse", "Villa", "Farm House", "Studio Apartment", "Villa / Banglow", "Row House/ Farm House")
    $availableForBachelors = 0; // Default to 0
    $allowedPropertyTypes = ['Apartment', 'Flat', 'Independent House', 'Penthouse', 'Villa', 'Farm House', 'Studio Apartment', 'Villa / Banglow', 'Row House/ Farm House'];
    if ($status === 'rent' && in_array($propertyType, $allowedPropertyTypes)) {
        // Only set to 1 if explicitly provided and conditions are met
        $availableForBachelors = isset($input['available_for_bachelors']) ? ((bool)$input['available_for_bachelors'] ? 1 : 0) : 0;
    }
    // If conditions are not met, it remains 0 (enforced above)
    
    // Helper function to convert base64 images to files
    $convertBase64ToFile = function($base64Data, $propertyId, $index) {
        $uploadsDir = __DIR__ . '/../../uploads';
        $propertyFolder = $uploadsDir . '/properties/' . $propertyId;
        
        // Create property folder if it doesn't exist
        if (!is_dir($propertyFolder)) {
            mkdir($propertyFolder, 0755, true);
        }
        
        $imageData = null;
        $extension = 'jpg';
        $mimeType = 'image/jpeg';
        
        // Check if it's base64 data URI - handle normal and malformed formats
        // Normal: data:image/jpeg;base64,...
        // Malformed: data:image/image/jpeg;base64,...
        if (preg_match('/^data:image\/.*?;base64,(.+)$/', $base64Data, $matches)) {
            $base64String = $matches[1];
            $imageData = base64_decode($base64String);
            
            // Extract image type (handle malformed paths like "image/jpeg")
            if (preg_match('/^data:image\/([^;]+)/', $base64Data, $typeMatches)) {
                $imageType = trim($typeMatches[1]);
                // Handle cases like "image/jpeg" -> extract "jpeg"
                if (strpos($imageType, '/') !== false) {
                    $imageType = substr($imageType, strrpos($imageType, '/') + 1);
                }
                $extension = ($imageType === 'jpeg') ? 'jpg' : $imageType;
                $mimeType = 'image/' . $imageType;
            }
        }
        // Check if it's base64 JPEG string (starts with /9j/)
        elseif (strpos($base64Data, '/9j/') === 0) {
            $imageData = base64_decode($base64Data);
            $extension = 'jpg';
            $mimeType = 'image/jpeg';
        }
        // Catch-all for any data:image format (fallback)
        elseif (strpos($base64Data, 'data:image') === 0) {
            // Extract base64 part after the comma
            $parts = explode(',', $base64Data, 2);
            if (count($parts) === 2) {
                $imageData = base64_decode($parts[1]);
            }
        }
        
        if ($imageData === false || empty($imageData)) {
            error_log("Add Property: Failed to decode base64 image at index {$index}. Data preview: " . substr($base64Data, 0, 100));
            return null;
        }
        
        // Generate unique filename
        $uniqueFilename = 'img_' . time() . '_' . uniqid() . '.' . $extension;
        $filePath = $propertyFolder . '/' . $uniqueFilename;
        
        // Save file
        if (file_put_contents($filePath, $imageData) === false) {
            error_log("Add Property: Failed to save converted image to: {$filePath}");
            return null;
        }
        
        error_log("Add Property: Successfully converted base64 to file: {$filePath} (Size: " . strlen($imageData) . " bytes)");
        
        // Build URL
        $relativePath = 'properties/' . $propertyId . '/' . $uniqueFilename;
        if (defined('UPLOAD_BASE_URL')) {
            $imageUrl = UPLOAD_BASE_URL . '/' . $relativePath;
        } else {
            $host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $imageUrl = $protocol . '://' . $host . '/backend/uploads/' . $relativePath;
        }
        
        return [
            'url' => $imageUrl,
            'filename' => $uniqueFilename,
            'file_path' => $relativePath,
            'file_size' => strlen($imageData),
            'mime_type' => $mimeType
        ];
    };
    
    // Convert base64 images to files BEFORE property is created
    // We'll need to create property first, then convert, so store base64 for later
    $base64Images = [];
    $urlImages = [];
    foreach ($images as $index => $img) {
        // Check if it's a Firebase Storage URL
        if (strpos($img, 'firebasestorage.googleapis.com') !== false) {
            // Firebase URL - validate and keep as-is (no conversion needed)
            $urlImages[] = $img;
            error_log("Add Property: Detected Firebase URL at index {$index}");
        }
        // Check if it's base64 - only detect data URIs, NOT regular URLs
        // Regular URLs start with http://, https://, or /uploads/ - these should pass through unchanged
        elseif ((preg_match('/^data:image\/.*;base64,/', $img) || 
             strpos($img, '/9j/') === 0 || 
             strpos($img, 'data:image') === 0) && 
            strpos($img, 'http://') !== 0 && 
            strpos($img, 'https://') !== 0) {
            $base64Images[] = ['data' => $img, 'index' => $index];
            error_log("Add Property: Detected base64 image at index {$index}");
        } else {
            // Regular URL (server-stored or other) - keep it as-is (website flow unchanged)
            $urlImages[] = $img;
            error_log("Add Property: Detected regular URL at index {$index}");
        }
    }
    
    // Log for debugging
    if (!empty($base64Images)) {
        error_log("Add Property: Found " . count($base64Images) . " base64 images to convert");
    }
    if (!empty($urlImages)) {
        error_log("Add Property: Found " . count($urlImages) . " URL images (will pass through unchanged)");
    }
    
    // Handle project_type (for upcoming/pre-launch projects)
    $projectType = isset($input['project_type']) && !empty($input['project_type']) 
        ? sanitizeInput($input['project_type']) 
        : null;
    
    // Handle upcoming_project_data (additional fields for upcoming projects stored as JSON)
    $upcomingProjectData = null;
    if ($projectType === 'upcoming' && isset($input['upcoming_project_data'])) {
        // Validate and sanitize JSON data
        $upcomingData = $input['upcoming_project_data'];
        if (is_array($upcomingData)) {
            // Sanitize string values in the array
            array_walk_recursive($upcomingData, function(&$value) {
                if (is_string($value)) {
                    $value = sanitizeInput($value);
                }
            });
            $upcomingProjectData = json_encode($upcomingData);
        }
    }
    
    // Images are uploaded separately through moderation endpoint
    // Commented out image validation to allow property creation without images
    // Images will be uploaded via /api/images/moderate-and-upload.php after property is created
    // if (empty($images) || !is_array($images)) {
    //     sendError('At least one image is required', null, 400);
    // }
    
    // Start transaction
    $transactionStarted = false;
    try {
        $db->beginTransaction();
        $transactionStarted = true;
    } catch (PDOException $e) {
        error_log("Add Property: Failed to start transaction: " . $e->getMessage());
        sendError('Failed to start database transaction: ' . $e->getMessage(), null, 500);
        return;
    }
    
    try {
        // Get user's full_name for denormalized storage
        $stmt = $db->prepare("SELECT full_name FROM users WHERE id = ?");
        $stmt->execute([$user['id']]);
        $userData = $stmt->fetch();
        $userFullName = $userData['full_name'] ?? $user['full_name'] ?? '';
        
        // Insert property (is_active defaults to 1, but explicitly set it)
        // Check if project_type column exists (for backward compatibility)
        $checkProjectType = $db->query("SHOW COLUMNS FROM properties LIKE 'project_type'");
        $hasProjectType = $checkProjectType->rowCount() > 0;
        
        $checkUpcomingData = $db->query("SHOW COLUMNS FROM properties LIKE 'upcoming_project_data'");
        $hasUpcomingData = $checkUpcomingData->rowCount() > 0;
        
        if ($hasProjectType && $hasUpcomingData) {
            // New schema with project_type and upcoming_project_data
            $stmt = $db->prepare("
                INSERT INTO properties (
                    user_id, user_full_name, title, status, property_type, project_type, location, latitude, longitude,
                    state, additional_address, bedrooms, bathrooms, balconies, area, carpet_area, floor, total_floors,
                    facing, age, furnishing, description, price, price_negotiable,
                    maintenance_charges, deposit_amount, cover_image, video_url, brochure_url, upcoming_project_data, available_for_bachelors, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // coverImage will be set after base64 conversion, use null for now
            $coverImage = null;
            
            $stmt->execute([
                $user['id'], $userFullName, $title, $status, $propertyType, $projectType, $location, $latitude, $longitude,
                $state, $additionalAddress, $bedrooms, $bathrooms, $balconies, $area, $carpetArea, $floor, $totalFloors,
                $facing, $age, $furnishing, $description, $price, $priceNegotiable,
                $maintenanceCharges, $depositAmount, $coverImage, $videoUrl, $brochureUrl, $upcomingProjectData, $availableForBachelors, 1
            ]);
        } else {
            // Old schema without project_type (backward compatibility)
            $stmt = $db->prepare("
                INSERT INTO properties (
                    user_id, user_full_name, title, status, property_type, location, latitude, longitude,
                    state, additional_address, bedrooms, bathrooms, balconies, area, carpet_area, floor, total_floors,
                    facing, age, furnishing, description, price, price_negotiable,
                    maintenance_charges, deposit_amount, cover_image, video_url, brochure_url, available_for_bachelors, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            // coverImage will be set after base64 conversion, use null for now
            $coverImage = null;
            
            $stmt->execute([
                $user['id'], $userFullName, $title, $status, $propertyType, $location, $latitude, $longitude,
                $state, $additionalAddress, $bedrooms, $bathrooms, $balconies, $area, $carpetArea, $floor, $totalFloors,
                $facing, $age, $furnishing, $description, $price, $priceNegotiable,
                $maintenanceCharges, $depositAmount, $coverImage, $videoUrl, $brochureUrl, $availableForBachelors, 1
            ]);
        }
        
        $propertyId = $db->lastInsertId();
        
        // Process base64 images and convert to files
        $finalImageUrls = $urlImages; // Start with URLs that were already valid
        if (!empty($base64Images)) {
            error_log("Add Property: Starting conversion of " . count($base64Images) . " base64 images for property ID: {$propertyId}");
            try {
                // Check if property_images table exists
                $checkStmt = $db->query("SHOW TABLES LIKE 'property_images'");
                $hasImagesTable = $checkStmt->rowCount() > 0;
                
                $convertedCount = 0;
                foreach ($base64Images as $base64Img) {
                    error_log("Add Property: Converting base64 image at index {$base64Img['index']}, preview: " . substr($base64Img['data'], 0, 80));
                    $converted = $convertBase64ToFile($base64Img['data'], $propertyId, $base64Img['index']);
                    if ($converted) {
                        $finalImageUrls[] = $converted['url'];
                        $convertedCount++;
                        
                        // Insert into property_images table with metadata
                        if ($hasImagesTable) {
                            try {
                                $imgStmt = $db->prepare("
                                    INSERT INTO property_images 
                                    (property_id, image_url, file_name, file_path, original_filename, 
                                     file_size, mime_type, moderation_status, moderation_reason, image_order, created_at) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?, 'SAFE', 'Converted from base64', ?, NOW())
                                ");
                                $imgStmt->execute([
                                    $propertyId,
                                    $converted['url'],
                                    $converted['filename'],
                                    $converted['file_path'],
                                    $converted['filename'],
                                    $converted['file_size'],
                                    $converted['mime_type'],
                                    $base64Img['index']
                                ]);
                                error_log("Add Property: Successfully converted and saved base64 image: {$converted['url']}");
                            } catch (Exception $e) {
                                error_log("Add Property: Failed to insert converted image: " . $e->getMessage());
                            }
                        }
                    } else {
                        error_log("Add Property: Failed to convert base64 image at index {$base64Img['index']}");
                    }
                }
                error_log("Add Property: Converted {$convertedCount} of " . count($base64Images) . " base64 images successfully");
            } catch (Exception $e) {
                error_log("Add Property: Exception during base64 conversion: " . $e->getMessage());
                error_log("Add Property: Stack trace: " . $e->getTraceAsString());
                // Continue - property is already saved
            }
        } else {
            error_log("Add Property: No base64 images to convert, using URL images only");
        }
        
        // Ensure finalImageUrls is set even if empty
        if (empty($finalImageUrls) && !empty($base64Images)) {
            error_log("WARNING: Add Property - Base64 images were provided but conversion resulted in no URLs");
        }
        
        // Insert URL images (only if table exists)
        if (!empty($urlImages)) {
            try {
                // Check if property_images table exists
                $checkStmt = $db->query("SHOW TABLES LIKE 'property_images'");
                if ($checkStmt->rowCount() > 0) {
                    $stmt = $db->prepare("INSERT INTO property_images (property_id, image_url, image_order) VALUES (?, ?, ?)");
                    foreach ($urlImages as $index => $imageUrl) {
                        // Skip if already inserted (from base64 conversion)
                        $checkUrlStmt = $db->prepare("SELECT id FROM property_images WHERE property_id = ? AND image_url = ?");
                        $checkUrlStmt->execute([$propertyId, $imageUrl]);
                        if (!$checkUrlStmt->fetch()) {
                            $stmt->execute([$propertyId, $imageUrl, count($base64Images) + $index]);
                        }
                    }
                }
            } catch (Exception $e) {
                error_log("Add Property: Failed to insert URL images: " . $e->getMessage());
                // Continue - property is already saved
            }
        }
        
        // Update cover image with first image (from converted URLs or original URLs)
        if (!empty($finalImageUrls)) {
            $firstImageUrl = $finalImageUrls[0];
            $stmt = $db->prepare("UPDATE properties SET cover_image = ? WHERE id = ?");
            $stmt->execute([$firstImageUrl, $propertyId]);
            $coverImage = $firstImageUrl;
        } elseif (!$coverImage && !empty($images[0])) {
            // Fallback to original first image if conversion failed
            $stmt = $db->prepare("UPDATE properties SET cover_image = ? WHERE id = ?");
            $stmt->execute([$images[0], $propertyId]);
            $coverImage = $images[0];
        }
        
        // Insert amenities (only if table exists)
        if (!empty($amenities) && is_array($amenities)) {
            try {
                // Check if property_amenities table exists
                $checkStmt = $db->query("SHOW TABLES LIKE 'property_amenities'");
                if ($checkStmt->rowCount() > 0) {
                    $stmt = $db->prepare("INSERT INTO property_amenities (property_id, amenity_id) VALUES (?, ?)");
                    foreach ($amenities as $amenityId) {
                        $stmt->execute([$propertyId, sanitizeInput($amenityId)]);
                    }
                }
            } catch (Exception $e) {
                error_log("Add Property: Failed to insert amenities: " . $e->getMessage());
                // Continue - property is already saved
            }
        }
        
        $db->commit();
        $transactionStarted = false;
        
        // Get created property (handle missing tables gracefully)
        try {
            // Check which tables exist
            $checkImages = $db->query("SHOW TABLES LIKE 'property_images'");
            $hasImagesTable = $checkImages->rowCount() > 0;
            
            $checkAmenities = $db->query("SHOW TABLES LIKE 'property_amenities'");
            $hasAmenitiesTable = $checkAmenities->rowCount() > 0;
            
            if ($hasImagesTable && $hasAmenitiesTable) {
                // Full query with JOINs
                $stmt = $db->prepare("
                    SELECT p.*, 
                           GROUP_CONCAT(pi.image_url ORDER BY pi.image_order) as images,
                           GROUP_CONCAT(pa.amenity_id) as amenities
                    FROM properties p
                    LEFT JOIN property_images pi ON p.id = pi.property_id
                    LEFT JOIN property_amenities pa ON p.id = pa.property_id
                    WHERE p.id = ?
                    GROUP BY p.id
                ");
            } else {
                // Simple query without JOINs
                $stmt = $db->prepare("SELECT * FROM properties WHERE id = ?");
            }
            
            $stmt->execute([$propertyId]);
            $property = $stmt->fetch();
            
            // Format response
            if ($property) {
                if ($hasImagesTable && isset($property['images']) && !empty($property['images'])) {
                    $property['images'] = explode(',', $property['images']);
                    // Ensure converted URLs are included if they exist
                    if (!empty($finalImageUrls)) {
                        // Merge and deduplicate
                        $property['images'] = array_values(array_unique(array_merge($property['images'], $finalImageUrls)));
                    }
                } else {
                    // Use converted URLs first, then cover_image
                    $property['images'] = !empty($finalImageUrls) ? $finalImageUrls : (!empty($coverImage) ? [$coverImage] : []);
                }
                
                // Log for debugging
                error_log("Add Property Response - Final image URLs count: " . count($property['images']));
                if (!empty($property['images'])) {
                    error_log("Add Property Response - First image URL: " . $property['images'][0]);
                }
                
                if ($hasAmenitiesTable && isset($property['amenities']) && !empty($property['amenities'])) {
                    $property['amenities'] = explode(',', $property['amenities']);
                } else {
                    $property['amenities'] = is_array($amenities) ? $amenities : [];
                }
            } else {
                // Property not found after insert - this shouldn't happen, but handle it
                error_log("Add Property: Property not found after insert. ID: $propertyId");
                // Get basic property info
                $stmt = $db->prepare("SELECT * FROM properties WHERE id = ?");
                $stmt->execute([$propertyId]);
                $property = $stmt->fetch();
                if ($property) {
                    $property['images'] = !empty($coverImage) ? [$coverImage] : (!empty($finalImageUrls) ? $finalImageUrls : []);
                    $property['amenities'] = is_array($amenities) ? $amenities : [];
                } else {
                    // Still not found - return minimal data
                    $property = [
                        'id' => $propertyId,
                        'title' => $title,
                        'status' => $status,
                        'images' => !empty($coverImage) ? [$coverImage] : (!empty($finalImageUrls) ? $finalImageUrls : []),
                        'amenities' => is_array($amenities) ? $amenities : []
                    ];
                }
            }
        } catch (Exception $e) {
            error_log("Add Property: Failed to fetch property: " . $e->getMessage());
            // Fallback: Get basic property info
            try {
                $stmt = $db->prepare("SELECT * FROM properties WHERE id = ?");
                $stmt->execute([$propertyId]);
                $property = $stmt->fetch();
                if ($property) {
                    $property['images'] = !empty($coverImage) ? [$coverImage] : (!empty($finalImageUrls) ? $finalImageUrls : []);
                    $property['amenities'] = is_array($amenities) ? $amenities : [];
                } else {
                    // Return minimal data
                    $property = [
                        'id' => $propertyId,
                        'title' => $title,
                        'status' => $status,
                        'images' => !empty($coverImage) ? [$coverImage] : (!empty($finalImageUrls) ? $finalImageUrls : []),
                        'amenities' => is_array($amenities) ? $amenities : []
                    ];
                }
            } catch (Exception $e2) {
                error_log("Add Property: Fallback fetch also failed: " . $e2->getMessage());
                // Return minimal data
                $property = [
                    'id' => $propertyId,
                    'title' => $title,
                    'status' => $status,
                    'images' => !empty($coverImage) ? [$coverImage] : (!empty($images[0]) ? [$images[0]] : []),
                    'amenities' => is_array($amenities) ? $amenities : []
                ];
            }
        }
        
        // Clear any output buffer before sending response
        ob_clean();
        sendSuccess('Property added successfully', ['property' => $property]);
        
    } catch (PDOException $e) {
        if ($transactionStarted) {
            try {
                $db->rollBack();
            } catch (Exception $rollbackError) {
                error_log("Add Property: Failed to rollback transaction: " . $rollbackError->getMessage());
            }
        }
        error_log("Add Property PDO Error: " . $e->getMessage());
        error_log("Add Property Error Code: " . $e->getCode());
        error_log("Add Property SQL State: " . ($e->errorInfo[0] ?? 'N/A'));
        error_log("Add Property Error Info: " . print_r($e->errorInfo ?? [], true));
        ob_clean();
        // Don't expose database error details in production
        if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
            sendError('Database error during property creation. Please try again later.', null, 500);
        } else {
            sendError('Database error: ' . $e->getMessage(), ['error_code' => $e->getCode(), 'error_info' => $e->errorInfo ?? []], 500);
        }
    } catch (Exception $e) {
        if ($transactionStarted) {
            try {
                $db->rollBack();
            } catch (Exception $rollbackError) {
                error_log("Add Property: Failed to rollback transaction: " . $rollbackError->getMessage());
            }
        }
        error_log("Add Property Error: " . $e->getMessage());
        error_log("Add Property Stack Trace: " . $e->getTraceAsString());
        ob_clean();
        // Don't expose internal error details in production
        if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
            sendError('Failed to add property. Please try again later.', null, 500);
        } else {
            sendError('Failed to add property: ' . $e->getMessage(), null, 500);
        }
    }
    
} catch (PDOException $e) {
    error_log("Add Property PDO Error (outer): " . $e->getMessage());
    error_log("Add Property Error Code: " . $e->getCode());
    error_log("Add Property SQL State: " . ($e->errorInfo[0] ?? 'N/A'));
    ob_clean();
    // Don't expose database error details in production
    if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
        sendError('Database error during property creation. Please try again later.', null, 500);
    } else {
        sendError('Database error during property creation: ' . $e->getMessage(), ['error_code' => $e->getCode()], 500);
    }
} catch (Exception $e) {
    error_log("Add Property Error (outer): " . $e->getMessage());
    error_log("Add Property Stack Trace: " . $e->getTraceAsString());
    ob_clean();
    // Don't expose internal error details in production
    if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
        sendError('Failed to add property. Please try again later.', null, 500);
    } else {
        sendError('Failed to add property: ' . $e->getMessage(), null, 500);
    }
}

