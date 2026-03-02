import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/PaymentFailedPage.css";

const PaymentFailedPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const error = location.state?.error || "Payment was not completed.";

  return (
    <div className="payment-failed-page">
      <div className="payment-failed-card">
        <div className="payment-failed-icon">
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
              d="M15 9l-6 6M9 9l6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1>Payment Failed</h1>
        <p className="payment-failed-message">{error}</p>
        <button
          className="payment-failed-retry"
          onClick={() => navigate("/seller-dashboard/plans")}
        >
          Try Again
        </button>
        <button
          className="payment-failed-back"
          onClick={() => navigate("/seller-dashboard")}
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default PaymentFailedPage;
