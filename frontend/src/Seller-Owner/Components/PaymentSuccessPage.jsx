import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { paymentAPI } from "../../services/api.service";
import "../styles/PaymentSuccessPage.css";

const PaymentSuccessPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    planId,
    plan,
    pendingProperty,
    fromAddProperty,
  } = location.state || {};

  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(null);
  const [paymentId, setPaymentId] = useState(null);

  useEffect(() => {
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !planId) {
      setError("Invalid payment data. Redirecting...");
      setTimeout(() => navigate("/seller-dashboard/plans"), 2000);
      return;
    }

    const verify = async () => {
      try {
        const { data } = await paymentAPI.verify(
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          planId
        );
        setVerified(true);
        setPaymentId(data.payment_id);
      } catch (err) {
        setError(err.message || "Payment verification failed");
      } finally {
        setVerifying(false);
      }
    };

    verify();
  }, [razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, navigate]);

  const handleGoToProperties = () => {
    navigate("/seller-dashboard/properties", {
      state: {
        openAddProperty: true,
        // If the user came from the Add Property flow, restore their form data
        pendingProperty: fromAddProperty ? pendingProperty : null,
        fromAddProperty: !!fromAddProperty,
      },
    });
  };

  if (verifying) {
    return (
      <div className="payment-success-page">
        <div className="payment-success-card">
          <div className="payment-success-loader" />
          <p>Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="payment-success-page">
        <div className="payment-success-card error">
          <div className="payment-success-icon error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2>Verification Failed</h2>
          <p>{error}</p>
          <button onClick={() => navigate("/seller-dashboard/plans")}>
            Back to Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-success-page">
      <div className="payment-success-card">
        <div className="payment-success-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M8 12l3 3 5-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1>Payment Successful!</h1>
        <p className="payment-success-message">
          Your subscription is now active. You can upload your property.
        </p>
        <div className="payment-success-details">
          <div className="payment-detail-row">
            <span>Payment ID</span>
            <span>{paymentId || razorpay_payment_id}</span>
          </div>
          <div className="payment-detail-row">
            <span>Plan</span>
            <span>{plan?.name || "Subscription Plan"}</span>
          </div>
        </div>
        <button className="payment-success-cta" onClick={handleGoToProperties}>
          Upload Property
        </button>
        <button
          className="payment-success-secondary"
          onClick={() => navigate("/seller-dashboard")}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
};

export default PaymentSuccessPage;
