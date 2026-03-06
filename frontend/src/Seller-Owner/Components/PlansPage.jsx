import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { plansAPI } from "../../services/api.service";
import "../styles/PlansPage.css";

const PlansPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const pendingProperty = location.state?.pendingProperty || null;
  const fromAddProperty = location.state?.fromAddProperty || false;

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await plansAPI.list();
        const backendPlans = response?.data?.plans || [];
        const mapped = backendPlans.map((p) => ({
          id: p.code,
          name: p.name,
          price: Math.round((p.price_in_paise || 0) / 100),
          features: p.features || [],
          popular: p.is_popular,
        }));
        setPlans(mapped);
      } catch (err) {
        console.error("Failed to load plans:", err);
        setError("Failed to load plans. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  const handleSelectPlan = (planId) => {
    navigate("/seller-dashboard/checkout", {
      state: {
        planId,
        pendingProperty,
        fromAddProperty,
      },
    });
  };

  if (loading) {
    return (
      <div className="plans-page">
        <div className="plans-container">
          <p style={{ textAlign: "center", padding: "2rem" }}>Loading plans...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="plans-page">
        <div className="plans-container">
          <p style={{ textAlign: "center", padding: "2rem", color: "#ef4444" }}>{error}</p>
          <button style={{ display: "block", margin: "0 auto" }} onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="plans-page">
      <div className="plans-container">
        <header className="plans-header">
          <h1>Choose Your Plan</h1>
          <p>Select a plan to list your properties and reach potential buyers</p>
        </header>

        <div className="plans-grid">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`plans-card ${plan.popular ? "popular" : ""}`}
            >
              {plan.popular && <span className="plans-badge">Most Popular</span>}
              <h2>{plan.name}</h2>
              <div className="plans-price">
                <span className="plans-currency">₹</span>
                <span className="plans-amount">{plan.price}</span>
                <span className="plans-period">/month</span>
              </div>
              <p className="plans-gst">+ 18% GST</p>
              <ul className="plans-features">
                {plan.features.map((f, i) => (
                  <li key={i}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M20 6L9 17l-5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className="plans-cta"
                onClick={() => handleSelectPlan(plan.id)}
              >
                Proceed to Checkout
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlansPage;
