import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, User, Building2, Home, Smartphone } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { authAPI } from "../../services/api.service";
import ForgotPasswordModal from "../../components/ForgotPasswordModal";
import AddMobileModal from "../../components/AddMobileModal";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import "../styles/Login.css";
// MSG91 Widget Configuration
const MSG91_WIDGET_ID = "356c7067734f373437333438";
const MSG91_AUTH_TOKEN = "481618TcNAx989nvQ69410832P1"; // Tokenid


const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, loginWithOTP, loginWithGoogle, addPhoneToAccount } = useAuth();
  useEffect(() => {
    document.body.classList.add("auth-page");

    return () => {
      document.body.classList.remove("auth-page");
    };
  }, []);

  // Get role from URL query parameter, default to "buyer"
  const roleFromUrl = searchParams.get("role");
  const initialUserType = roleFromUrl && ["buyer", "seller", "agent"].includes(roleFromUrl)
    ? roleFromUrl
    : "buyer";

  // Get returnUrl from query parameter to redirect back after login
  const initialReturnUrl = searchParams.get("returnUrl");

  const [userType, setUserType] = useState(initialUserType);
  const [returnUrl, setReturnUrl] = useState(initialReturnUrl);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [showAddMobileModal, setShowAddMobileModal] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [loginMode, setLoginMode] = useState("password"); // "password" | "otp"
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequestId, setOtpRequestId] = useState(null);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isOtpSending, setIsOtpSending] = useState(false);
  const [phoneVerificationToken, setPhoneVerificationToken] = useState(null);

  const [formData, setFormData] = useState({
    emailOrPhone: "",
    password: "",
    rememberMe: false,
  });

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

  // Validate if the user can login with selected role
  const validateRoleAccess = (registeredUserType, attemptedLoginType) => {
    // Define role access rules
    const roleAccessMap = {
      buyer: ["buyer", "seller"], // Buyer/Tenant can login as buyer or seller
      seller: ["buyer", "seller"], // Seller/Owner can login as buyer or seller
      agent: ["agent"], // Agent/Builder can ONLY login as agent
    };

    const allowedRoles = roleAccessMap[registeredUserType] || [];
    return allowedRoles.includes(attemptedLoginType);
  };

  const getRoleAccessMessage = (registeredType, attemptedType) => {
    const typeLabels = {
      buyer: "Buyer/Tenant",
      seller: "Seller/Owner",
      agent: "Agent/Builder",
    };

    if (registeredType === "agent" && attemptedType !== "agent") {
      return `You are registered as an Agent/Builder. You can only access the Agent/Builder dashboard.`;
    }

    if (registeredType !== "agent" && attemptedType === "agent") {
      return `You are registered as ${typeLabels[registeredType]}. You cannot access the Agent/Builder dashboard. Only registered Agents/Builders can access this section.`;
    }

    return "Access denied for this role.";
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

    setLoginError("");

    // Basic validation
    if (!formData.emailOrPhone || !formData.password) {
      setLoginError("Please enter email/mobile and password");
      return;
    }

    setIsLoading(true);

    try {
      console.log("Login attempt:", { emailOrPhone: formData.emailOrPhone, userType });
      const result = await login(formData.emailOrPhone, formData.password, userType);
      console.log("Login result:", result);

      if (result.success) {
        console.log("Login successful, navigating to dashboard...");
        console.log("Current returnUrl state:", returnUrl);
        console.log("Current returnUrl from searchParams:", searchParams.get("returnUrl"));

        // Store current login session
        localStorage.setItem(
          "currentSession",
          JSON.stringify({
            email: result.user?.email || formData.emailOrPhone,
            loginType: userType,
            loginTime: new Date().toISOString(),
          })
        );

        // Get returnUrl from state, searchParams, or localStorage (fallback chain)
        const redirectUrl = returnUrl || searchParams.get("returnUrl") || localStorage.getItem("returnUrl");

        // Small delay to ensure auth state is fully updated before navigation
        setTimeout(() => {
          // Redirect to returnUrl if provided and valid, otherwise use role-based navigation
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
        }, 100); // Small delay to ensure auth state is updated
      } else {
        const errorMsg = result.message || "Login failed. Please check your credentials.";
        console.error("Login failed:", errorMsg);
        setLoginError(errorMsg);
      }
    } catch (error) {
      console.error("Login error caught:", error);
      const errorMsg = error.message || error.data?.message || "An error occurred. Please try again.";
      setLoginError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    // Clear error when user makes changes
    if (loginError) setLoginError("");
  };

  const handleUserTypeChange = (type) => {
    setUserType(type);
    if (loginError) setLoginError("");
  };

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setLoginError("");

    const phoneDigits = otpPhone.replace(/\D/g, "");
    if (phoneDigits.length !== 10 || !/^[6-9]\d{9}$/.test(phoneDigits)) {
      setLoginError("Please enter a valid 10-digit Indian mobile number");
      return;
    }

    const formattedPhone = "91" + phoneDigits;

    if (!window.initSendOTP) {
      setTimeout(() => {
        if (!window.initSendOTP) {
          setLoginError("Verification widget is not loaded. Please refresh the page.");
        } else {
          handleSendOtp();
        }
      }, 500);
      return;
    }

    setIsOtpSending(true);

    try {
      const configuration = {
        widgetId: MSG91_WIDGET_ID,
        tokenAuth: MSG91_AUTH_TOKEN,
        identifier: formattedPhone,
        success: (data) => {
          console.log("MSG91 Login Verification Success:", data);
          let token = typeof data === 'string' ? data : (data?.token || data?.verificationToken || JSON.stringify(data));
          setPhoneVerificationToken(token);
          setIsOtpSent(true);
          setLoginError("");

          // Automatically trigger login once verified via widget
          handleAutoLoginAfterWidget(formattedPhone, token);
        },
        failure: (error) => {
          console.error("MSG91 Login Verification Error:", error);
          setLoginError(error?.message || "Verification failed. Please try again.");
          setIsOtpSending(false);
        },
      };

      window.initSendOTP(configuration);
    } catch (err) {
      setLoginError("Failed to open verification widget.");
      setIsOtpSending(false);
    }
  };

  const handleAutoLoginAfterWidget = async (phone, token) => {
    setIsLoading(true);
    try {
      const fullPhone = "+" + phone;
      const result = await loginWithOTP(fullPhone, "WIDGET", userType, token);
      if (result?.success) {
        localStorage.setItem(
          "currentSession",
          JSON.stringify({
            email: result.data?.user?.email,
            loginType: userType,
            loginTime: new Date().toISOString(),
          })
        );
        setTimeout(navigateToDashboard, 100);
      } else {
        setLoginError(result?.message || "Login failed after verification.");
        setIsOtpSent(false); // Reset to allow retry
      }
    } catch (err) {
      setLoginError(err?.message || "Login failed.");
      setIsOtpSent(false);
    } finally {
      setIsLoading(false);
      setIsOtpSending(false);
    }
  };

  const handleOtpVerify = async (e) => {
    if (e) e.preventDefault();
    // Verification is handled by handleAutoLoginAfterWidget
  };

  const switchToPasswordMode = () => {
    setLoginMode("password");
    setIsOtpSent(false);
    setOtpPhone("");
    setOtpCode("");
    setOtpRequestId(null);
    setLoginError("");
  };

  const switchToOtpMode = () => {
    setLoginMode("otp");
    setIsOtpSent(false);
    setOtpPhone("");
    setOtpCode("");
    setOtpRequestId(null);
    setLoginError("");
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
    setLoginError("");
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
          setShowAddMobileModal(true);
        } else {
          setTimeout(navigateToDashboard, 100);
        }
      } else {
        setLoginError(result?.message || "Google sign-in failed.");
      }
    } catch (err) {
      setLoginError(err?.message || "Google sign-in failed.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Handle ENTER key to move to next input or submit form
  const handleKeyDown = (e, currentFieldName) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const inputFields = ["emailOrPhone", "password"];
      const currentIndex = inputFields.indexOf(currentFieldName);
      if (currentIndex < inputFields.length - 1) {
        const nextInput = document.querySelector(`input[name="${inputFields[currentIndex + 1]}"]`);
        if (nextInput) nextInput.focus();
      } else {
        handleSubmit(e);
      }
    }
  };

  // Background images mapping for each role
  const backgroundImages = {
    buyer: "/LoginBuy.jpg",
    seller: "/LoginSellerr.jpg",
    agent: "/landingpageagent.jpeg",
  };

  return (

    <div className="login-container">
      <div
        className="background-image"
        style={{
          backgroundImage: `url(${backgroundImages[userType]})`,
        }}
      />
      <div className="login-card" key={userType}>
        <div className="login-header">
          <h1>Welcome Back</h1>
          <p>Sign in to continue to your account</p>
        </div>

        <div className="user-type-toggle">
          <button
            onClick={() => handleUserTypeChange("buyer")}
            className={userType === "buyer" ? "active" : ""}
          >
            <User size={20} /> Buyer/Tenant
          </button>

          <button
            onClick={() => handleUserTypeChange("seller")}
            className={userType === "seller" ? "active" : ""}
          >
            <Home size={20} /> Seller/Owner
          </button>

          <button
            onClick={() => handleUserTypeChange("agent")}
            className={userType === "agent" ? "active" : ""}
          >
            <Building2 size={20} /> Agent/Builder
          </button>
        </div>

        {/* Role Access Hint */}
        <div className="role-access-hint">
          {userType === "agent" && (
            <p className="hint-text hint-warning">

              Only registered Agents/Builders can access this dashboard
            </p>
          )}
          {(userType === "buyer" || userType === "seller") && (
            <p className="hint-text">

              Buyers and Sellers can switch between these two dashboards
            </p>
          )}
        </div>

        {/* Error Message */}
        {loginError && (
          <div className="error-message">
            <span className="error-icon">✕</span>
            {loginError}
          </div>
        )}

        {loginMode === "password" ? (
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email or Mobile Number</label>
              <input
                type="text"
                name="emailOrPhone"
                value={formData.emailOrPhone}
                onChange={handleChange}
                onKeyDown={(e) => handleKeyDown(e, "emailOrPhone")}
                placeholder="john@example.com or 9876543210"
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="password-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  onKeyDown={(e) => handleKeyDown(e, "password")}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="options-row">
              <label>
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                />
                Remember me
              </label>
              <div className="options-row-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={switchToOtpMode}
                >
                  Login with OTP
                </button>
                <button
                  type="button"
                  onClick={() => setShowForgotPasswordModal(true)}
                  className="forgot-password-link"
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-btn"
              disabled={isLoading}
            >
              {isLoading ? "Signing In..." : `Sign In as ${userType === "buyer" ? "Buyer/Tenant" : userType === "seller" ? "Seller/Owner" : "Agent/Builder"}`}
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={isOtpSent ? handleOtpVerify : handleSendOtp}>
            <div className="form-group">
              <label>Mobile Number</label>
              <input
                type="tel"
                value={otpPhone}
                onChange={(e) => setOtpPhone(e.target.value)}
                placeholder="9876543210"
                disabled={isOtpSent}
                autoComplete="tel"
              />
            </div>

            {isOtpSent ? (
              <>
                <p className="otp-hint success-text">✓ Mobile number verified successfully.</p>
                <button type="button" className="login-btn" disabled={true}>
                  {isLoading ? "Logging in..." : "Verified"}
                </button>
                <button type="button" className="back-to-password-btn" onClick={switchToPasswordMode}>
                  ← Back to Password Login
                </button>
              </>
            ) : (
              <>
                <p className="otp-hint">Sign up first if you don't have an account. Verification via MSG91.</p>
                <button type="submit" className="login-btn" disabled={isOtpSending}>
                  {isOtpSending ? "Opening Widget..." : "Verify & Sign In"}
                </button>
              </>
            )}
          </form>
        )}

        <div className="login-divider">
          <span>or</span>
        </div>

        <div className="google-signin-wrapper">
          <GoogleSignInButton
            userType={userType}
            onSuccess={handleGoogleSuccess}
            onError={(err) => setLoginError(err?.message || "Google sign-in failed.")}
            disabled={isGoogleLoading}
          />
        </div>

        <div className="signup-link">
          Don&apos;t have an account?{" "}
          <button type="button" onClick={() => {
            const registerUrl = returnUrl
              ? `/register?role=${userType}&returnUrl=${encodeURIComponent(returnUrl)}`
              : `/register?role=${userType}`;
            navigate(registerUrl);
          }}>Register now</button>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />

      {/* Add Mobile Modal (after Google sign-in when phone not verified) */}
      <AddMobileModal
        isOpen={showAddMobileModal}
        onClose={() => {
          sessionStorage.removeItem('pendingPhoneVerification');
          setShowAddMobileModal(false);
          navigateToDashboard();
        }}
        onSuccess={async (phone, token) => addPhoneToAccount(phone, token)}
        onSkip={() => navigateToDashboard()}
      />
    </div>
  );
};

export default Login;