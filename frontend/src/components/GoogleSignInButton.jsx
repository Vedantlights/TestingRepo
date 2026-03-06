import React, { useEffect, useRef } from "react";

// From frontend/.env: REACT_APP_GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

const GoogleSignInButton = ({ userType, onSuccess, onError, disabled, useType = "standard", className = "" }) => {
  const buttonRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (disabled || !buttonRef.current) return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id) {
        setTimeout(initGoogle, 100);
        return;
      }

      if (initializedRef.current) return;
      initializedRef.current = true;

      const handleCredentialResponse = (response) => {
        if (response?.credential) {
          onSuccess(response.credential);
        } else {
          onError?.({ message: "No credential received" });
        }
      };

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          type: useType,
          text: "continue_with",
          shape: "rectangular",
          width: 320,
        });
      } catch (err) {
        console.error("Google Sign-In init error:", err);
        initializedRef.current = false;
        onError?.({ message: "Failed to load Google Sign-In" });
      }
    };

    initGoogle();
  }, [userType, disabled, useType, onSuccess, onError]);

  if (disabled) {
    return (
      <div className={className} style={{ minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading...
      </div>
    );
  }

  return (
    <div
      ref={buttonRef}
      className={className}
      style={{ minHeight: 44 }}
    />
  );
};

export default GoogleSignInButton;
