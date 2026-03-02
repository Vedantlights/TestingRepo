<?php
/**
 * Update Property API
 * PUT /api/seller/properties/update.php?id={property_id}
 */

require_once __DIR__ . '/../../../config/config.php';
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../../utils/response.php';
require_once __DIR__ . '/../../../utils/validation.php';
require_once __DIR__ . '/../../../utils/auth.php';
require_once __DIR__ . '/../../../utils/upload.php';
require_once __DIR__ . '/../../../utils/geocoding.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    sendError('Method not allowed', null, 405);
}

try {
    $user = requireUserType(['seller', 'agent']);
    
    $propertyId = isset($_GET['id']) ? intval($_GET['id']) : 0;
    if (!$propertyId) {
        sendError('Property ID is required', null, 400);
    }
    
    $db = getDB();
    
    // Check if property exists, belongs to user, and get its creation timestamp
    // Each property is tracked independently by its ID and created_at
    $stmt = $db->prepare("SELECT id, created_at FROM properties WHERE id = ? AND user_id = ?");
    $stmt->execute([$propertyId, $user['id']]);
    $property = $stmt->fetch();
    
    if (!$property) {
        sendError('Property not found or access denied', null, 404);
    }
    
    // Check if THIS specific property was created within 24 hours
    // This works correctly for multiple properties because each property has its own created_at
    $createdAt = new DateTime($property['created_at']);
    $now = new DateTime();
    $interval = $now->diff($createdAt);
    
    // Calculate total hours since creation
    $hoursSinceCreation = ($interval->days * 24) + $interval->h + ($interval->i / 60);
    $isOlderThan24Hours = $hoursSinceCreation >= 24;
    
    // Get input data
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    
    // Debug logging
    error_log('Update property request - Property ID: ' . $propertyId);
    error_log('Update property request - Raw input length: ' . strlen($rawInput));
    error_log('Update property request - Input keys: ' . (is_array($input) ? implode(', ', array_keys($input)) : 'NOT ARRAY'));
    
    if (isset($input['images'])) {
        error_log('Update property - Images received: ' . (is_array($input['images']) ? count($input['images']) . ' images' : 'NOT ARRAY'));
        if (is_array($input['images'])) {
            error_log('Update property - First image: ' . (isset($input['images'][0]) ? substr($input['images'][0], 0, 100) : 'NONE'));
        }
    } else {
        error_log('Update property - No images field in input');
    }
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log('Update property - JSON decode error: ' . json_last_error_msg());
        sendError('Invalid JSON in request body: ' . json_last_error_msg(), null, 400);
    }
    
    if (!is_array($input)) {
        error_log('Update property - Input is not an array after JSON decode');
        sendError('Invalid request data format', null, 400);
    }
    
    // If property is older than 24 hours, only allow price, title, and project status to be updated
    // Location-related fields (location, latitude, longitude, state, additional_address) are also restricted
    if ($isOlderThan24Hours) {
        $allowedFieldsAfter24Hours = ['title', 'price', 'price_negotiable', 'maintenance_charges', 'deposit_amount', 'upcoming_project_data'];
        $restrictedFields = [];
        
        // Explicitly check for location-related fields
        $locationFields = ['location', 'latitude', 'longitude', 'state', 'additional_address'];
        foreach ($locationFields as $field) {
            if (isset($input[$field])) {
                $restrictedFields[] = $field;
            }
        }
        
        // Check all other fields
        foreach ($input as $field => $value) {
            if (!in_array($field, $allowedFieldsAfter24Hours) && !in_array($field, $locationFields)) {
                $restrictedFields[] = $field;
            }
        }
        
        if (!empty($restrictedFields)) {
            $locationFieldsFound = array_intersect($restrictedFields, $locationFields);
            if (!empty($locationFieldsFound)) {
                sendError('After 24 hours, location-related fields (location, state, additional address) cannot be modified. You can only edit the title, price-related fields (price, price negotiable, maintenance charges, deposit amount), and project status.', null, 403);
            } else {
                sendError('After 24 hours, you can only edit the title, price-related fields (price, price negotiable, maintenance charges, deposit amount), and project status (for upcoming projects). Other fields cannot be modified.', null, 403);
            }
        }
    }
    
    // Build update query dynamically
    $updateFields = [];
    $params = [];
    
    $allowedFields = [
        'title', 'status', 'property_type', 'project_type', 'location', 'latitude', 'longitude',
        'state', 'additional_address', 'bedrooms', 'bathrooms', 'balconies', 'area', 'carpet_area', 'floor',
        'total_floors', 'facing', 'age', 'furnishing', 'description', 'price',
        'price_negotiable', 'maintenance_charges', 'deposit_amount',
        'cover_image', 'video_url', 'brochure_url', 'is_active', 'available_for_bachelors', 'upcoming_project_data'
    ];
    
    // Get current property status and type for business rule enforcement
    $currentStatus = isset($input['status']) ? sanitizeInput($input['status']) : null;
    $currentPropertyType = isset($input['property_type']) ? sanitizeInput($input['property_type']) : null;
    
    // If status or property_type is being updated, we need to check the new values
    // Otherwise, fetch current values from database
    if ($currentStatus === null || $currentPropertyType === null) {
        $stmt = $db->prepare("SELECT status, property_type FROM properties WHERE id = ?");
        $stmt->execute([$propertyId]);
        $currentProperty = $stmt->fetch();
        if ($currentProperty) {
            $currentStatus = $currentStatus ?? $currentProperty['status'];
            $currentPropertyType = $currentPropertyType ?? $currentProperty['property_type'];
        }
    }
    
    // Plot/Land area limit: max 5 lakh (500000) sq.ft
    $plotLandTypes = ['Plot / Land / Indusrtial Property', 'Plot / Land / Industrial Property', 'Plot / Land'];
    $effectivePropertyType = isset($input['property_type']) ? sanitizeInput($input['property_type']) : $currentPropertyType;
    $areaToCheck = null;
    if (isset($input['area'])) {
        $areaToCheck = floatval($input['area']);
    } elseif (isset($input['property_type']) && in_array(sanitizeInput($input['property_type']), $plotLandTypes)) {
        $stmt = $db->prepare("SELECT area FROM properties WHERE id = ?");
        $stmt->execute([$propertyId]);
        $row = $stmt->fetch();
        if ($row !== false) {
            $areaToCheck = floatval($row['area']);
        }
    }
    if ($areaToCheck !== null && $effectivePropertyType && in_array($effectivePropertyType, $plotLandTypes) && $areaToCheck > 500000) {
        sendError('Plot/Land area cannot exceed 5,00,000 sq.ft.', null, 400);
    }
    
    // Enforce business rules for available_for_bachelors
    // Allowed when: status === "rent" AND property_type IN ("Apartment", "Flat", "Independent House", "Penthouse", "Villa", "Farm House", "Studio Apartment", "Villa / Banglow", "Row House/ Farm House")
    if (isset($input['available_for_bachelors'])) {
        $allowedPropertyTypes = ['Apartment', 'Flat', 'Independent House', 'Penthouse', 'Villa', 'Farm House', 'Studio Apartment', 'Villa / Banglow', 'Row House/ Farm House'];
        $isValid = ($currentStatus === 'rent' && in_array($currentPropertyType, $allowedPropertyTypes));
        if (!$isValid) {
            // Force to 0 if conditions are not met
            $input['available_for_bachelors'] = 0;
        } else {
            // Convert to int (0 or 1)
            $input['available_for_bachelors'] = (bool)$input['available_for_bachelors'] ? 1 : 0;
        }
    }
    
    // Check if location is being updated and if coordinates need geocoding
    // Only do this if property is NOT older than 24 hours (location changes are restricted after 24 hours)
    $location = isset($input['location']) ? sanitizeInput($input['location']) : null;
    $latitude = isset($input['latitude']) ? floatval($input['latitude']) : null;
    $longitude = isset($input['longitude']) ? floatval($input['longitude']) : null;
    
    // Auto-geocode location if coordinates are missing and location is being updated
    // Only geocode if property is not older than 24 hours (location changes allowed)
    if (!$isOlderThan24Hours && $location !== null && (empty($latitude) || empty($longitude) || $latitude == 0 || $longitude == 0)) {
        $geocoded = geocodeIfNeeded($location, $latitude, $longitude);
        if ($geocoded['latitude'] && $geocoded['longitude']) {
            $latitude = $geocoded['latitude'];
            $longitude = $geocoded['longitude'];
            // Add latitude and longitude to input so they get updated
            $input['latitude'] = $latitude;
            $input['longitude'] = $longitude;
            error_log("Auto-geocoded location '{$location}' to coordinates: {$latitude}, {$longitude}");
        } else {
            error_log("Failed to geocode location '{$location}'. Property will be updated without coordinates.");
        }
    }
    
    foreach ($allowedFields as $field) {
        if (isset($input[$field])) {
            $dbField = str_replace('_', '_', $field); // Keep as is
            $updateFields[] = "$dbField = ?";
            
            if (in_array($field, ['latitude', 'longitude', 'area', 'carpet_area', 'price', 'maintenance_charges', 'deposit_amount'])) {
                $params[] = floatval($input[$field]);
            } elseif (in_array($field, ['total_floors', 'is_active', 'available_for_bachelors'])) {
                $params[] = intval($input[$field]);
            } elseif ($field === 'price_negotiable') {
                $params[] = (bool)$input[$field] ? 1 : 0;
            } elseif ($field === 'upcoming_project_data') {
                $upcomingData = $input[$field];
                if (is_array($upcomingData)) {
                    array_walk_recursive($upcomingData, function(&$value) {
                        if (is_string($value)) {
                            $value = sanitizeInput($value);
                        }
                    });
                    $params[] = json_encode($upcomingData);
                } else {
                    $params[] = sanitizeInput(is_string($upcomingData) ? $upcomingData : json_encode([]));
                }
            } else {
                $params[] = sanitizeInput($input[$field]);
            }
        }
    }
    
    // Allow images-only updates (images are handled separately, not in $updateFields)
    $hasImagesUpdate = isset($input['images']) && is_array($input['images']);
    
    if (empty($updateFields) && !$hasImagesUpdate) {
        sendError('No fields to update', null, 400);
    }
    
    // Start transaction
    $db->beginTransaction();
    
    try {
        // Update property (only if there are fields to update)
        if (!empty($updateFields)) {
            $params[] = $propertyId;
            $query = "UPDATE properties SET " . implode(', ', $updateFields) . ", updated_at = NOW() WHERE id = ?";
            $stmt = $db->prepare($query);
            $stmt->execute($params);
            error_log('Update property - Updated ' . count($updateFields) . ' fields');
        } else {
            // Images-only update - just update timestamp
            $stmt = $db->prepare("UPDATE properties SET updated_at = NOW() WHERE id = ?");
            $stmt->execute([$propertyId]);
            error_log('Update property - Images-only update, updated timestamp only');
        }
        
        // Update images if provided
        if (isset($input['images'])) {
            if (!is_array($input['images'])) {
                error_log('Update property - Images field is not an array: ' . gettype($input['images']));
                error_log('Update property - Images value: ' . print_r($input['images'], true));
                sendError('Images must be an array', null, 400);
            }
            
            error_log('Update property - Processing ' . count($input['images']) . ' images');
            
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
                    error_log("Update property - Failed to decode base64 image at index {$index}. Data preview: " . substr($base64Data, 0, 100));
                    return null;
                }
                
                // Generate unique filename
                $uniqueFilename = 'img_' . time() . '_' . uniqid() . '.' . $extension;
                $filePath = $propertyFolder . '/' . $uniqueFilename;
                
                // Save file
                if (file_put_contents($filePath, $imageData) === false) {
                    error_log("Update property - Failed to save converted image to: {$filePath}");
                    return null;
                }
                
                error_log("Update property - Successfully converted base64 to file: {$filePath} (Size: " . strlen($imageData) . " bytes)");
                
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
            
            // Separate base64 images from URLs
            $base64Images = [];
            $urlImages = [];
            foreach ($input['images'] as $index => $image) {
                $imageString = is_string($image) ? $image : ($image['image_url'] ?? $image['url'] ?? '');
                
                // Check if it's base64 - only detect data URIs, NOT regular URLs
                // Regular URLs start with http://, https://, or /uploads/ - these should pass through unchanged
                if ((preg_match('/^data:image\/.*;base64,/', $imageString) || 
                     strpos($imageString, '/9j/') === 0 || 
                     strpos($imageString, 'data:image') === 0) && 
                    strpos($imageString, 'http://') !== 0 && 
                    strpos($imageString, 'https://') !== 0) {
                    $base64Images[] = ['data' => $imageString, 'index' => $index, 'original' => $image];
                    error_log("Update property - Detected base64 image at index {$index}");
                } else {
                    // Regular URL - keep it as-is (website flow unchanged)
                    $urlImages[] = $image;
                }
            }
            
            // Log for debugging
            if (!empty($base64Images)) {
                error_log("Update property - Found " . count($base64Images) . " base64 images to convert");
            }
            if (!empty($urlImages)) {
                error_log("Update property - Found " . count($urlImages) . " URL images (will pass through unchanged)");
            }
            
            // Delete existing images from property_images table
            $stmt = $db->prepare("DELETE FROM property_images WHERE property_id = ?");
            $stmt->execute([$propertyId]);
            error_log('Update property - Deleted existing images');
            
            // Process base64 images first
            $finalImageUrls = [];
            $linkedCount = 0;
            
            if (!empty($base64Images)) {
                error_log("Update property - Starting conversion of " . count($base64Images) . " base64 images for property ID: {$propertyId}");
                $insertStmt = $db->prepare("
                    INSERT INTO property_images 
                    (property_id, image_url, file_name, file_path, original_filename, file_size, mime_type, moderation_status, moderation_reason, image_order, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'SAFE', 'Converted from base64', ?, NOW())
                ");
                
                $convertedCount = 0;
                foreach ($base64Images as $base64Img) {
                    error_log("Update property - Converting base64 image at index {$base64Img['index']}, preview: " . substr($base64Img['data'], 0, 80));
                    $converted = $convertBase64ToFile($base64Img['data'], $propertyId, $base64Img['index']);
                    if ($converted) {
                        $finalImageUrls[] = $converted['url'];
                        $convertedCount++;
                        try {
                            $insertStmt->execute([
                                $propertyId,
                                $converted['url'],
                                $converted['filename'],
                                $converted['file_path'],
                                $converted['filename'],
                                $converted['file_size'],
                                $converted['mime_type'],
                                $base64Img['index']
                            ]);
                            $linkedCount++;
                            error_log("Update property - Successfully converted and linked base64 image {$base64Img['index']}: {$converted['url']}");
                        } catch (PDOException $e) {
                            error_log("Update property - Failed to insert converted image: " . $e->getMessage());
                        }
                    } else {
                        error_log("Update property - Failed to convert base64 image at index {$base64Img['index']}");
                    }
                }
                error_log("Update property - Converted {$convertedCount} of " . count($base64Images) . " base64 images successfully");
            } else {
                error_log("Update property - No base64 images to convert, using URL images only");
            }
            
            // Insert URL images
            if (count($input['images']) > 0) {
                $insertStmt = $db->prepare("
                    INSERT INTO property_images 
                    (property_id, image_url, file_name, file_path, original_filename, file_size, mime_type, moderation_status, moderation_reason, image_order, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ");
                
                foreach ($urlImages as $index => $image) {
                    // Handle both string URLs and object format
                    if (is_string($image)) {
                        $imageUrl = $image;
                        $fileName = basename(parse_url($imageUrl, PHP_URL_PATH));
                        $filePath = null;
                        $originalName = null;
                        $fileSize = null;
                        $mimeType = null;
                        $modStatus = 'SAFE';
                        $modReason = 'Image approved';
                    } else {
                        $imageUrl = $image['image_url'] ?? $image['url'] ?? '';
                        $fileName = $image['file_name'] ?? basename(parse_url($imageUrl, PHP_URL_PATH));
                        $filePath = $image['file_path'] ?? null;
                        $originalName = $image['original_filename'] ?? null;
                        $fileSize = $image['file_size'] ?? null;
                        $mimeType = $image['mime_type'] ?? null;
                        $modStatus = $image['moderation_status'] ?? 'SAFE';
                        $modReason = $image['moderation_reason'] ?? 'Image approved';
                    }
                    
                    if (!empty($imageUrl)) {
                        // Filter out blob: URLs (temporary preview URLs)
                        if (strpos($imageUrl, 'blob:') === 0) {
                            error_log("Update property - Skipping blob URL at index {$index}");
                            continue;
                        }
                        
                        $finalImageUrls[] = $imageUrl;
                        try {
                            $insertStmt->execute([
                                $propertyId,
                                $imageUrl, // Full URL
                                $fileName,
                                $filePath,
                                $originalName,
                                $fileSize,
                                $mimeType,
                                $modStatus,
                                $modReason,
                                count($base64Images) + $index // image_order
                            ]);
                            $linkedCount++;
                            error_log("Update property - Linked image {$index}: {$imageUrl}");
                        } catch (PDOException $e) {
                            error_log("Update property - Failed to link image {$index}: " . $e->getMessage());
                        }
                    } else {
                        error_log("Update property - Skipping invalid image at index {$index}: " . gettype($image));
                    }
                }
                error_log("Update property - Successfully linked {$linkedCount} of " . count($input['images']) . " images");
                
                // Update cover_image with first image
                if (!empty($finalImageUrls)) {
                    $firstImage = $finalImageUrls[0];
                    $updateCoverStmt = $db->prepare("UPDATE properties SET cover_image = ? WHERE id = ?");
                    $updateCoverStmt->execute([$firstImage, $propertyId]);
                    error_log("Update property - Updated cover_image to: {$firstImage}");
                }
            } else {
                error_log('Update property - Images array is empty, all images removed');
                // Clear cover_image if no images
                $updateCoverStmt = $db->prepare("UPDATE properties SET cover_image = NULL WHERE id = ?");
                $updateCoverStmt->execute([$propertyId]);
            }
        } else {
            error_log('Update property - No images field in input, keeping existing images');
        }
        
        // Update amenities if provided
        if (isset($input['amenities']) && is_array($input['amenities'])) {
            // Delete existing amenities
            $stmt = $db->prepare("DELETE FROM property_amenities WHERE property_id = ?");
            $stmt->execute([$propertyId]);
            
            // Insert new amenities
            $stmt = $db->prepare("INSERT INTO property_amenities (property_id, amenity_id) VALUES (?, ?)");
            foreach ($input['amenities'] as $amenityId) {
                $stmt->execute([$propertyId, sanitizeInput($amenityId)]);
            }
        }
        
        $db->commit();
        
        // Get updated property
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
        $stmt->execute([$propertyId]);
        $property = $stmt->fetch();
        
        if ($property) {
            // Format images - ensure full URLs
            if ($property['images']) {
                $imageArray = explode(',', $property['images']);
                $property['images'] = array_map(function($img) {
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
                    // Fallback to BASE_URL if UPLOAD_BASE_URL not defined
                    if (defined('BASE_URL')) {
                        $host = $_SERVER['HTTP_HOST'] ?? 'testapi.360coordinates.com';
                        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                        if (strpos($img, '/uploads/') === 0) {
                            return $protocol . '://' . $host . $img;
                        }
                        return $protocol . '://' . $host . '/uploads/' . $img;
                    }
                    return $img;
                }, $imageArray);
            } else {
                $property['images'] = [];
            }
            $property['amenities'] = $property['amenities'] ? explode(',', $property['amenities']) : [];
            
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
        }
        
        error_log("Update property - Success! Property ID: {$propertyId}");
        sendSuccess('Property updated successfully', ['property' => $property]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Update Property Error: " . $e->getMessage());
    sendError('Failed to update property', null, 500);
}

