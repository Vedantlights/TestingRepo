import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/PlansPage.css";

const PLANS = [
  {
    id: "basic_listing",
    name: "Basic Plan",
    price: 99,
    features: ["1 property listing", "1 month validity", "Basic visibility"],
  },
  {
    id: "pro_listing",
    name: "Pro Plan",
    price: 399,
    features: ["5 property listings", "1 month validity", "Priority visibility"],
    popular: true,
  },
];

const PlansPage = () => {
  const navigate = useNavigate();

  const handleSelectPlan = (planId) => {
    navigate("/seller-dashboard/checkout", { state: { planId } });
  };

  return (
    <div className="plans-page">
      <div className="plans-container">
        <header className="plans-header">
          <h1>Choose Your Plan</h1>
          <p>Select a plan to list your properties and reach potential buyers</p>
        </header>

        <div className="plans-grid">
          {PLANS.map((plan) => (
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
