import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import "./AddMobileModal.css";

// MSG91 Widget Configuration (SMS Verification)
const MSG91_WIDGET_ID = "356c7067734f373437333438";
const MSG91_AUTH_TOKEN = "481618TcNAx989nvQ69410832P1";

const AddMobileModal = ({ isOpen, onClose, onSuccess, onSkip, onAccessWithPhone, isSignup = false }) => {
  const [phone, setPhone] = useState("");
  const [phoneVerificationToken, setPhoneVerificationToken] = useState(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneAlreadyRegistered, setPhoneAlreadyRegistered] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhone("");
      setPhoneVerificationToken(null);
      setPhoneVerified(false);
      setError("");
      setPhoneAlreadyRegistered(false);
    }
  }, [isOpen]);

  const handleChangeNumber = () => {
    setPhoneVerified(false);
    setPhoneVerificationToken(null);
    setError("");
    setPhoneAlreadyRegistered(false);
  };

  const handleVerifyPhone = () => {
    const digits = phone.replace(/\D/g, "");
    let valid = false;
    let phoneForMsg91 = "";

    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
      valid = true;
      phoneForMsg91 = "91" + digits;
    } else if (digits.length === 12 && digits.startsWith("91")) {
      const num = digits.slice(2);
      if (/^[6-9]\d{9}$/.test(num)) {
        valid = true;
        phoneForMsg91 = digits;
      }
    }

    if (!valid) {
      setError("Enter a valid Indian mobile number (10 digits, starts from 6-9).");
      return;
    }

    setError("");
    if (!window.initSendOTP) {
      setError("Verification widget is loading. Please try again.");
      return;
    }

    try {
      window.initSendOTP({
        widgetId: MSG91_WIDGET_ID,
        tokenAuth: MSG91_AUTH_TOKEN,
        identifier: phoneForMsg91,
        success: (data) => {
          let token = null;
          if (typeof data === "string") token = data;
          else if (data?.token) token = data.token;
          else if (data?.message) token = data.message;
          else if (data?.verificationToken) token = data.verificationToken;
          else token = JSON.stringify(data);
          setPhoneVerificationToken(token);
          setPhoneVerified(true);
        },
        failure: (err) => {
          setError(err?.message || err?.error || "Phone verification failed.");
        },
      });
    } catch (e) {
      setError("Failed to open verification.");
    }
  };

  const handleSubmit = async () => {
    if (!phoneVerified || !phoneVerificationToken) {
      setError("Please verify your phone number first.");
      return;
    }
    const digits = phone.replace(/\D/g, "");
    const formattedPhone = digits.length === 10 ? "+91" + digits : "+" + digits;
    setIsLoading(true);
    setError("");
    try {
      const result = await onSuccess(formattedPhone, phoneVerificationToken);
      handleSubmitResult(result);
    } catch (e) {
      const msg = e?.message || "Something went wrong.";
      setError(msg);
      const isAlreadyRegistered = /already registered/i.test(msg) || e?.status === 409;
      if (isAlreadyRegistered) setPhoneAlreadyRegistered(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitResult = (result) => {
    if (result?.success) {
      onClose();
    } else {
      const msg = result?.message || "Failed to add phone.";
      setError(msg);
      if (/already registered/i.test(msg)) setPhoneAlreadyRegistered(true);
    }
  };

  const handleAccessWithPhone = () => {
    const digits = phone.replace(/\D/g, "");
    const formattedPhone = digits.length === 10 ? "+91" + digits : "+" + digits;
    onAccessWithPhone?.(formattedPhone);
    onClose();
  };

  const isVerificationError = error && /verification failed|verification widget|failed to open|invalid verification/i.test(error);
  const showChangeNumber = error && !phoneAlreadyRegistered;

  if (!isOpen) return null;

  return (
    <div
      className="add-mobile-modal-overlay"
      onClick={() => !isSignup && onClose()}
    >
      <div className="add-mobile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-mobile-modal-header">
          <button
            type="button"
            className="add-mobile-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <h3>{isSignup ? "Verify your mobile number" : "Add Mobile Number"}</h3>
          <p>
            {isSignup
              ? "Please verify your mobile number to complete your registration"
              : "Add your mobile to enable OTP login in the future"}
          </p>
        </div>
        <div className="add-mobile-modal-body">
          {phoneAlreadyRegistered ? (
            <div className="add-mobile-already-registered">
              <p className="add-mobile-already-msg">{error}</p>
              <p className="add-mobile-already-hint">What would you like to do?</p>
              <div className="add-mobile-already-actions">
                <button
                  type="button"
                  className="add-mobile-edit-btn"
                  onClick={handleChangeNumber}
                >
                  Edit Number
                </button>
                <button
                  type="button"
                  className="add-mobile-access-btn"
                  onClick={handleAccessWithPhone}
                >
                  Access account with this number
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="add-mobile-error">
                  {error}
                  {isVerificationError && (
                    <button
                      type="button"
                      className="add-mobile-change-number-link"
                      onClick={handleChangeNumber}
                    >
                      Change number
                    </button>
                  )}
                </div>
              )}
              <div className="add-mobile-form-group">
                <label>Phone Number</label>
                <div className="add-mobile-input-row">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    disabled={phoneVerified}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyPhone}
                    disabled={phoneVerified || isLoading}
                  >
                    {phoneVerified ? "Verified ✓" : "Verify"}
                  </button>
                </div>
                {showChangeNumber && !phoneAlreadyRegistered && (
                  <button
                    type="button"
                    className="add-mobile-change-number-btn"
                    onClick={handleChangeNumber}
                  >
                    Change number
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {!phoneAlreadyRegistered && (
          <div className="add-mobile-modal-footer">
            {!isSignup && (
              <button
                type="button"
                className="add-mobile-skip"
                onClick={() => {
                  onSkip?.();
                  onClose();
                }}
              >
                Skip for now
              </button>
            )}
            <button
              type="button"
              className="add-mobile-submit"
              onClick={handleSubmit}
              disabled={!phoneVerified || isLoading}
            >
              {isLoading ? "Verifying..." : isSignup ? "Verify & Continue" : "Add Phone"}
            </button>
          </div>
        )}
        )}
      </div>
    </div>
  );
};

export default AddMobileModal;
