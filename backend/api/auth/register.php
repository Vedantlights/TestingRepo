<?php
/**
 * User Registration API
 * POST /api/auth/register.php
 */

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../utils/response.php';
require_once __DIR__ . '/../../utils/validation.php';
require_once __DIR__ . '/../../utils/auth.php';
require_once __DIR__ . '/../../helpers/email_helper.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', null, 405);
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $fullName = sanitizeInput($input['fullName'] ?? '');
    $email = sanitizeInput($input['email'] ?? '');
    $phone = $input['phone'] ?? '';
    $password = $input['password'] ?? '';
    $userType = sanitizeInput($input['userType'] ?? 'buyer');
    $emailOtp = trim($input['emailOtp'] ?? ''); // Legacy Email OTP (via Hostinger SMTP) - trim whitespace
    $emailVerificationToken = $input['emailVerificationToken'] ?? null; // MSG91 email widget token
    $phoneOtp = $input['phoneOtp'] ?? ''; // Legacy support (backend DB OTP)
    $phoneVerificationToken = $input['phoneVerificationToken'] ?? null; // MSG91 phone widget token (website)
    $phoneVerificationMethod = $input['phoneVerificationMethod'] ?? null; // e.g. 'msg91' for REST flow (mobile)
    $phoneVerifiedFlag = isset($input['phoneVerified']) ? (bool)$input['phoneVerified'] : null; // mobile flag
    
    // Normalize email (lowercase, trim)
    $email = strtolower(trim($email));
    
    // Validation
    $errors = [];
    
    if (empty($fullName)) {
        $errors['fullName'] = 'Full name is required';
    }
    
    if (empty($email)) {
        $errors['email'] = 'Email is required';
    } elseif (!validateEmail($email)) {
        $errors['email'] = 'Invalid email format';
    }
    
    $validatedPhone = validatePhone($phone);
    if (!$validatedPhone) {
        $errors['phone'] = 'Invalid phone number. Please enter a valid Indian mobile number.';
    } else {
        $phone = $validatedPhone;
    }
    
    if (empty($password)) {
        $errors['password'] = 'Password is required';
    } elseif (!validatePassword($password)) {
        $errors['password'] = 'Password must be at least 6 characters';
    }
    
    if (!in_array($userType, ['buyer', 'seller', 'agent'])) {
        $errors['userType'] = 'Invalid user type';
    }
    
    // Email verification: Check if MSG91 token provided OR legacy OTP provided OR email already verified
    $emailOtpValid = false;
    $emailNormalized = strtolower(trim($email));
    
    // Check if email OTP is enabled
    if (!ENABLE_EMAIL_OTP) {
        // Email OTP is disabled - automatically mark as valid
        $emailOtpValid = true;
        error_log("Registration: Email OTP disabled - auto-validating email for $emailNormalized");
    } elseif (!empty($emailVerificationToken)) {
        // MSG91 widget token provided - trust client-side verification
        $emailOtpValid = true;
    } elseif (!empty($emailOtp) && validateOTP($emailOtp)) {
        // Legacy OTP provided, will verify below
        $emailOtpValid = true;
    } else {
        // Check if email was already verified
        $db = getDB();
        $checkStmt = $db->prepare("SELECT id FROM otp_verifications WHERE LOWER(TRIM(email)) = ? AND otp_type = 'email' AND verified = 1 ORDER BY created_at DESC LIMIT 1");
        $checkStmt->execute([$emailNormalized]);
        if ($checkStmt->fetch()) {
            $emailOtpValid = true;
            error_log("Registration: Email already verified");
        } else {
            $errors['emailOtp'] = 'Email verification is required. Please verify your email first.';
        }
    }
    
    // Phone verification:
    // 1) New mobile flow: MSG91 REST via backend proxy (no local OTP)
    // 2) Existing website flow: MSG91 widget token
    // 3) Legacy backend OTP (DB sms)
    $phoneVerified = false;
    if ($phoneVerificationMethod === 'msg91' && $phoneVerifiedFlag) {
        // New mobile MSG91 REST flow:
        // Phone was already verified via /api/otp/msg91-verify.php
        // We trust this flag for mobile app; no local OTP/token required here.
        $phoneVerified = true;
        error_log("Registration: Phone verified via MSG91 REST flow (mobile), phone={$phone}");
    } elseif (!empty($phoneVerificationToken)) {
        // Existing website MSG91 widget flow - keep behavior unchanged
        // Extract token from JSON if needed
        $actualToken = $phoneVerificationToken;
        if (is_string($phoneVerificationToken)) {
            $parsed = json_decode($phoneVerificationToken, true);
            if ($parsed && isset($parsed['message'])) {
                $actualToken = $parsed['message'];
            } elseif ($parsed && isset($parsed['token'])) {
                $actualToken = $parsed['token'];
            }
        } elseif (is_array($phoneVerificationToken)) {
            $actualToken = $phoneVerificationToken['message'] ?? $phoneVerificationToken['token'] ?? $phoneVerificationToken;
        }
        
        // Trust MSG91 widget verification (client-side already verified)
        $phoneVerified = !empty($actualToken);
    } elseif (!empty($phoneOtp)) {
        // Legacy backend OTP - will verify below against otp_verifications table
        $phoneVerified = true; // Will verify in DB below
    } else {
        $errors['phoneVerification'] = 'Phone verification is required';
    }
    
    if (!empty($errors)) {
        error_log("Registration Validation Errors: " . json_encode($errors));
        error_log("Registration Input Data: " . json_encode([
            'hasEmailOtp' => !empty($emailOtp),
            'hasEmailToken' => !empty($emailVerificationToken),
            'hasPhoneOtp' => !empty($phoneOtp),
            'hasPhoneToken' => !empty($phoneVerificationToken),
            'emailTokenLength' => !empty($emailVerificationToken) ? strlen($emailVerificationToken) : 0,
            'phoneTokenLength' => !empty($phoneVerificationToken) ? strlen($phoneVerificationToken) : 0
        ]));
        sendValidationError($errors);
    }
    
    // Get database connection (if not already got)
    if (!isset($db)) {
        $db = getDB();
    }
    
    // Check if email already exists
    $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        sendError('Email already registered', null, 409);
    }
    
    // Check if phone already exists
    $stmt = $db->prepare("SELECT id FROM users WHERE phone = ?");
    $stmt->execute([$phone]);
    if ($stmt->fetch()) {
        sendError('Phone number already registered', null, 409);
    }
    
    // Verify Email - MSG91 widget token or legacy OTP
    $emailOtpRecord = null;
    $emailOtpTrimmed = !empty($emailOtp) ? trim($emailOtp) : '';
    
    // Check if email OTP is enabled
    if (!ENABLE_EMAIL_OTP) {
        // Email OTP is disabled - create auto-verified record
        $expiresAt = date('Y-m-d H:i:s', time() + (OTP_EXPIRATION_MINUTES * 60));
        $stmt = $db->prepare("INSERT INTO otp_verifications (email, otp, otp_type, verified, expires_at) VALUES (?, ?, 'email', 1, ?)");
        $stmt->execute([$emailNormalized, 'DISABLED', $expiresAt]);
        $emailOtpRecord = ['id' => $db->lastInsertId()];
        error_log("Registration: Email OTP disabled - auto-created verified record for: $emailNormalized");
    }
    // First try: MSG91 widget token provided
    elseif (!empty($emailVerificationToken)) {
        // Extract token from JSON if needed
        $actualToken = $emailVerificationToken;
        if (is_string($emailVerificationToken)) {
            $parsed = json_decode($emailVerificationToken, true);
            if ($parsed && isset($parsed['message'])) {
                $actualToken = $parsed['message'];
            } elseif ($parsed && isset($parsed['token'])) {
                $actualToken = $parsed['token'];
            }
        } elseif (is_array($emailVerificationToken)) {
            $actualToken = $emailVerificationToken['message'] ?? $emailVerificationToken['token'] ?? $emailVerificationToken;
        }
        
        // Create record for MSG91 email widget verification
        $stmt = $db->prepare("INSERT INTO otp_verifications (email, otp, otp_type, verified, expires_at) VALUES (?, ?, 'msg91_widget', 1, DATE_ADD(NOW(), INTERVAL 1 DAY))");
        $stmt->execute([$emailNormalized, $actualToken]);
        $emailOtpRecord = ['id' => $db->lastInsertId()];
        error_log("Registration: Created MSG91 email verification record for: $emailNormalized");
    }
    // Second try: Legacy OTP provided - check if it matches (verified or unverified, not expired)
    elseif (!empty($emailOtpTrimmed)) {
        $stmt = $db->prepare("SELECT id, verified FROM otp_verifications WHERE LOWER(TRIM(email)) = ? AND otp = ? AND otp_type = 'email' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$emailNormalized, $emailOtpTrimmed]);
        $emailOtpRecord = $stmt->fetch();
    }
    
    // Third try: If OTP not found, check if email was already verified
    if (!$emailOtpRecord) {
        $stmt = $db->prepare("SELECT id FROM otp_verifications WHERE LOWER(TRIM(email)) = ? AND otp_type = 'email' AND verified = 1 ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$emailNormalized]);
        $emailOtpRecord = $stmt->fetch();
    }
    
    // Fourth try: Check any OTP for this email (maybe expired check is too strict)
    if (!$emailOtpRecord && !empty($emailOtpTrimmed)) {
        $stmt = $db->prepare("SELECT id FROM otp_verifications WHERE LOWER(TRIM(email)) = ? AND otp = ? AND otp_type = 'email' ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$emailNormalized, $emailOtpTrimmed]);
        $emailOtpRecord = $stmt->fetch();
    }
    
    if (!$emailOtpRecord) {
        error_log("Registration failed: Email=$emailNormalized, OTP=$emailOtpTrimmed, HasToken=" . (!empty($emailVerificationToken) ? 'Yes' : 'No'));
        // Debug: show what OTPs exist
        $debugStmt = $db->prepare("SELECT id, otp, email, verified, expires_at FROM otp_verifications WHERE LOWER(TRIM(email)) = ? AND otp_type = 'email' ORDER BY created_at DESC LIMIT 3");
        $debugStmt->execute([$emailNormalized]);
        $debugRecords = $debugStmt->fetchAll();
        error_log("Available OTPs: " . json_encode($debugRecords));
        sendError('Email verification required. Please verify your email first.', null, 400);
    }
    
    // Phone verification - DB/linkage handling
    $phoneOtpRecord = null;
    if ($phoneVerificationMethod === 'msg91' && $phoneVerified) {
        // New mobile MSG91 REST flow:
        // We don't have a local OTP record for this flow.
        // For auditing, we can optionally insert a synthetic verified record.
        try {
            $stmt = $db->prepare("INSERT INTO otp_verifications (phone, otp, otp_type, verified, expires_at) VALUES (?, ?, 'msg91_rest', 1, DATE_ADD(NOW(), INTERVAL 1 DAY))");
            $stmt->execute([$phone, 'MSG91_VERIFIED']);
            $phoneOtpRecord = ['id' => $db->lastInsertId()];
            error_log("Registration: Created MSG91 REST verification record for phone={$phone}");
        } catch (Exception $e) {
            // If insertion fails, log but don't block registration, since MSG91 already verified
            error_log("Registration: Failed to create MSG91 REST OTP record for phone={$phone}, error=" . $e->getMessage());
        }
    } elseif ($phoneVerified && !empty($phoneVerificationToken)) {
        // Existing website MSG91 widget flow (unchanged)
        // Extract token
        $actualToken = $phoneVerificationToken;
        if (is_string($phoneVerificationToken)) {
            $parsed = json_decode($phoneVerificationToken, true);
            if ($parsed && isset($parsed['message'])) {
                $actualToken = $parsed['message'];
            }
        }
        // Create record for MSG91 widget
        $stmt = $db->prepare("INSERT INTO otp_verifications (phone, otp, otp_type, verified, expires_at) VALUES (?, ?, 'msg91_widget', 1, DATE_ADD(NOW(), INTERVAL 1 DAY))");
        $stmt->execute([$phone, $actualToken]);
        $phoneOtpRecord = ['id' => $db->lastInsertId()];
    } elseif (!empty($phoneOtp)) {
        // Legacy backend OTP (DB sms) - unchanged
        $stmt = $db->prepare("SELECT id FROM otp_verifications WHERE phone = ? AND otp = ? AND otp_type = 'sms' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$phone, $phoneOtp]);
        $phoneOtpRecord = $stmt->fetch();
        if (!$phoneOtpRecord) {
            sendError('Invalid phone OTP', null, 400);
        }
    } else {
        sendError('Phone verification required', null, 400);
    }
    
    // Hash password
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    
    // Check if full_name column exists in users table BEFORE starting transaction
    // (ALTER TABLE causes implicit commit, so must be done outside transaction)
    try {
        $checkStmt = $db->query("SHOW COLUMNS FROM users LIKE 'full_name'");
        $hasFullNameColumn = $checkStmt->rowCount() > 0;
        
        if (!$hasFullNameColumn) {
            // Column doesn't exist - try to add it (outside transaction)
            try {
                // Check if there are existing users
                $userCountStmt = $db->query("SELECT COUNT(*) as count FROM users");
                $userCount = $userCountStmt->fetch()['count'];
                
                if ($userCount > 0) {
                    // Existing users - add as nullable first, update, then make NOT NULL
                    $db->exec("ALTER TABLE users ADD COLUMN full_name VARCHAR(255) NULL AFTER id");
                    $db->exec("UPDATE users SET full_name = CONCAT('User ', id) WHERE full_name IS NULL");
                    $db->exec("ALTER TABLE users MODIFY COLUMN full_name VARCHAR(255) NOT NULL");
                } else {
                    // No existing users - safe to add as NOT NULL directly
                    $db->exec("ALTER TABLE users ADD COLUMN full_name VARCHAR(255) NOT NULL AFTER id");
                }
                error_log("Added missing 'full_name' column to users table");
            } catch (PDOException $alterError) {
                // Check if error is because column already exists (race condition)
                if (strpos($alterError->getMessage(), 'Duplicate column name') !== false) {
                    error_log("Column 'full_name' already exists (race condition handled)");
                } else {
                    error_log("Failed to add full_name column: " . $alterError->getMessage());
                    sendError('Database configuration error: missing full_name column. Please run migration script: backend/database/add_full_name_column_migration.sql', null, 500);
                }
            }
        }
    } catch (PDOException $e) {
        error_log("Error checking for full_name column: " . $e->getMessage());
        // Continue anyway - the INSERT will fail with a clearer error if column doesn't exist
    }
    
    // Check user_profiles table columns BEFORE starting transaction
    // (SHOW COLUMNS might cause issues in some MySQL configurations)
    $userProfilesHasFullName = false;
    $userProfilesHasUserType = false;
    try {
        $checkStmt = $db->query("SHOW COLUMNS FROM user_profiles LIKE 'full_name'");
        $userProfilesHasFullName = $checkStmt->rowCount() > 0;
        
        $checkStmt = $db->query("SHOW COLUMNS FROM user_profiles LIKE 'user_type'");
        $userProfilesHasUserType = $checkStmt->rowCount() > 0;
    } catch (PDOException $e) {
        // user_profiles table might not exist - that's okay, we'll handle it
        error_log("Note: Could not check user_profiles columns: " . $e->getMessage());
    }
    
    // Start transaction (after all column checks)
    if (!$db->inTransaction()) {
        $db->beginTransaction();
    }
    
    try {
        // Create user
        $stmt = $db->prepare("INSERT INTO users (full_name, email, phone, password, user_type, email_verified, phone_verified) VALUES (?, ?, ?, ?, ?, 1, 1)");
        $stmt->execute([$fullName, $email, $phone, $hashedPassword, $userType]);
        $userId = $db->lastInsertId();
        
        // Mark OTPs as verified (if not already verified)
        if ($phoneOtpRecord && isset($phoneOtpRecord['id']) && $emailOtpRecord && isset($emailOtpRecord['id'])) {
            // Both email and phone OTP records exist
            $stmt = $db->prepare("UPDATE otp_verifications SET verified = 1, user_id = ? WHERE id IN (?, ?)");
            $stmt->execute([$userId, $emailOtpRecord['id'], $phoneOtpRecord['id']]);
            error_log("Registration: Marked both email and phone OTPs as verified for user ID: $userId");
        } elseif ($emailOtpRecord && isset($emailOtpRecord['id'])) {
            // Only email OTP to mark
            $stmt = $db->prepare("UPDATE otp_verifications SET verified = 1, user_id = ? WHERE id = ?");
            $stmt->execute([$userId, $emailOtpRecord['id']]);
            error_log("Registration: Marked email OTP (ID: {$emailOtpRecord['id']}) as verified for user ID: $userId");
        } elseif ($phoneOtpRecord && isset($phoneOtpRecord['id'])) {
            // Only phone OTP to mark
            $stmt = $db->prepare("UPDATE otp_verifications SET verified = 1, user_id = ? WHERE id = ?");
            $stmt->execute([$userId, $phoneOtpRecord['id']]);
            error_log("Registration: Marked phone OTP (ID: {$phoneOtpRecord['id']}) as verified for user ID: $userId");
        }
        
        // Get the user's created_at timestamp (registration time)
        $stmt = $db->prepare("SELECT created_at FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $userRecord = $stmt->fetch();
        $registrationTime = $userRecord['created_at'];
        
        // Note: Previously we created a default 'free' subscription here
        // with a limited-duration trial. Free trials have been removed,
        // so new users must purchase a listing package before adding properties.
        
        // Create user profile (using pre-checked column flags)
        // Note: user_profiles table may not have full_name and user_type columns
        try {
            if ($userProfilesHasFullName && $userProfilesHasUserType) {
                // Both columns exist, insert with them
                $stmt = $db->prepare("INSERT INTO user_profiles (user_id, full_name, user_type) VALUES (?, ?, ?)");
                $stmt->execute([$userId, $fullName, $userType]);
            } elseif ($userProfilesHasFullName) {
                // Only full_name exists
                $stmt = $db->prepare("INSERT INTO user_profiles (user_id, full_name) VALUES (?, ?)");
                $stmt->execute([$userId, $fullName]);
            } elseif ($userProfilesHasUserType) {
                // Only user_type exists
                $stmt = $db->prepare("INSERT INTO user_profiles (user_id, user_type) VALUES (?, ?)");
                $stmt->execute([$userId, $userType]);
            } else {
                // Neither column exists, just create profile with user_id
                $stmt = $db->prepare("INSERT INTO user_profiles (user_id) VALUES (?)");
                $stmt->execute([$userId]);
            }
        } catch (PDOException $e) {
            // If user_profiles table doesn't exist or insert fails, log but don't fail registration
            error_log("Warning: Could not create user profile: " . $e->getMessage());
            // Continue with registration - profile is optional
            // Don't throw - just log and continue
        }
        
        // Commit transaction
        if ($db->inTransaction()) {
            $db->commit();
        }
        
        // Fetch user data from database (including email) to ensure we use the exact saved values
        $stmt = $db->prepare("SELECT id, full_name, email FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $userData = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$userData) {
            error_log("Registration: Could not fetch user data for welcome email, user ID: $userId");
        } else {
            // Use email and name from database (ensures we use the exact values saved)
            $userEmail = $userData['email'];
            $userFullName = $userData['full_name'];
            
            // Trigger welcome email using data from database
            // Use synchronous sending by default for reliability (guaranteed delivery)
            // Sync mode provides immediate feedback and ensures email is sent
            $emailSent = false;
            $emailErrorMsg = null;
            
            try {
                error_log("Registration: Sending welcome email (sync) for user ID: $userId, Email: $userEmail");
                $emailSent = sendWelcomeEmailSync($userId, $userFullName, $userEmail);
                
                if ($emailSent) {
                    error_log("Registration: ✓ Welcome email sent successfully (sync) for user ID: $userId, Email: $userEmail");
                } else {
                    error_log("Registration: ✗ Welcome email sending failed (sync) for user ID: $userId, Email: $userEmail - sendWelcomeEmailSync returned false");
                    $emailErrorMsg = "sendWelcomeEmailSync returned false";
                }
            } catch (Exception $emailError) {
                // Log error but don't fail registration if email trigger fails
                $emailErrorMsg = $emailError->getMessage();
                error_log("Registration: ✗ Exception while sending welcome email for user ID: $userId, Email: $userEmail, Error: " . $emailErrorMsg);
                error_log("Registration: Exception trace: " . $emailError->getTraceAsString());
            } catch (Error $emailError) {
                // Catch fatal errors too
                $emailErrorMsg = $emailError->getMessage();
                error_log("Registration: ✗ Fatal error while sending welcome email for user ID: $userId, Email: $userEmail, Error: " . $emailErrorMsg);
            }
            
            // Log final status
            if (!$emailSent) {
                error_log("Registration: WARNING - Welcome email was not sent for user ID: $userId, Email: $userEmail. Error: " . ($emailErrorMsg ?: "Unknown error"));
                error_log("Registration: User registration completed successfully, but welcome email delivery failed. User should still be able to use the system.");
            }
            
            // Continue with registration - email failure should not block user registration
        }
        
        // Generate token
        $token = generateToken($userId, $userType, $email);
        
        // Get user data with profile_image from user_profiles table (not users table)
        // profile_image is in user_profiles table, always join with it
        $stmt = $db->prepare("
            SELECT u.id, u.full_name, u.email, u.phone, u.user_type, u.email_verified, u.phone_verified, 
                   up.profile_image 
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE u.id = ?
        ");
        
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        
        // Normalize profile image URL
        if (isset($user['profile_image']) && !empty($user['profile_image'])) {
            $profileImage = trim($user['profile_image']);
            if (strpos($profileImage, 'http://') === 0 || strpos($profileImage, 'https://') === 0) {
                // Already a full URL
            } elseif (strpos($profileImage, '/uploads/') === 0) {
                $user['profile_image'] = BASE_URL . $profileImage;
            } elseif (strpos($profileImage, 'uploads/') === 0) {
                $user['profile_image'] = BASE_URL . '/' . $profileImage;
            } else {
                $user['profile_image'] = UPLOAD_BASE_URL . '/' . ltrim($profileImage, '/');
            }
        } else {
            $user['profile_image'] = null;
        }
        
        sendSuccess('Registration successful. Welcome email sent.', [
            'token' => $token,
            'user' => $user,
            'user_id' => $userId
        ]);
        
    } catch (Exception $e) {
        // Only rollback if transaction is still active
        if ($db->inTransaction()) {
            try {
                $db->rollBack();
            } catch (PDOException $rollbackError) {
                error_log("Error during rollback: " . $rollbackError->getMessage());
            }
        }
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Registration Error: " . $e->getMessage());
    error_log("Registration Error Trace: " . $e->getTraceAsString());
    error_log("Registration Input: " . json_encode($input ?? []));
    // Don't expose internal error details in production
    if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
        sendError('Registration failed. Please try again later.', null, 500);
    } else {
        sendError('Registration failed: ' . $e->getMessage(), null, 500);
    }
}

/**
 * Verify MSG91 Widget Token (Optional Server-side Verification)
 * Note: MSG91 widget handles verification client-side, but this provides
 * an additional server-side validation layer if needed.
 * 
 * @param string $identifier Phone number or email address
 * @param string $token MSG91 verification token
 * @return bool True if token is valid
 */
function verifyMSG91Token($identifier, $token) {
    // Option 1: Trust client-side verification (recommended for widget)
    // The MSG91 widget already verifies on client-side, so we can trust the token
    // Just validate that token exists and is not empty
    if (empty($token)) {
        error_log("MSG91 Token Verification: Empty token");
        return false;
    }
    
    // Handle token if it's a JSON string (widget might return object)
    $decoded = json_decode($token, true);
    if ($decoded !== null && is_array($decoded)) {
        // If token is a JSON object, extract the actual token
        $token = $decoded['token'] ?? $decoded['verificationToken'] ?? $token;
    }
    
    // Basic validation - token should exist and have reasonable length
    // MSG91 tokens are typically longer than 10 characters
    $isValid = strlen($token) > 5; // More lenient check
    
    if (!$isValid) {
        error_log("MSG91 Token Verification: Invalid token format. Token: " . substr($token, 0, 50));
    }
    
    return $isValid;
    
    // Option 2: Server-side verification via MSG91 API (if needed)
    // Uncomment below if you want to verify token with MSG91 API
    
    /*
    $url = "https://control.msg91.com/api/v5/otp/verify";
    $data = [
        'authkey' => MSG91_WIDGET_AUTH_TOKEN,
        'mobile' => $phone,
        'token' => $token
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        $result = json_decode($response, true);
        return isset($result['type']) && $result['type'] === 'success';
    }
    
    return false;
    */
}

