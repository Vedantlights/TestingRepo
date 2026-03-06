import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { User, Building2, Home } from "lucide-react";
import { otpAPI, publicConfigAPI } from "../../services/api.service";
import { useAuth } from "../../context/AuthContext";
import AddMobileModal from "../../components/AddMobileModal";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import "../styles/Register.css";

// MSG91 Widget Configuration (SMS Verification Widget)
const MSG91_WIDGET_ID = "356c7067734f373437333438";
const MSG91_AUTH_TOKEN = "481618TcNAx989nvQ69410832P1"; // Tokenid

// MSG91 Widget Configuration (Email Verification Widget)
const MSG91_EMAIL_WIDGET_ID = "356c6c657650333535343933";
const MSG91_EMAIL_AUTH_TOKEN = "481618TX6cdMp7Eg69414e7eP1"; // Token ID

const Register = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register: registerUser, loginWithGoogle, addPhoneToAccount } = useAuth();

  // Get role from URL query parameter, default to "buyer"
  const roleFromUrl = searchParams.get("role");
  const initialUserType = roleFromUrl && ["buyer", "seller", "agent"].includes(roleFromUrl)
    ? roleFromUrl
    : "buyer";

  // Get returnUrl from query parameter to redirect back after registration
  const initialReturnUrl = searchParams.get("returnUrl");

  const [userType, setUserType] = useState(initialUserType);
  const [returnUrl, setReturnUrl] = useState(initialReturnUrl);

  // Update userType and returnUrl when query parameters change
  useEffect(() => {
    const roleFromUrl = searchParams.get("role");
    const returnUrlFromParams = searchParams.get("returnUrl");

    if (roleFromUrl && ["buyer", "seller", "agent"].includes(roleFromUrl)) {
      setUserType(roleFromUrl);
    }

    if (returnUrlFromParams) {
      setReturnUrl(returnUrlFromParams);
      // Store in localStorage as backup
      localStorage.setItem("returnUrl", returnUrlFromParams);
      console.log("Return URL detected and stored:", returnUrlFromParams);
    } else {
      // Clear from localStorage if not present
      localStorage.removeItem("returnUrl");
    }
  }, [searchParams]);
  //for css conditione
  useEffect(() => {
    document.body.classList.add("auth-page");

    return () => {
      document.body.classList.remove("auth-page");
    };
  }, []);

  // Prevent body scrolling when component mounts
  useEffect(() => {
    // Store original overflow values
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    // Prevent scrolling on body and html
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Cleanup: restore original overflow values when component unmounts
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    emailOtp: "",
    phone: "",
    phoneOtp: "",
    password: "",
    confirmPassword: "",
    agreeTerms: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailVerificationToken, setEmailVerificationToken] = useState(null);
  const [phoneVerificationToken, setPhoneVerificationToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailOtpEnabled, setEmailOtpEnabled] = useState(false);
  const [showAddMobileModal, setShowAddMobileModal] = useState(false);
  const [isGoogleSignupNeedsPhone, setIsGoogleSignupNeedsPhone] = useState(false); // true when new Google signup
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Check if email OTP is enabled on component mount
  useEffect(() => {
    const checkEmailOtpStatus = async () => {
      try {
        const response = await publicConfigAPI.getConfig();
        console.log("Config API response:", response);
        if (response && response.success && response.data) {
          const enabled = response.data.enableEmailOtp === true; // Explicitly check for true
          setEmailOtpEnabled(enabled);

          // If email OTP is disabled, auto-verify email
          if (!enabled) {
            setEmailVerified(true);
            setEmailOtpSent(true);
            console.log("Email OTP is disabled - auto-verifying email");
          }
        } else {
          console.warn("Config API response format unexpected:", response);
          // Default to disabled (matches backend default)
          setEmailOtpEnabled(false);
          setEmailVerified(true);
          setEmailOtpSent(true);
        }
      } catch (error) {
        console.error("Failed to fetch email OTP config:", error);
        // Default to disabled if config fetch fails (matches backend default)
        setEmailOtpEnabled(false);
        setEmailVerified(true);
        setEmailOtpSent(true);
      }
    };

    checkEmailOtpStatus();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    // Convert fullName to uppercase, but keep email as is
    const processedValue = (name === 'fullName' && type !== 'checkbox')
      ? value.toUpperCase()
      : (type === "checkbox" ? checked : value);
    setFormData((prev) => ({
      ...prev,
      [name]: processedValue,
    }));
  };

  // Handle MSG91 Widget Email Verification
  // Note: You may see CORS warnings in console for MSG91 widget's geo IP lookup.
  // This is expected on localhost and won't affect widget functionality.
  const handleVerifyEmail = () => {
    const email = formData.email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");
    setSuccess("");

    // Check if MSG91 widget is available
    // Wait a bit for widget to load if it's not immediately available
    if (!window.initSendOTP) {
      // Retry after a short delay
      setTimeout(() => {
        if (!window.initSendOTP) {
          setError("MSG91 widget is not loaded. Please refresh the page and try again.");
        } else {
          handleVerifyEmail();
        }
      }, 500);
      return;
    }

    try {
      // Open MSG91 Widget for Email Verification
      const configuration = {
        widgetId: MSG91_EMAIL_WIDGET_ID,
        tokenAuth: MSG91_EMAIL_AUTH_TOKEN,
        identifier: email, // User's email address
        success: (data) => {
          // Widget verification successful
          console.log("MSG91 Email Verification Success:", data);

          // Store verification token
          // MSG91 returns token in different formats, handle all cases
          let verificationToken = null;

          if (typeof data === 'string') {
            // If data is already a string, use it
            verificationToken = data;
          } else if (data?.token) {
            // If token is in data.token
            verificationToken = data.token;
          } else if (data?.verificationToken) {
            // If token is in data.verificationToken
            verificationToken = data.verificationToken;
          } else if (data?.data?.token) {
            // If token is nested in data.data.token
            verificationToken = data.data.token;
          } else {
            // Fallback: stringify the entire data object
            verificationToken = JSON.stringify(data);
          }

          console.log("Stored email verification token:", verificationToken);
          setEmailVerificationToken(verificationToken);
          setEmailVerified(true);
          setEmailOtpSent(true);
          setSuccess("Email verified successfully!");
        },
        failure: (error) => {
          // Widget verification failed
          console.error("MSG91 Email Verification Error:", error);
          const errorMessage = error?.message || error?.error || error?.toString() || "Email verification failed. Please try again.";
          setError(errorMessage);
          setEmailVerified(false);
          setEmailVerificationToken(null);
        },
      };

      window.initSendOTP(configuration);
    } catch (error) {
      console.error("Error opening MSG91 email widget:", error);
      setError("Failed to open verification widget. Please try again.");
    }
  };

  // Handle MSG91 Widget Phone Verification
  // Note: You may see CORS warnings in console for MSG91 widget's geo IP lookup.
  // This is expected on localhost and won't affect widget functionality.
  const handleVerifyPhone = () => {
    const digits = formData.phone.replace(/\D/g, "");
    let valid = false;
    let phone = "";

    // Format phone for MSG91: "918433517958" (country code + number, no + sign)
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
      valid = true;
      phone = "91" + digits; // MSG91 format: no + sign
    } else if (digits.length === 12 && digits.startsWith("91")) {
      const num = digits.slice(2);
      if (/^[6-9]\d{9}$/.test(num)) {
        valid = true;
        phone = digits; // Already in correct format
      }
    } else if (digits.length === 13 && digits.startsWith("91")) {
      // Handle case where + is included
      const num = digits.slice(2);
      if (/^[6-9]\d{9}$/.test(num)) {
        valid = true;
        phone = "91" + num; // Remove + sign
      }
    }

    if (!valid) {
      setError("Enter a valid Indian mobile number (10 digits, starts from 6-9).");
      return;
    }

    setError("");
    setSuccess("");

    // Check if MSG91 widget is available
    // Wait a bit for widget to load if it's not immediately available
    if (!window.initSendOTP) {
      // Retry after a short delay
      setTimeout(() => {
        if (!window.initSendOTP) {
          setError("MSG91 widget is not loaded. Please refresh the page and try again.");
        } else {
          handleVerifyPhone();
        }
      }, 500);
      return;
    }

    try {
      // Open MSG91 Widget
      const configuration = {
        widgetId: MSG91_WIDGET_ID,
        tokenAuth: MSG91_AUTH_TOKEN,
        identifier: phone, // User's phone number
        success: (data) => {
          // Widget verification successful
          console.log("MSG91 Verification Success:", data);

          // Store verification token
          // MSG91 returns token in different formats, handle all cases
          let verificationToken = null;

          if (typeof data === 'string') {
            // If data is already a string, use it
            verificationToken = data;
          } else if (data?.token) {
            // If token is in data.token
            verificationToken = data.token;
          } else if (data?.verificationToken) {
            // If token is in data.verificationToken
            verificationToken = data.verificationToken;
          } else if (data?.data?.token) {
            // If token is nested in data.data.token
            verificationToken = data.data.token;
          } else {
            // Fallback: stringify the entire data object
            verificationToken = JSON.stringify(data);
          }

          console.log("Stored verification token:", verificationToken);
          setPhoneVerificationToken(verificationToken);
          setPhoneVerified(true);
          setPhoneOtpSent(true);
          setSuccess("Phone verified successfully!");
        },
        failure: (error) => {
          // Widget verification failed
          console.error("MSG91 Verification Error:", error);
          const errorMessage = error?.message || error?.error || error?.toString() || "Phone verification failed. Please try again.";
          setError(errorMessage);
          setPhoneVerified(false);
          setPhoneVerificationToken(null);
        },
      };

      window.initSendOTP(configuration);
    } catch (error) {
      console.error("Error opening MSG91 widget:", error);
      setError("Failed to open verification widget. Please try again.");
    }
  };

  const handleSubmit = async (e) => {
    // Prevent default form submission
    if (e) {
      e.preventDefault();
    }

    // Prevent double submission
    if (isLoading) {
      return;
    }

    setError("");
    setSuccess("");

    // Validation
    if (!formData.agreeTerms) {
      setError("Please agree to Terms & Privacy Policy");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match!");
      return;
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    // Only require email verification if email OTP is enabled
    if (emailOtpEnabled && !emailVerified) {
      setError("Please verify your email address");
      return;
    }
    if (!phoneVerified) {
      setError("Please verify your phone number");
      return;
    }

    setIsLoading(true);

    try {
      // Format phone number
      const digits = formData.phone.replace(/\D/g, "");
      let phone = "";
      if (digits.length === 10) {
        phone = "+91" + digits;
      } else if (digits.length === 12 && digits.startsWith("91")) {
        phone = "+" + digits;
      }

      // Extract actual token from MSG91 response if it's a JSON object (Phone)
      let actualPhoneToken = phoneVerificationToken;
      if (phoneVerificationToken) {
        try {
          // If token is a JSON string, parse it
          const parsed = typeof phoneVerificationToken === 'string' ? JSON.parse(phoneVerificationToken) : phoneVerificationToken;
          // MSG91 returns token in data.message or data.token
          if (parsed?.message) {
            actualPhoneToken = parsed.message;
          } else if (parsed?.token) {
            actualPhoneToken = parsed.token;
          } else if (parsed?.verificationToken) {
            actualPhoneToken = parsed.verificationToken;
          }
        } catch (e) {
          // If parsing fails, use as is
          actualPhoneToken = phoneVerificationToken;
        }
      }

      // Extract actual token from MSG91 response if it's a JSON object (Email)
      let actualEmailToken = emailVerificationToken;
      if (emailVerificationToken) {
        try {
          // If token is a JSON string, parse it
          const parsed = typeof emailVerificationToken === 'string' ? JSON.parse(emailVerificationToken) : emailVerificationToken;
          // MSG91 returns token in data.message or data.token
          if (parsed?.message) {
            actualEmailToken = parsed.message;
          } else if (parsed?.token) {
            actualEmailToken = parsed.token;
          } else if (parsed?.verificationToken) {
            actualEmailToken = parsed.verificationToken;
          }
        } catch (e) {
          // If parsing fails, use as is
          actualEmailToken = emailVerificationToken;
        }
      }

      const registrationData = {
        fullName: formData.fullName,
        email: formData.email.trim(),
        emailVerificationToken: actualEmailToken, // MSG91 email verification token (extracted)
        phone: phone,
        phoneVerificationToken: actualPhoneToken, // MSG91 phone verification token (extracted)
        password: formData.password,
        userType: userType,
      };

      console.log("Registration data being sent:", {
        ...registrationData,
        emailVerificationToken: emailVerificationToken ? `${emailVerificationToken.substring(0, 20)}...` : null,
        phoneVerificationToken: phoneVerificationToken ? `${phoneVerificationToken.substring(0, 20)}...` : null
      });

      // ✅ CHANGED: Use AuthContext register (handles auto-login)
      const response = await registerUser(registrationData);

      if (response.success) {
        // ✅ CHANGED: Show welcome message
        setSuccess(`Registration successful! Welcome, ${formData.fullName}!`);

        // ✅ ADDED: Store current session
        localStorage.setItem(
          "currentSession",
          JSON.stringify({
            email: formData.email,
            loginType: userType,
            loginTime: new Date().toISOString(),
          })
        );

        console.log("✅ Registration successful - Auto-logged in!");
        console.log("Current returnUrl state:", returnUrl);
        console.log("Current returnUrl from searchParams:", searchParams.get("returnUrl"));

        // ✅ CHANGED: Redirect to returnUrl if provided, otherwise navigate to dashboard
        setTimeout(() => {
          // Get returnUrl from state, searchParams, or localStorage (fallback chain)
          const redirectUrl = returnUrl || searchParams.get("returnUrl") || localStorage.getItem("returnUrl");

          if (redirectUrl) {
            try {
              const decodedUrl = decodeURIComponent(redirectUrl);
              // Validate that it's a relative path (starts with /)
              if (decodedUrl.startsWith('/')) {
                console.log("Redirecting back to property page:", decodedUrl);
                // Clear returnUrl from localStorage after use
                localStorage.removeItem("returnUrl");
                // Use replace: false to allow browser back button
                navigate(decodedUrl, { replace: false });
              } else {
                console.warn("Invalid returnUrl format, using role-based navigation:", decodedUrl);
                // Fallback to role-based navigation
                if (userType === "buyer") {
                  navigate("/buyer-dashboard");
                } else if (userType === "seller") {
                  navigate("/seller-dashboard");
                } else if (userType === "agent") {
                  navigate("/agent-dashboard");
                }
              }
            } catch (error) {
              console.error("Error decoding returnUrl:", error);
              // Fallback to role-based navigation
              if (userType === "buyer") {
                navigate("/buyer-dashboard");
              } else if (userType === "seller") {
                navigate("/seller-dashboard");
              } else if (userType === "agent") {
                navigate("/agent-dashboard");
              }
            }
          } else {
            console.log("No returnUrl found, using role-based navigation");
            // Role-based navigation
            if (userType === "buyer") {
              navigate("/buyer-dashboard");
            } else if (userType === "seller") {
              navigate("/seller-dashboard");
            } else if (userType === "agent") {
              navigate("/agent-dashboard");
            }
          }
        }, 1500);
      } else {
        // Show detailed error message
        const errorMsg = response.message || response.errors || "Registration failed. Please try again.";
        setError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
        console.error("Registration failed:", response);
      }
    } catch (error) {
      console.error("Registration error:", error);
      console.error("Registration error details:", {
        message: error.message,
        data: error.data,
        errors: error.errors,
        response: error.response,
        fullError: error
      });
      // Show more detailed error
      const errorMsg = error.data?.message || error.message || error.errors || error.response?.data?.message || "Registration failed. Please try again.";
      setError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    } finally {
      setIsLoading(false);
    }
  };

  // Get allowed login roles based on registration type
  const getAllowedLoginRoles = (regType) => {
    switch (regType) {
      case "buyer":
        // Buyer/Tenant can login as buyer or seller, but NOT agent
        return ["buyer", "seller"];
      case "seller":
        // Seller/Owner can login as buyer or seller, but NOT agent
        return ["buyer", "seller"];
      case "agent":
        // Agent/Builder can ONLY login as agent
        return ["agent"];
      default:
        return ["buyer"];
    }
  };

  const getUserTypeLabel = (type) => {
    switch (type) {
      case "buyer":
        return "Buyer/Tenant";
      case "seller":
        return "Seller/Owner";
      case "agent":
        return "Agent/Builder";
      default:
        return type;
    }
  };

  // Background images mapping for each role
  const backgroundImages = {
    buyer: "/LoginBuy.jpg",
    seller: "/LoginSellerr.jpg",
    agent: "/landingpageagent.jpeg",
  };

  const handleUserTypeChange = (type) => {
    setUserType(type);
  };

  const navigateToDashboard = () => {
    const redirectUrl = returnUrl || searchParams.get("returnUrl") || localStorage.getItem("returnUrl");
    if (redirectUrl) {
      try {
        const decodedUrl = decodeURIComponent(redirectUrl);
        if (decodedUrl.startsWith("/")) {
          localStorage.removeItem("returnUrl");
          navigate(decodedUrl, { replace: false });
          return;
        }
      } catch (e) {
        console.error("Error decoding returnUrl:", e);
      }
    }
    if (userType === "buyer") navigate("/buyer-dashboard");
    else if (userType === "seller") navigate("/seller-dashboard");
    else navigate("/agent-dashboard");
  };

  const handleGoogleSuccess = async (credential) => {
    setError("");
    setIsGoogleLoading(true);
    try {
      const result = await loginWithGoogle(credential, userType);
      if (result?.success && result?.data) {
        localStorage.setItem(
          "currentSession",
          JSON.stringify({
            email: result.data.user?.email,
            loginType: userType,
            loginTime: new Date().toISOString(),
          })
        );
        if (result.data.needsPhone) {
          sessionStorage.setItem('pendingPhoneVerification', '1');
          setIsGoogleSignupNeedsPhone(result.data.isNewUser ?? false);
          setShowAddMobileModal(true);
        } else {
          setTimeout(navigateToDashboard, 100);
        }
      } else {
        setError(result?.message || "Google sign-up failed.");
      }
    } catch (err) {
      setError(err?.message || "Google sign-up failed.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Handle ENTER key to move to next input or submit form
  const handleKeyDown = (e, currentFieldName) => {
    if (e.key === "Enter") {
      e.preventDefault();

      // Get all input fields in order (excluding disabled/verified fields)
      const inputFields = [
        "fullName",
        "email",
        "phone",
        "password",
        "confirmPassword"
      ];

      const currentIndex = inputFields.indexOf(currentFieldName);

      if (currentIndex < inputFields.length - 1) {
        // Move to next input field
        const nextFieldName = inputFields[currentIndex + 1];
        const nextInput = document.querySelector(`input[name="${nextFieldName}"]`);
        if (nextInput && !nextInput.disabled) {
          nextInput.focus();
        } else {
          // If next field is disabled, try to find the next enabled field
          for (let i = currentIndex + 1; i < inputFields.length; i++) {
            const fieldName = inputFields[i];
            const fieldInput = document.querySelector(`input[name="${fieldName}"]`);
            if (fieldInput && !fieldInput.disabled) {
              fieldInput.focus();
              break;
            }
          }
        }
      } else {
        // Last field - submit the form
        handleSubmit(e);
      }
    }
  };

  return (
    <div className="container">
      <div
        className="background-image"
        style={{
          backgroundImage: `url(${backgroundImages[userType]})`,
        }}
      />
      <div className="card" key={userType}>
        <div className="header">
          <h1 className="title">Create Account</h1>
          <p className="subtitle">Fill in your details to get started</p>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          {/* Error Message */}
          {error && (
            <div className="error-message">
              <span className="error-icon">✕</span>
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="success-message">
              <span className="success-icon">✓</span>
              {success}
            </div>
          )}

          {/* User Type Toggle */}
          <div className="form-group">
            <label className="label">Register As</label>
            <div className="user-type-toggle">
              <button
                type="button"
                onClick={() => handleUserTypeChange("buyer")}
                className={`type-btn ${userType === "buyer" ? "active" : ""}`}
              >
                <User size={18} /> Buyer/Tenant
              </button>

              <button
                type="button"
                onClick={() => handleUserTypeChange("seller")}
                className={`type-btn ${userType === "seller" ? "active" : ""}`}
              >
                <Home size={18} /> Seller/Owner
              </button>

              <button
                type="button"
                onClick={() => handleUserTypeChange("agent")}
                className={`type-btn ${userType === "agent" ? "active" : ""}`}
              >
                <Building2 size={18} /> Agent/Builder
              </button>
            </div>

            {/* Role Access Info */}
            <div className="role-info">
              {userType === "buyer" && (
                <p className="role-hint">

                  As a Buyer/Tenant, you can access Buyer and Seller dashboards
                </p>
              )}
              {userType === "seller" && (
                <p className="role-hint">

                  As a Seller/Owner, you can access Buyer and Seller dashboards
                </p>
              )}
              {userType === "agent" && (
                <p className="role-hint role-hint-agent">

                  As an Agent/Builder, you can only access the Agent dashboard
                </p>
              )}
            </div>
          </div>

          {/* Full Name */}
          <div className="form-group">
            <label className="label">Full Name *</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              onKeyDown={(e) => handleKeyDown(e, "fullName")}
              placeholder="John Doe"
              className="input"
            />
          </div>

          {/* Email */}
          <div className="form-group">
            <label className="label">Email Address *</label>
            <div className="input-wrapper">
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && emailOtpEnabled && !emailVerified) {
                    e.preventDefault();
                    // If email is not verified, move to phone field
                    const phoneInput = document.querySelector(`input[name="phone"]`);
                    if (phoneInput && !phoneInput.disabled) {
                      phoneInput.focus();
                    } else {
                      // If phone is also disabled, move to password
                      const passwordInput = document.querySelector(`input[name="password"]`);
                      if (passwordInput) {
                        passwordInput.focus();
                      }
                    }
                  } else if (e.key === "Enter") {
                    handleKeyDown(e, "email");
                  }
                }}
                placeholder="john@example.com"
                className="input"
                required
              />
              {emailOtpEnabled && (
                <button
                  type="button"
                  className="inline-btn"
                  onClick={handleVerifyEmail}
                  disabled={isLoading || emailVerified}
                >
                  {emailVerified ? "Verified ✓" : "Verify Email"}
                </button>
              )}
            </div>
            {emailOtpEnabled && emailVerified && (
              <p style={{ fontSize: '12px', color: '#48bb78', marginTop: '4px' }}>
                ✓ Email address verified via MSG91
              </p>
            )}
          </div>

          {/* Phone */}
          <div className="form-group">
            <label className="label">Phone Number *</label>
            <div className="input-wrapper">
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !phoneVerified) {
                    e.preventDefault();
                    // If phone is not verified, move to password field
                    const passwordInput = document.querySelector(`input[name="password"]`);
                    if (passwordInput) {
                      passwordInput.focus();
                    }
                  } else if (e.key === "Enter") {
                    handleKeyDown(e, "phone");
                  }
                }}
                placeholder="+917276*****"
                className="input input-pr"
                disabled={phoneVerified}
              />
              <button
                type="button"
                className="inline-btn"
                onClick={handleVerifyPhone}
                disabled={isLoading || phoneVerified}
              >
                {phoneVerified ? "Verified ✓" : "Verify Phone"}
              </button>
            </div>
            {phoneVerified && (
              <p style={{ fontSize: '12px', color: '#48bb78', marginTop: '4px' }}>
                ✓ Phone number verified via MSG91
              </p>
            )}
          </div>

          {/* Password */}
          <div className="form-group">
            <label className="label">Password *</label>
            <div className="input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                onKeyDown={(e) => handleKeyDown(e, "password")}
                placeholder="••••••••"
                className="input input-small-pr"
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label className="label">Confirm Password *</label>
            <div className="input-wrapper">
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                onKeyDown={(e) => handleKeyDown(e, "confirmPassword")}
                placeholder="••••••••"
                className="input input-small-pr"
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Terms */}
          <div className="checkbox-group">
            <input
              type="checkbox"
              id="agreeTerms"
              name="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleChange}
              className="checkbox"
            />
            <label htmlFor="agreeTerms" className="checkbox-label">
              I agree to the{" "}
              <a href="terms-conditions" className="link">
                Terms
              </a>{" "}
              &{" "}
              <a href="./privacy-policy" className="link">
                Privacy Policy
              </a>
            </label>
          </div>

          {/* Register Button */}
          <button
            type="submit"
            className="register-btn"
            disabled={isLoading}
          >
            {isLoading ? "Registering..." : `Register as ${getUserTypeLabel(userType)}`}
          </button>

          {/* Google Sign Up */}
          <div className="register-divider">
            <span>or</span>
          </div>
          <div className="google-signin-wrapper">
            <GoogleSignInButton
              userType={userType}
              onSuccess={handleGoogleSuccess}
              onError={(err) => setError(err?.message || "Google sign-up failed.")}
              disabled={isGoogleLoading}
            />
            <p className="google-legal-hint">
              By continuing with Google, you agree to our{" "}
              <a href="terms-conditions" className="link">Terms</a>
              {" "}and{" "}
              <a href="./privacy-policy" className="link">Privacy Policy</a>.
            </p>
          </div>

          {/* Add Mobile Modal (after Google signup - verify mobile required for new signups) */}
          <AddMobileModal
            isOpen={showAddMobileModal}
            onClose={() => {
              sessionStorage.removeItem('pendingPhoneVerification');
              setShowAddMobileModal(false);
              setIsGoogleSignupNeedsPhone(false);
              navigateToDashboard();
            }}
            onSuccess={async (phone, token) => addPhoneToAccount(phone, token)}
            onSkip={() => navigateToDashboard()}
            isSignup={isGoogleSignupNeedsPhone}
          />

          {/* Login Link */}
          <p className="login-link">
            Already have an account?{" "}
            <button type="button" className="link-btn" onClick={() => {
              const loginUrl = returnUrl
                ? `/login?role=${userType}&returnUrl=${encodeURIComponent(returnUrl)}`
                : `/login?role=${userType}`;
              navigate(loginUrl);
            }}>
              Sign In
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;