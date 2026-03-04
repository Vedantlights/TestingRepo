import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { paymentAPI } from "../../services/api.service";
import "../styles/CheckoutPage.css";

const PLANS = {
  basic_listing: {
    name: "Basic Plan",
    price: 99,
    features: ["1 property listing", "1 month validity"],
  },
  pro_listing: {
    name: "Pro Plan",
    price: 399,
    features: ["5 property listings", "1 month validity"],
  },
};

const RAZORPAY_KEY_ID = "rzp_live_SN96SBAqxiyzhV";

const CheckoutPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const planId = location.state?.planId || "basic_listing";

  const pendingProperty = location.state?.pendingProperty || null;
  const fromAddProperty = location.state?.fromAddProperty || false;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const plan = PLANS[planId] || PLANS.basic_listing;

  useEffect(() => {
    if (!planId || !PLANS[planId]) {
      navigate("/seller-dashboard/plans");
    }
  }, [planId, navigate]);

  const loadRazorpayScript = () => {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay"));
      document.body.appendChild(script);
    });
  };

  const handlePayNow = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await paymentAPI.createOrder(planId);
      const { order_id, key_id, amount } = data;

      await loadRazorpayScript();

      const options = {
        key: key_id,
        amount,
        currency: "INR",
        name: "360Coordinates",
        description: plan.name,
        order_id,
        handler: (response) => {
          navigate("/seller-dashboard/payment-success", {
            state: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planId,
              plan,
              pendingProperty,
              fromAddProperty,
            },
          });
        },
        prefill: {},
        theme: { color: "#8b5cf6" },
        modal: { ondismiss: () => setLoading(false) },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response) => {
        setError(response.error?.description || "Payment failed");
        setLoading(false);
        navigate("/seller-dashboard/payment-failed", {
          state: { error: response.error?.description },
        });
      });
      rzp.open();
      setLoading(false);
    } catch (err) {
      setError(err.message || "Failed to initiate payment");
      setLoading(false);
    }
  };

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        <header className="checkout-header">
          <h1>Checkout</h1>
          <p>Review your order and proceed to payment</p>
        </header>

        <div className="checkout-card">
          <h2>Order Summary</h2>
          <div className="checkout-summary">
            <div className="checkout-row">
              <span>Plan</span>
              <span className="checkout-value">{plan.name}</span>
            </div>
            <div className="checkout-row">
              <span>Features</span>
              <span className="checkout-features">
                {plan.features.join(" • ")}
              </span>
            </div>
            <div className="checkout-divider" />
            <div className="checkout-row checkout-total">
              <span>Total</span>
              <span className="checkout-price">₹{plan.price}</span>
            </div>
          </div>
          {error && <p className="checkout-error">{error}</p>}
          <button
            className="checkout-pay-btn"
            onClick={handlePayNow}
            disabled={loading}
          >
            {loading ? "Processing..." : "Pay Now"}
          </button>
          <button
            className="checkout-back-btn"
            onClick={() => navigate("/seller-dashboard/plans")}
          >
            ← Back to Plans
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
