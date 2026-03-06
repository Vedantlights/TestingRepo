/**
 * API Service
 * Handles all HTTP requests to the backend
 */

import { API_BASE_URL, API_ENDPOINTS } from '../config/api.config';

// Token management
const getToken = () => localStorage.getItem('authToken');
const setToken = (token) => localStorage.setItem('authToken', token);
const removeToken = () => localStorage.removeItem('authToken');

// User data management
const getUser = () => {
  const user = localStorage.getItem('userData');
  return user ? JSON.parse(user) : null;
};
const setUser = (user) => localStorage.setItem('userData', JSON.stringify(user));
const removeUser = () => localStorage.removeItem('userData');

// Generic fetch wrapper
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getToken();
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }
  
  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };
  
  try {
    const response = await fetch(url, config);
    
    // Get response text first to check if it's empty
    const responseText = await response.text();
    
    // Check if response is empty
    if (!responseText || responseText.trim() === '') {
      console.error('Empty response from server:', url);
      throw {
        status: response.status || 500,
        message: 'Empty response from server. The API may have encountered an error.',
        errors: null,
      };
    }
    
    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Response text:', responseText.substring(0, 500));
        throw {
          status: response.status || 500,
          message: 'Invalid JSON response from server. Response: ' + responseText.substring(0, 200),
          errors: null,
          rawResponse: responseText.substring(0, 500)
        };
      }
    } else {
      // Not JSON - might be HTML error page or plain text
      console.error('Non-JSON response:', responseText.substring(0, 500));
      throw {
        status: response.status || 500,
        message: responseText.substring(0, 200) || 'Invalid response from server',
        errors: null,
        rawResponse: responseText.substring(0, 500)
      };
    }
    
    if (!response.ok) {
      // Include more details in error for debugging
      // Note: 401 handling is done in AuthContext, not here
      const errorDetails = {
        status: response.status,
        message: data.message || 'Request failed',
        errors: data.errors || null,
        data: data // Include full response for debugging
      };
      throw errorDetails;
    }
    
    return data;
  } catch (error) {
    if (error.status) {
      // Don't override error messages from backend - they're more specific
      // Only add generic messages if backend didn't provide one
      if (!error.message || error.message === 'Request failed') {
        if (error.status === 401) {
          error.message = 'Authentication required. Please log in to add properties.';
        } else if (error.status === 403) {
          error.message = 'Access denied. You do not have permission to perform this action.';
        }
      }
      throw error;
    }
    // Handle network errors or JSON parse errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw {
        status: 0,
        message: 'Network error. Please check your connection and ensure the backend server is running.',
      };
    }
    // JSON parse error or other error
    throw {
      status: 0,
      message: error.message || 'Network error. Please check your connection and ensure the backend server is running.',
      originalError: error.message
    };
  }
};

