import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { paymentAPI, plansAPI } from "../../services/api.service";
import "../styles/CheckoutPage.css";

const RAZORPAY_KEY_ID = "rzp_test_SMDn9pa64AbZIb";

const CheckoutPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const planId = location.state?.planId || "basic_listing";

  const pendingProperty = location.state?.pendingProperty || null;
  const fromAddProperty = location.state?.fromAddProperty || false;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setPlansLoading(true);
        setPlansError(null);
        const response = await plansAPI.list();
        const backendPlans = response?.data?.plans || [];
        const mapped = backendPlans.map((p) => {
          const priceRupees = Math.round((p.price_in_paise || 0) / 100);
          const properties = p.properties_limit || 0;
          const months = p.duration_months || 1;

          const features = [
            `${properties || 0} property listing${properties === 1 ? "" : "s"}`,
            `${months || 1} month${months === 1 ? "" : "s"} validity`,
          ];

          return {
            id: p.code,
            name: p.name,
            price: priceRupees,
            features,
            raw: p,
          };
        });
        setPlans(mapped);
      } catch (err) {
        console.error("Failed to load plans in checkout:", err);
        setPlansError(
          err.message ||
            "Failed to load plan details. Please go back and select a plan again."
        );
        setPlans([]);
      } finally {
        setPlansLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const plan = useMemo(() => {
    if (!plans.length) return null;
    return plans.find((p) => p.id === planId) || plans[0];
  }, [plans, planId]);

  useEffect(() => {
    if (!planId) {
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
      if (plansLoading || !plan) {
        setError("Plan details are still loading. Please wait a moment.");
        setLoading(false);
        return;
      }

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
