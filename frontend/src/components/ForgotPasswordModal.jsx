import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api.config';
import './ForgotPasswordModal.css';

// MSG91 Widget Configuration
const MSG91_WIDGET_ID = '356c686b6c57353338333631';
const MSG91_AUTH_TOKEN = '481618TsNUr9hYEGR694e174cP1';

const ForgotPasswordModal = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(1); // 1: Email/Phone, 2: OTP, 3: Password, 4: Success
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [usedIdentifier, setUsedIdentifier] = useState(''); // email or phone for reset
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [widgetToken, setWidgetToken] = useState(null);
  const widgetInitializedRef = useRef(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setEmailOrPhone('');
      setUsedIdentifier('');
      setPhone('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setWidgetToken(null);
      setLoading(false);
      widgetInitializedRef.current = false;
    }
  }, [isOpen]);

  // Load MSG91 script
  const loadMSG91Script = () => {
    return new Promise((resolve, reject) => {
      if (window.initSendOTP && typeof window.initSendOTP === 'function') {
        resolve();
        return;
      }

      const existingScript = document.querySelector('script[src*="otp-provider.js"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', () => reject(new Error('Failed to load MSG91 script')));
        return;
      }

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://verify.msg91.com/otp-provider.js';
      script.async = true;
      
      script.onload = () => {
        setTimeout(() => {
          if (window.initSendOTP && typeof window.initSendOTP === 'function') {
            resolve();
          } else {
            reject(new Error('MSG91 script loaded but initSendOTP function not available'));
          }
        }, 100);
      };
      
      script.onerror = () => reject(new Error('Failed to load MSG91 script'));
      document.head.appendChild(script);
    });
  };

  // Wait for MSG91 script
  const waitForMSG91Script = (maxAttempts = 20, delay = 200) => {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const checkScript = () => {
        if (window.initSendOTP && typeof window.initSendOTP === 'function') {
          resolve();
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkScript, delay);
        } else {
          reject(new Error('MSG91 script timeout'));
        }
      };
      checkScript();
    });
  };

  // Initialize MSG91 Widget (identifier: email or 91XXXXXXXXXX for phone)
  const initializeMSG91Widget = async (identifier) => {
    if (widgetInitializedRef.current) {
      return;
    }

    try {
      await loadMSG91Script();
    } catch (loadError) {
      try {
        await waitForMSG91Script(20, 200);
      } catch (waitError) {
        setError('MSG91 widget is not loaded. Please refresh the page and try again.');
        widgetInitializedRef.current = false;
        return;
      }
    }

    if (!window.initSendOTP || typeof window.initSendOTP !== 'function') {
      setError('MSG91 widget is not loaded. Please refresh the page and try again.');
      widgetInitializedRef.current = false;
      return;
    }

    widgetInitializedRef.current = true;

    // Format identifier for MSG91 (can be email or phone)
    let formattedIdentifier = identifier;
    if (identifier.includes('@')) {
      // Email
      formattedIdentifier = identifier;
    } else {
      // Phone - format for MSG91
      const formattedMobile = identifier.replace(/[^0-9]/g, '');
      formattedIdentifier = formattedMobile.startsWith('91') ? formattedMobile : '91' + formattedMobile.slice(-10);
    }

    try {
      const configuration = {
        widgetId: MSG91_WIDGET_ID,
        tokenAuth: MSG91_AUTH_TOKEN,
        identifier: formattedIdentifier,
        success: async (widgetData) => {
          console.log('MSG91 Widget Success:', widgetData);
          
          let token = null;
          if (typeof widgetData === 'string') {
            token = widgetData;
          } else if (widgetData?.token) {
            token = widgetData.token;
          } else if (widgetData?.verificationToken) {
            token = widgetData.verificationToken;
          } else if (widgetData?.data?.token) {
            token = widgetData.data.token;
          } else {
            token = JSON.stringify(widgetData);
          }

          if (token && token.length >= 10) {
            setWidgetToken(token);
            setStep(3); // Move to password reset step
            setError('');
          } else {
            setError('Invalid token received from OTP verification. Please try again.');
          }
        },
        failure: (error) => {
          console.error('MSG91 Widget Failure:', error);
          setError('OTP verification failed. Please try again.');
          widgetInitializedRef.current = false;
        },
      };

      window.initSendOTP(configuration);
    } catch (error) {
      console.error('Error initializing MSG91 widget:', error);
      setError('Failed to initialize OTP widget. Please try again.');
      widgetInitializedRef.current = false;
    }
  };

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isPhone = (v) => /^[\d\s+\-()]{10,}$/.test(v.replace(/\D/g, '')) && v.replace(/\D/g, '').length >= 10;

  // Step 1: Handle email or phone submission
  const handleIdentifierSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const value = (emailOrPhone || '').trim();
    if (!value) {
      setError('Please enter your email or mobile number');
      return;
    }

    if (!isEmail(value) && !isPhone(value)) {
      setError('Please enter a valid email or mobile number');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.FORGOT_PASSWORD_INIT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailOrPhone: value, email: value }),
      });

      const data = await response.json();

      if (data.success) {
        setPhone(data.data?.phone || '');
        setUsedIdentifier(data.data?.usedIdentifier || data.data?.identifier || value);
        setStep(2);
        setError('');
        
        const widgetId = data.data?.widgetIdentifier || value;
        setTimeout(() => {
          initializeMSG91Widget(widgetId);
        }, 500);
      } else {
        setError(data.message || 'No account found with this email or phone number.');
      }
    } catch (error) {
      console.error('Error:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Handle password reset
  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setError('');

    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!widgetToken || widgetToken.length < 10) {
      setError('OTP verification token is missing. Please complete OTP verification first.');
      return;
    }

    setLoading(true);

    const identifier = usedIdentifier || emailOrPhone;
    const isEmailReset = identifier.includes('@');

    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.RESET_PASSWORD}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: isEmailReset ? identifier : '',
          phone: !isEmailReset ? identifier : '',
          widgetToken: widgetToken,
          newPassword: newPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setStep(4); // Success step
        setError('');
        
        // Auto-close after 3 seconds
        setTimeout(() => {
          onClose();
        }, 3000);
      } else {
        setError(data.message || 'Failed to reset password. Please try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle back button
  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setError('');
      widgetInitializedRef.current = false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="forgot-password-overlay" onClick={onClose}>
      <div className="forgot-password-modal" onClick={(e) => e.stopPropagation()}>
        <button className="forgot-password-close" onClick={onClose}>
          <X size={24} />
        </button>

        <div className="forgot-password-content">
          <h2>Reset Password</h2>

          {error && (
            <div className="forgot-password-error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Email or Phone Input */}
          {step === 1 && (
            <form onSubmit={handleIdentifierSubmit} className="forgot-password-form">
              <p className="forgot-password-description">
                Enter your email or mobile number and we&apos;ll send you an OTP to reset your password.
              </p>
              <div className="forgot-password-field">
                <label>Email or Mobile Number</label>
                <input
                  type="text"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  placeholder="john@example.com or 9876543210"
                  required
                  disabled={loading}
                />
              </div>
              <button type="submit" className="forgot-password-btn" disabled={loading}>
                {loading ? 'Checking...' : 'Continue'}
              </button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === 2 && (
            <div className="forgot-password-otp-step">
              <p className="forgot-password-description">
                {phone 
                  ? `We've sent an OTP to your registered phone number ending in ${phone.slice(-4)}. You can also verify via email.`
                  : 'Please verify your identity using the OTP widget below. You can choose SMS or Email verification.'}
              </p>
              <div id="msg91-otp-widget-container" className="msg91-widget-container">
                {/* MSG91 widget will be rendered here */}
              </div>
              <button
                type="button"
                onClick={handleBack}
                className="forgot-password-back-btn"
                disabled={loading}
              >
                ← Back
              </button>
            </div>
          )}

          {/* Step 3: New Password */}
          {step === 3 && (
            <form onSubmit={handlePasswordReset} className="forgot-password-form">
              <p className="forgot-password-description">
                Enter your new password below.
              </p>
              <div className="forgot-password-field">
                <label>New Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 6 characters)"
                    required
                    disabled={loading}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="password-toggle-btn"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <div className="forgot-password-field">
                <label>Confirm Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    disabled={loading}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="password-toggle-btn"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="forgot-password-btn" disabled={loading}>
                {loading ? 'Resetting Password...' : 'Reset Password'}
              </button>
            </form>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="forgot-password-success">
              <CheckCircle size={64} className="success-icon" />
              <h3>Password Reset Successful!</h3>
              <p>Your password has been reset successfully. You can now login with your new password.</p>
              <p className="forgot-password-auto-close">This window will close automatically in 3 seconds...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordModal;

