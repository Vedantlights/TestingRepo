<?php
/**
 * Validation Helper Functions
 */

// Validate email
if (!function_exists('validateEmail')) {
function validateEmail($email) {
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}
}

// Validate phone (Indian format)
if (!function_exists('validatePhone')) {
function validatePhone($phone) {
    // Remove all non-digit characters
    $digits = preg_replace('/\D/', '', $phone);
    
    // Check if it's a valid Indian mobile number (10 digits starting with 6-9)
    if (strlen($digits) === 10 && preg_match('/^[6-9]\d{9}$/', $digits)) {
        return '+91' . $digits;
    }
    
    // Check if it's already in international format
    if (preg_match('/^\+91[6-9]\d{9}$/', $phone)) {
        return $phone;
    }
    
    return false;
}
}

// Validate mobile number format (supports international format)
if (!function_exists('validateMobileFormat')) {
function validateMobileFormat($mobile) {
    // Remove spaces and normalize
    $mobile = trim($mobile);
    
    // Extract digits only for validation
    $digits = preg_replace('/\D/', '', $mobile);
    
    // Check international format: +[country code][number] (with or without spaces)
    // Normalize to remove spaces first
    $normalized = preg_replace('/\s+/', '', $mobile);
    if (preg_match('/^\+\d{10,15}$/', $normalized)) {
        return $normalized; // Return normalized format without spaces
    }
    
    // Check Indian format: 91[10 digits] (12 digits total)
    if (strlen($digits) === 12 && substr($digits, 0, 2) === '91' && preg_match('/^91[6-9]\d{9}$/', $digits)) {
        return '+' . $digits;
    }
    
    // Check 10-digit Indian number (without country code)
    if (strlen($digits) === 10 && preg_match('/^[6-9]\d{9}$/', $digits)) {
        return '+91' . $digits;
    }
    
    return false;
}
}

// Validate password strength
if (!function_exists('validatePassword')) {
function validatePassword($password) {
    // At least 6 characters
    if (strlen($password) < 6) {
        return false;
    }
    return true;
}
}

// Sanitize input
if (!function_exists('sanitizeInput')) {
function sanitizeInput($data) {
    if (is_array($data)) {
        return array_map('sanitizeInput', $data);
    }
    return htmlspecialchars(strip_tags(trim($data)), ENT_QUOTES, 'UTF-8');
}
}

// Validate required fields
if (!function_exists('validateRequired')) {
function validateRequired($data, $requiredFields) {
    $errors = [];
    
    // Numeric fields that can be 0 (not considered empty)
    $numericFields = ['area', 'price', 'bedrooms', 'bathrooms', 'total_floors', 'carpet_area', 'maintenance_charges', 'deposit_amount'];
    
    foreach ($requiredFields as $field) {
        if (!isset($data[$field])) {
            $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' is required';
        } elseif (in_array($field, $numericFields)) {
            // For numeric fields, check if it's null, empty string, or not a valid number (but allow 0)
            // Bedrooms/bathrooms also allow "N+" format (e.g. "5+", "4+", "3+")
            $value = $data[$field];
            $isEmpty = ($value === null || $value === '');
            $isNumeric = is_numeric($value) || $value === 0 || $value === '0';
            // Allow "N+" for bedrooms, bathrooms, balconies (e.g. "5+", "4+", "3+")
            $isPlusFormat = in_array($field, ['bedrooms', 'bathrooms', 'balconies']) && is_string($value) && preg_match('/^\d+\+$/', trim($value));
            if ($isEmpty || (!$isNumeric && !$isPlusFormat)) {
                $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' is required';
            }
        } else {
            // For string fields, check if empty after trimming
            $value = is_string($data[$field]) ? trim($data[$field]) : $data[$field];
            if (empty($value) && $value !== '0' && $value !== 0) {
                $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' is required';
            }
        }
    }
    
    return $errors;
}
}

// Validate file upload
if (!function_exists('validateFileUpload')) {
function validateFileUpload($file, $allowedTypes, $maxSize) {
    $errors = [];
    
    if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
        $errors[] = 'File upload error';
        return $errors;
    }
    
    // Check file size
    if ($file['size'] > $maxSize) {
        $errors[] = 'File size exceeds maximum allowed size';
    }
    
    // Check file type
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    if (!in_array($mimeType, $allowedTypes)) {
        $errors[] = 'Invalid file type. Allowed types: ' . implode(', ', $allowedTypes);
    }
    
    return $errors;
}
}

// Generate OTP
if (!function_exists('generateOTP')) {
function generateOTP($length = 6) {
    return str_pad(random_int(0, pow(10, $length) - 1), $length, '0', STR_PAD_LEFT);
}
}

// Validate OTP format
if (!function_exists('validateOTP')) {
function validateOTP($otp) {
    return preg_match('/^\d{6}$/', $otp);
}
}