// =====================
// AUTH API
// =====================
export const authAPI = {
  login: async (emailOrPhone, password, userType) => {
    console.log("authAPI.login called:", { emailOrPhone, userType });
    try {
      const response = await apiRequest(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        body: JSON.stringify({ emailOrPhone, email: emailOrPhone, password, userType }),
      });
      
      console.log("authAPI.login response:", response);
      
      return response;
    } catch (error) {
      console.error("authAPI.login error:", error);
      throw error;
    }
  },

  loginOtpSend: async (phone) => {
    const response = await apiRequest(API_ENDPOINTS.LOGIN_OTP_SEND, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
    return response;
  },

  loginOtpVerify: async (phone, otp, userType, requestId) => {
    const body = { phone, otp, userType };
    if (requestId) body.requestId = requestId;
    const response = await apiRequest(API_ENDPOINTS.LOGIN_OTP_VERIFY, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return response;
  },
  
  register: async (userData) => {
    const response = await apiRequest(API_ENDPOINTS.REGISTER, {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    
    // Return response only - AuthContext will handle saving to localStorage if needed
    return response;
  },

  loginWithGoogle: async (credential, userType) => {
    const response = await apiRequest(API_ENDPOINTS.LOGIN_GOOGLE, {
      method: 'POST',
      body: JSON.stringify({ credential, userType }),
    });
    return response;
  },

  addPhone: async (phone, phoneVerificationToken) => {
    const response = await apiRequest(API_ENDPOINTS.ADD_PHONE, {
      method: 'POST',
      body: JSON.stringify({ phone, phoneVerificationToken }),
    });
    return response;
  },
  
  verifyToken: async () => {
    const token = getToken();
    if (!token) {
      return { success: false, message: 'No token' };
    }
    
    try {
      // Backend expects GET request with token in Authorization header
      const response = await apiRequest(API_ENDPOINTS.VERIFY_TOKEN, {
        method: 'GET'
      });
      // Return response only - AuthContext will handle updating localStorage
      return response;
    } catch (error) {
      // Just throw the error - AuthContext will handle clearing localStorage
      throw error;
    }
  },
  
  switchRole: async (targetRole) => {
    try {
      const response = await apiRequest(API_ENDPOINTS.SWITCH_ROLE, {
        method: 'POST',
        body: JSON.stringify({ targetRole }),
      });
      
      // Return response only - AuthContext will handle updating localStorage
      return response;
    } catch (error) {
      console.error("authAPI.switchRole error:", error);
      throw error;
    }
  },
  
  logout: () => {
    removeToken();
    removeUser();
    localStorage.removeItem('currentSession');
    localStorage.removeItem('registeredUser');
  },
  
  getToken,
  getUser,
  setToken, // Export setToken for AuthContext
  setUser,  // Export setUser for AuthContext
  isAuthenticated: () => !!getToken(),
};

// =====================
// SELLER PROPERTIES API
// =====================
export const sellerPropertiesAPI = {
  list: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`${API_ENDPOINTS.SELLER_PROPERTIES}?${queryString}`);
  },
  
  add: async (propertyData) => {
    return apiRequest(API_ENDPOINTS.SELLER_ADD_PROPERTY, {
      method: 'POST',
      body: JSON.stringify(propertyData),
    });
  },
  
  update: async (id, propertyData) => {
    return apiRequest(`${API_ENDPOINTS.SELLER_UPDATE_PROPERTY}?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(propertyData),
    });
  },
  
  delete: async (id) => {
    return apiRequest(`${API_ENDPOINTS.SELLER_DELETE_PROPERTY}?id=${id}`, {
      method: 'DELETE',
    });
  },
  
  activate: async (propertyId) => {
    return apiRequest(API_ENDPOINTS.SELLER_ACTIVATE_PROPERTY, {
      method: 'POST',
      body: JSON.stringify({ property_id: propertyId }),
    });
  },
  
  // CRITICAL FIX: Upload image through MODERATION endpoint
  // Now supports Firebase Storage upload
  uploadImage: async (file, propertyId = 0, useFirebase = true) => {
    if (!propertyId || propertyId <= 0) {
      throw {
        status: 400,
        message: 'Property ID is required for image upload',
        errors: ['Property ID is required'],
      };
    }
    
    // Import Firebase upload function dynamically to avoid circular dependencies
    let firebaseUrl = null;
    if (useFirebase) {
      try {
        const { uploadPropertyImageToFirebase } = await import('./firebase.service');
        
        // Get user from localStorage first
        let user = getUser(); // This uses 'userData' key correctly
        let userId = user?.id;
        
        // DEBUG: Log user object structure
        console.log('🔍 User object check:', {
          userExists: !!user,
          userId: userId,
          userType: typeof user,
          userKeys: user ? Object.keys(user) : [],
          fullUser: user
        });
        
        // FALLBACK: If user not in localStorage, fetch from backend
        if (!userId) {
          console.warn('⚠️ User ID not in localStorage, fetching from backend...');
          try {
            const token = getToken();
            if (token) {
              // Fetch user data from backend using verifyToken
              const verifyResponse = await authAPI.verifyToken();
              console.log('🔍 Verify token response:', verifyResponse);
              
              if (verifyResponse.success && verifyResponse.data?.user) {
                user = verifyResponse.data.user;
                userId = user.id || user.user_id; // Try both 'id' and 'user_id'
                
                // Save to localStorage for future use
                if (user) {
                  setUser(user);
                  console.log('✅ User saved to localStorage');
                }
                console.log('✅ User ID fetched from backend:', userId);
              } else {
                console.warn('⚠️ Failed to get user from backend verify response');
                console.warn('Response structure:', {
                  success: verifyResponse.success,
                  hasData: !!verifyResponse.data,
                  hasUser: !!verifyResponse.data?.user,
                  dataKeys: verifyResponse.data ? Object.keys(verifyResponse.data) : []
                });
              }
            } else {
              console.warn('⚠️ No token found, cannot fetch user from backend');
            }
          } catch (verifyError) {
            console.error('❌ Failed to fetch user from backend:', verifyError);
          }
        }
        
        // Final check - try alternative field names
        if (!userId && user) {
          userId = user.user_id || user.id || user.ID;
          if (userId) {
            console.log('✅ Found user ID using alternative field:', userId);
          }
        }
        
        if (!userId) {
          console.warn('⚠️ User ID not found, falling back to server upload');
          console.warn('User object:', user); // Debug log to see what we got
          console.warn('Available user fields:', user ? Object.keys(user) : 'null');
          useFirebase = false;
        } else {
          console.log('✅ User ID found, uploading to Firebase:', userId);
          console.log('📤 Upload details:', {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            userId,
            propertyId
          });
          
          // Step 1: Upload to Firebase Storage first
          try {
            const firebaseResult = await uploadPropertyImageToFirebase(
              file,
              userId,
              propertyId
            );
            firebaseUrl = firebaseResult.url;
            console.log('✅ Image uploaded to Firebase successfully!');
            console.log('📎 Firebase URL:', firebaseUrl);
            console.log('📎 Storage path:', firebaseResult.path);
          } catch (uploadError) {
            console.error('❌ Firebase upload error in uploadImage:', uploadError);
            throw uploadError; // Re-throw to be caught by outer catch
          }
        }
      } catch (firebaseError) {
        console.error('❌ Firebase upload failed, falling back to server upload:', firebaseError);
        console.error('Firebase error details:', firebaseError.message, firebaseError.stack);
        useFirebase = false; // Fallback to server upload
      }
    }
    
    // Step 2: Send to backend for moderation
    const formData = new FormData();
    
    if (useFirebase && firebaseUrl) {
      // Send Firebase URL for moderation (backend will download and moderate)
      formData.append('firebase_url', firebaseUrl);
      formData.append('property_id', propertyId.toString());
    } else {
      // Fallback: Upload file directly to server
      formData.append('image', file);  // CRITICAL: Field name must be 'image' not 'file'
      formData.append('property_id', propertyId.toString());
    }
    
    // Use MODERATION endpoint, not the old upload endpoint
    const url = `${API_BASE_URL}${API_ENDPOINTS.MODERATE_AND_UPLOAD}`;
    const token = getToken();
    
    // DEBUG: Log request details
    console.log('🔵 Image Upload Request:', {
      url,
      method: 'POST',
      hasFormData: !!formData,
      formDataKeys: formData ? Array.from(formData.keys()) : [],
      hasToken: !!token,
      useFirebase: useFirebase,
      hasFirebaseUrl: !!firebaseUrl,
      firebaseUrl: firebaseUrl ? firebaseUrl.substring(0, 100) + '...' : null,
      formDataEntries: formData ? Array.from(formData.entries()).map(([k, v]) => [k, v instanceof File ? `File: ${v.name}` : v]) : []
    });
    
    try {
      // CRITICAL: Ensure POST method is used and FormData is sent correctly
      // Do NOT set Content-Type header - browser sets it automatically with boundary for FormData
      const fetchOptions = {
        method: 'POST', // Explicitly set POST method - CRITICAL
        headers: {
          'Authorization': `Bearer ${token}`,
          // DO NOT set Content-Type - browser will set it automatically with boundary
        },
        body: formData, // FormData will set proper Content-Type with boundary
        // Use 'error' to fail on redirects (prevents silent POST->GET conversion)
        redirect: 'error', // Fail on redirects to prevent POST->GET conversion
      };
      
      console.log('🔵 Fetch options:', {
        method: fetchOptions.method,
        hasBody: !!fetchOptions.body,
        redirect: fetchOptions.redirect,
        url: url
      });
      
      let response;
      try {
        // Use XMLHttpRequest as fallback if fetch has issues with POST
        // This ensures POST method is preserved
        response = await fetch(url, fetchOptions);
      } catch (fetchError) {
        // If redirect error, log it
        if (fetchError.message && fetchError.message.includes('redirect')) {
          console.error('❌ Redirect detected - this may be converting POST to GET');
          console.error('Redirect error:', fetchError);
          throw {
            status: 500,
            message: 'Server redirect detected. This may be converting POST to GET. Please check server configuration.',
            error_code: 'redirect_detected',
            originalError: fetchError.message
          };
        }
        throw fetchError;
      }
      
      // Log response details for debugging
      console.log('🔵 Response received:', {
        status: response.status,
        statusText: response.statusText,
        type: response.type,
        ok: response.ok,
        url: response.url,
        redirected: response.redirected
      });
      
      // Check if we got a "Method not allowed" error - this means POST was converted to GET
      if (!response.ok && response.status === 405) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText };
        }
        
        if (errorData.error_code === 'method_not_allowed' && errorData.received_method === 'GET') {
          console.error('❌ CRITICAL: POST request was converted to GET by server!');
          console.error('This is a server configuration issue. The server is converting POST to GET.');
          throw {
            status: 500,
            message: 'Server configuration error: POST requests are being converted to GET. This is a server-side issue that needs to be fixed by your hosting provider.',
            error_code: 'post_to_get_conversion',
            details: errorData,
            solution: 'Contact your hosting provider (Hostinger) to fix the server configuration that is converting POST requests to GET. This is typically caused by redirects or proxy settings.'
          };
        }
      }
      
      // Handle redirects manually to preserve POST method
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        console.warn('⚠️ Redirect detected - this may cause POST to GET conversion');
        // If redirect, try again with the new location
        const location = response.headers.get('Location');
        if (location) {
          console.log('🔄 Following redirect to:', location);
          // Retry with full URL if relative
          const redirectUrl = location.startsWith('http') ? location : `${API_BASE_URL}${location}`;
          return await fetch(redirectUrl, fetchOptions);
        }
      }
      
      // Get response text first
      const responseText = await response.text();
      
      // Check if response is empty
      if (!responseText || responseText.trim() === '') {
        throw {
          status: response.status || 500,
          message: 'Empty response from server. The upload may have failed.',
          errors: null,
        };
      }
      
      // Parse JSON response
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Response text:', responseText.substring(0, 500));
        throw {
          status: response.status || 500,
          message: 'Invalid JSON response from server',
          errors: null,
          rawResponse: responseText.substring(0, 500)
        };
      }
      
      // Handle HTTP error status codes
      if (!response.ok) {
        console.error('Image upload HTTP error:', response.status, responseText);
        throw {
          status: response.status,
          message: data.message || `Server error (${response.status})`,
          errors: data.errors || null,
          data: data,
          rawResponse: responseText
        };
      }
      
      // CRITICAL: Handle moderation_status explicitly - never default to 'SAFE'
      // Backend returns: { status: "success", data: { moderation_status: "PENDING" | "NEEDS_REVIEW" | "SAFE" } }
      // DEBUG: Log full response to see structure
      console.log('🔍 Backend response structure:', {
        status: data.status,
        hasData: !!data.data,
        dataKeys: data.data ? Object.keys(data.data) : [],
        moderationStatus: data.data?.moderation_status,
        fullData: data.data
      });
      
      const moderationStatus = data.data?.moderation_status;
      
      // Handle different response statuses from moderation endpoint
      if (data.status === 'success') {
        // Check moderation_status explicitly - only return approved if it's "SAFE"
        if (moderationStatus === 'SAFE') {
          // APPROVED - Image passed moderation
          // Use Firebase URL if available, otherwise server URL
          const imageUrl = (useFirebase && firebaseUrl) 
            ? firebaseUrl 
            : (data.data?.image_url || data.data?.url);
          
          return {
            success: true,
            data: {
              url: imageUrl,
              image_id: data.data?.image_id,
              filename: data.data?.filename,
              moderation_status: 'SAFE', // Explicitly set, never default
              storage_type: (useFirebase && firebaseUrl) ? 'firebase' : 'server'
            },
            message: data.message || 'Image uploaded successfully',
          };
        } 
        // PENDING or NEEDS_REVIEW - Image under review, NOT approved
        else if (moderationStatus === 'PENDING' || moderationStatus === 'NEEDS_REVIEW') {
          // Use Firebase URL if available, otherwise server URL
          const imageUrl = (useFirebase && firebaseUrl) 
            ? firebaseUrl 
            : (data.data?.image_url || null);
          
          return {
            success: true,
            pending: true, // Mark as pending
            data: {
              url: imageUrl,
              image_id: data.data?.image_id,
              filename: data.data?.filename,
              moderation_status: moderationStatus, // Preserve exact status
              moderation_reason: data.data?.moderation_reason || data.message,
              storage_type: (useFirebase && firebaseUrl) ? 'firebase' : 'server'
            },
            message: data.message || 'Image is under review',
          };
        }
        // If moderation_status is missing, treat as pending (backward compatibility)
        else {
          console.warn('Response missing moderation_status, treating as pending review');
          return {
            success: true,
            pending: true,
            data: {
              url: data.data?.image_url || null,
              image_id: data.data?.image_id,
              filename: data.data?.filename,
              moderation_status: 'PENDING', // Default to PENDING, never SAFE
              moderation_reason: 'Moderation status not provided'
            },
            message: data.message || 'Image is under review',
          };
        }
      } else if (data.status === 'pending_review') {
        // NEEDS_REVIEW - Image under review
        return {
          success: true,
          pending: true,
          data: {
            url: data.data?.image_url || null,
            image_id: data.data?.image_id,
            moderation_status: moderationStatus || 'NEEDS_REVIEW', // Preserve exact status
            moderation_reason: data.data?.moderation_reason || data.message
          },
          message: data.message || 'Image is under review',
        };
      } else if (data.status === 'error') {
        // REJECTED - Image failed moderation
        // CRITICAL: Return the specific error message from API
        throw {
          status: response.status || 400,
          message: data.message || 'Image was rejected',
          error_code: data.error_code || 'rejected',
          details: data.details || {},
          rejected: true,
          data: data
        };
      } else {
        // Unknown status
        throw {
          status: response.status || 500,
          message: data.message || 'Upload failed',
          errors: data.errors || null,
          data: data
        };
      }
    } catch (error) {
      if (error.status) {
        throw error;
      }
      // Handle network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw {
          status: 0,
          message: 'Network error. Please check your connection and ensure the backend server is running.',
        };
      }
      throw {
        status: 0,
        message: error.message || 'Unknown error occurred',
      };
    }
  },
  
  // Upload video file
  uploadVideo: async (file, propertyId = 0) => {
    if (!propertyId || propertyId <= 0) {
      throw {
        status: 400,
        message: 'Property ID is required for video upload',
        errors: ['Property ID is required'],
      };
    }
    
    const formData = new FormData();
    formData.append('file', file);  // Field name must be 'file' for property-files endpoint
    formData.append('file_type', 'video');
    formData.append('property_id', propertyId);
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.UPLOAD_PROPERTY_FILES}`;
    const token = getToken();
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      const responseText = await response.text();
      
      if (!responseText || responseText.trim() === '') {
        throw {
          status: response.status || 500,
          message: 'Empty response from server. The upload may have failed.',
          errors: null,
        };
      }
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Response text:', responseText.substring(0, 500));
        throw {
          status: response.status || 500,
          message: 'Invalid JSON response from server',
          errors: null,
          rawResponse: responseText.substring(0, 500)
        };
      }
      
      if (!response.ok) {
        console.error('Video upload HTTP error:', response.status, responseText);
        throw {
          status: response.status,
          message: data.message || `Server error (${response.status})`,
          errors: data.errors || null,
          data: data,
          rawResponse: responseText
        };
      }
      
      if (data.status === 'success') {
        return {
          success: true,
          data: {
            url: data.data?.url,
            filename: data.data?.filename,
          },
          message: data.message || 'Video uploaded successfully',
        };
      } else {
        throw {
          status: response.status || 500,
          message: data.message || 'Video upload failed',
          errors: data.errors || null,
          data: data
        };
      }
    } catch (error) {
      if (error.status) {
        throw error;
      }
      // Handle network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw {
          status: 0,
          message: 'Network error. Please check your connection and ensure the backend server is running.',
        };
      }
      throw {
        status: 0,
        message: error.message || 'Unknown error occurred',
      };
    }
  },
};

// =====================
// SELLER DASHBOARD API
// =====================
export const sellerDashboardAPI = {
  getStats: async () => {
    return apiRequest(API_ENDPOINTS.SELLER_STATS);
  },
};

// =====================
// PLANS API
// =====================
export const plansAPI = {
  list: async () => {
    return apiRequest(API_ENDPOINTS.PAYMENT_PLANS, { method: 'GET' });
  },
};

// =====================
// SELLER SUBSCRIPTION API
// =====================
export const sellerSubscriptionAPI = {
  getHistory: async () => {
    return apiRequest(API_ENDPOINTS.SELLER_SUBSCRIPTION_HISTORY, { method: 'GET' });
  },
};

// =====================
// PAYMENT API (Razorpay)
// =====================
export const paymentAPI = {
  createOrder: async (planId) => {
    return apiRequest(API_ENDPOINTS.PAYMENT_CREATE_ORDER, {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId }),
    });
  },
  verify: async (razorpayOrderId, razorpayPaymentId, razorpaySignature, planId) => {
    return apiRequest(API_ENDPOINTS.PAYMENT_VERIFY, {
      method: 'POST',
      body: JSON.stringify({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
        plan_id: planId,
      }),
    });
  },
};

// =====================
// SELLER INQUIRIES API
// =====================
export const sellerInquiriesAPI = {
  list: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`${API_ENDPOINTS.SELLER_INQUIRIES}?${queryString}`);
  },
  
  updateStatus: async (id, status) => {
    return apiRequest(`${API_ENDPOINTS.SELLER_UPDATE_INQUIRY}?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },
  
  getBuyer: async (buyerId) => {
    return apiRequest(`${API_ENDPOINTS.SELLER_GET_BUYER}?id=${buyerId}`);
  },
};

// =====================
// SELLER LEADS API
// =====================
export const sellerLeadsAPI = {
  list: async () => {
    return apiRequest(API_ENDPOINTS.SELLER_LEADS);
  },
};

// =====================
// SELLER PROFILE API
// =====================
export const sellerProfileAPI = {
  get: async () => {
    return apiRequest(API_ENDPOINTS.SELLER_PROFILE);
  },
  
  update: async (profileData) => {
    return apiRequest(API_ENDPOINTS.SELLER_UPDATE_PROFILE, {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  },
  
  uploadProfileImage: async (file, useFirebase = true) => {
    const url = `${API_BASE_URL}${API_ENDPOINTS.UPLOAD_PROFILE_IMAGE}`;
    const token = getToken();
    const formData = new FormData();
    let firebaseUrl = null;
    
    if (useFirebase) {
      try {
        // Lazy import to avoid circular deps
        const { uploadProfileImageToFirebase } = await import('./firebase.service');
        
        // Get user from localStorage first
        let user = getUser();
        let userId = user?.id;
        
        // Fallback: fetch from backend if not in localStorage
        if (!userId) {
          console.warn('⚠️ User ID not in localStorage for profile upload, fetching from backend...');
          try {
            const verifyResponse = await authAPI.verifyToken();
            if (verifyResponse.success && verifyResponse.data?.user) {
              user = verifyResponse.data.user;
              userId = user.id || user.user_id;
              if (user) {
                setUser(user);
              }
              console.log('✅ User ID fetched from backend for profile upload:', userId);
            } else {
              console.warn('⚠️ Failed to get user from backend verify response for profile upload');
            }
          } catch (verifyError) {
            console.error('❌ Failed to fetch user from backend for profile upload:', verifyError);
          }
        }
        
        // Final fallback on alternative field names
        if (!userId && user) {
          userId = user.user_id || user.id || user.ID;
        }
        
        if (!userId) {
          console.warn('⚠️ User ID not found for profile upload, falling back to server upload');
          useFirebase = false;
        } else {
          console.log('✅ User ID found, uploading profile image to Firebase:', userId);
          const firebaseResult = await uploadProfileImageToFirebase(file, userId);
          firebaseUrl = firebaseResult.url;
          console.log('✅ Profile image uploaded to Firebase. URL:', firebaseUrl);
        }
      } catch (firebaseError) {
        console.error('❌ Firebase profile upload failed, falling back to server upload:', firebaseError);
        useFirebase = false;
      }
    }
    
    // Build FormData based on whether Firebase was used
    if (useFirebase && firebaseUrl) {
      formData.append('firebase_url', firebaseUrl);
    } else {
      formData.append('file', file);
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      const responseText = await response.text();
      
      if (!responseText || responseText.trim() === '') {
        throw {
          status: response.status || 500,
          message: 'Empty response from server. The upload may have failed.',
          errors: null,
        };
      }
      
      const contentType = response.headers.get('content-type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('JSON parse error (profile image):', parseError);
          console.error('Response text:', responseText.substring(0, 500));
          throw {
            status: response.status || 500,
            message: 'Invalid JSON response from server. Response: ' + responseText.substring(0, 200),
            errors: null,
            rawResponse: responseText.substring(0, 500)
          };
        }
      } else {
        console.error('Non-JSON response (profile image):', responseText.substring(0, 500));
        throw {
          status: response.status || 500,
          message: responseText.substring(0, 200) || 'Invalid response from server',
          errors: null,
          rawResponse: responseText.substring(0, 500)
        };
      }
      
      if (!response.ok) {
        throw {
          status: response.status,
          message: data.message || 'Upload failed',
          errors: data.errors || null,
          data: data
        };
      }
      
      return data;
    } catch (error) {
      if (error.status) {
        throw error;
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw {
          status: 0,
          message: 'Network error. Please check your connection and ensure the backend server is running.',
        };
      }
      throw {
        status: 0,
        message: error.message || 'Upload failed. Please try again.',
        originalError: error.message
      };
    }
  },
};

// =====================
// BUYER PROPERTIES API
// =====================
export const propertiesAPI = {
  list: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`${API_ENDPOINTS.PROPERTIES}?${queryString}`);
  },
  
  getDetails: async (id) => {
    return apiRequest(`${API_ENDPOINTS.PROPERTY_DETAILS}?id=${id}`);
  },
  
  sendInquiry: async (inquiryData) => {
    return apiRequest(API_ENDPOINTS.SEND_INQUIRY, {
      method: 'POST',
      body: JSON.stringify(inquiryData),
    });
  },
};

// =====================
// BUYER PROFILE API
// =====================
export const buyerProfileAPI = {
  get: async () => {
    return apiRequest(API_ENDPOINTS.BUYER_PROFILE);
  },
  
  update: async (profileData) => {
    return apiRequest(API_ENDPOINTS.BUYER_UPDATE_PROFILE, {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  },
};

// =====================
// FAVORITES API
// =====================
export const favoritesAPI = {
  toggle: async (propertyId) => {
    return apiRequest(API_ENDPOINTS.TOGGLE_FAVORITE, {
      method: 'POST',
      body: JSON.stringify({ property_id: propertyId }),
    });
  },
  
  list: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`${API_ENDPOINTS.FAVORITES_LIST}?${queryString}`);
  },
};

// =====================
// HISTORY API
// =====================
export const historyAPI = {
  add: async (propertyId, actionType = 'viewed_owner_details') => {
    return apiRequest(API_ENDPOINTS.HISTORY_ADD, {
      method: 'POST',
      body: JSON.stringify({ 
        property_id: propertyId,
        action_type: actionType 
      }),
    });
  },
  
  list: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`${API_ENDPOINTS.HISTORY_LIST}?${queryString}`);
  },
};

// =====================
// CHAT API
// =====================
export const chatAPI = {
  createRoom: async (receiverId, propertyId) => {
    return apiRequest(API_ENDPOINTS.CHAT_CREATE_ROOM, {
      method: 'POST',
      body: JSON.stringify({ receiverId, propertyId }),
    });
  },
  
  listRooms: async () => {
    return apiRequest(API_ENDPOINTS.CHAT_LIST_ROOMS, {
      method: 'GET',
    });
  },
};

// =====================
// OTP API
// =====================
export const otpAPI = {
  sendEmailOTP: async (email) => {
    return apiRequest(API_ENDPOINTS.SEND_EMAIL_OTP, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  
  verifyEmailOTP: async (email, otp) => {
    return apiRequest(API_ENDPOINTS.VERIFY_EMAIL_OTP, {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
  },
  
  sendSMSOTP: async (phone) => {
    return apiRequest(API_ENDPOINTS.SEND_SMS_OTP, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },
  
  verifySMSOTP: async (phone, otp, reqId = null) => {
    const body = { phone, otp };
    if (reqId) {
      body.reqId = reqId;
    }
    return apiRequest(API_ENDPOINTS.VERIFY_SMS_OTP, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  
  resendSMSOTP: async (phone) => {
    return apiRequest(API_ENDPOINTS.RESEND_SMS_OTP, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },
};

// =====================
// PUBLIC CONFIG API
// =====================
export const publicConfigAPI = {
  getConfig: async () => {
    return apiRequest(API_ENDPOINTS.PUBLIC_CONFIG, {
      method: 'GET',
    });
  },
};

// =====================
// BUYER INTERACTIONS API (Rate Limiting)
// =====================
export const buyerInteractionsAPI = {
  checkLimit: async (propertyId, actionType) => {
    const queryString = new URLSearchParams({
      property_id: propertyId,
      action_type: actionType,
    }).toString();
    return apiRequest(`${API_ENDPOINTS.BUYER_INTERACTIONS_CHECK}?${queryString}`);
  },
  
  recordInteraction: async (propertyId, actionType) => {
    return apiRequest(API_ENDPOINTS.BUYER_INTERACTIONS_RECORD, {
      method: 'POST',
      body: JSON.stringify({ property_id: propertyId, action_type: actionType }),
    });
  },
};

// Export all APIs
export default {
  auth: authAPI,
  sellerProperties: sellerPropertiesAPI,
  sellerDashboard: sellerDashboardAPI,
  sellerSubscription: sellerSubscriptionAPI,
  sellerInquiries: sellerInquiriesAPI,
  sellerLeads: sellerLeadsAPI,
  sellerProfile: sellerProfileAPI,
  properties: propertiesAPI,
  buyerProfile: buyerProfileAPI,
  favorites: favoritesAPI,
  history: historyAPI,
  chat: chatAPI,
  otp: otpAPI,
  buyerInteractions: buyerInteractionsAPI,
  publicConfig: publicConfigAPI,
};
