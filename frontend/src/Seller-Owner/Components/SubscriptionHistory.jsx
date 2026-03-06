import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sellerSubscriptionAPI } from "../../services/api.service";
import "../styles/SubscriptionHistory.css";

const SubscriptionHistory = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await sellerSubscriptionAPI.getHistory();
        if (response.success) {
          setData(response.data);
        } else {
          setError(response.message || "Failed to load subscription data.");
        }
      } catch (err) {
        console.error("Subscription history error:", err);
        setError(err.message || "Failed to load subscription data.");
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatPrice = (price) => {
    if (!price) return "Free";
    return `₹${Number(price).toLocaleString("en-IN")}`;
  };

  const isSubExpired = (sub) => {
    if (!sub.end_date) return false;
    return new Date(sub.end_date) < new Date();
  };

  const getStatusBadge = (sub) => {
    if (!isSubExpired(sub)) return { label: "Active", cls: "active" };
    return { label: "Expired", cls: "expired" };
  };

  if (loading) {
    return (
      <div className="sub-history-page">
        <div className="sub-history-container">
          <div className="sub-history-loading">
            <div className="sub-history-spinner" />
            <p>Loading subscription details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sub-history-page">
        <div className="sub-history-container">
          <div className="sub-history-error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const { active_subscription, history, active_properties, summary } = data;

  const activeSubscriptions = (history || []).filter((sub) => !isSubExpired(sub));

  return (
    <div className="sub-history-page">
      <div className="sub-history-container">
        {/* Header */}
        <header className="sub-history-header">
          <div>
            <h1>My Subscriptions</h1>
            <p>Manage your plan, track usage, and view billing history</p>
          </div>
          <button
            className="sub-history-upgrade-btn"
            onClick={() => navigate("/seller-dashboard/plans")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            {active_subscription ? "Change Plan" : "Buy a Plan"}
          </button>
        </header>

        {/* Section Tabs */}
        <div className="sub-history-tabs">
          {["overview", "properties", "history"].map((tab) => (
            <button
              key={tab}
              className={`sub-history-tab ${activeSection === tab ? "active" : ""}`}
              onClick={() => setActiveSection(tab)}
            >
              {tab === "overview" && "Overview"}
              {tab === "properties" && `Properties (${active_properties?.length || 0})`}
              {tab === "history" && `Billing History (${history?.length || 0})`}
            </button>
          ))}
        </div>

        {/* OVERVIEW SECTION */}
        {activeSection === "overview" && (
          <div className="sub-history-overview">
            {/* Active Plan Cards — one card per non-expired subscription */}
            {activeSubscriptions.length > 0 ? (
              activeSubscriptions.map((sub) => {
                const daysLeft = sub.end_date
                  ? Math.max(0, Math.ceil((new Date(sub.end_date) - new Date()) / 86400000))
                  : 0;

                return (
                  <div key={sub.id} className="sub-history-active-card">
                    <div className="sub-history-active-top">
                      <div className="sub-history-plan-info">
                        <span className="sub-history-plan-badge active">Active Plan</span>
                        <h2>{sub.plan_name}</h2>
                        <p className="sub-history-plan-price">
                          {formatPrice(sub.price)}
                          <span>/month</span>
                        </p>
                      </div>
                      <div className="sub-history-plan-validity">
                        <div className="sub-history-days-circle">
                          <span className="sub-history-days-number">{daysLeft}</span>
                          <span className="sub-history-days-label">days left</span>
                        </div>
                      </div>
                    </div>

                    <div className="sub-history-active-details">
                      <div className="sub-history-detail-row">
                        <span className="sub-history-detail-label">Plan Period</span>
                        <span className="sub-history-detail-value">
                          {formatDate(sub.start_date)} — {formatDate(sub.end_date)}
                        </span>
                      </div>
                      <div className="sub-history-detail-row">
                        <span className="sub-history-detail-label">Payment ID</span>
                        <span className="sub-history-detail-value sub-history-mono">
                          {sub.payment_id || "—"}
                        </span>
                      </div>
                      {sub.property_names && sub.property_names.length > 0 && (
                        <div className="sub-history-detail-row sub-history-properties-row">
                          <span className="sub-history-detail-label">Properties Uploaded</span>
                          <div className="sub-history-property-names">
                            {sub.property_names.map((p) => (
                              <span key={p.id} className="sub-history-property-tag">{p.title}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {sub.features && sub.features.length > 0 && (
                        <div className="sub-history-features">
                          <span className="sub-history-detail-label">Features</span>
                          <ul>
                            {sub.features.map((f, i) => (
                              <li key={i}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                  <path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="sub-history-no-plan">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="5" width="20" height="14" rx="2" stroke="#94a3b8" strokeWidth="1.5" />
                  <path d="M2 10h20" stroke="#94a3b8" strokeWidth="1.5" />
                  <path d="M6 15h4M14 15h4" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <h3>No Active Plan</h3>
                <p>Purchase a plan to start listing your properties and reach buyers.</p>
                <button onClick={() => navigate("/seller-dashboard/plans")}>
                  Browse Plans
                </button>
              </div>
            )}

            {/* Usage Stats Cards */}
            <div className="sub-history-stats-grid">
              <div className="sub-history-stat-card">
                <div className="sub-history-stat-icon blue">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" />
                    <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <div className="sub-history-stat-content">
                  <span className="sub-history-stat-number">{summary.properties_used}</span>
                  <span className="sub-history-stat-label">Properties Used</span>
                </div>
                <div className="sub-history-stat-sub">
                  of {summary.properties_limit || "0"} allowed
                </div>
              </div>

              <div className="sub-history-stat-card">
                <div className="sub-history-stat-icon green">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="sub-history-stat-content">
                  <span className="sub-history-stat-number">{summary.remaining_uploads}</span>
                  <span className="sub-history-stat-label">Remaining Uploads</span>
                </div>
                <div className="sub-history-stat-sub">available to list</div>
              </div>

              <div className="sub-history-stat-card">
                <div className="sub-history-stat-icon purple">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="sub-history-stat-content">
                  <span className="sub-history-stat-number">{summary.days_left}</span>
                  <span className="sub-history-stat-label">Days Remaining</span>
                </div>
                <div className="sub-history-stat-sub">
                  {activeSubscriptions.length > 0
                    ? `expires ${formatDate(activeSubscriptions[0].end_date)}`
                    : "no active plan"}
                </div>
              </div>

              <div className="sub-history-stat-card">
                <div className="sub-history-stat-icon orange">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" />
                    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" />
                    <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" />
                    <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <div className="sub-history-stat-content">
                  <span className="sub-history-stat-number">{summary.total_subscriptions}</span>
                  <span className="sub-history-stat-label">Total Plans Purchased</span>
                </div>
                <div className="sub-history-stat-sub">all time</div>
              </div>
            </div>

            {/* Usage Progress */}
            {activeSubscriptions.length > 0 && summary.properties_limit > 0 && (
              <div className="sub-history-progress-card">
                <h3>Property Upload Usage</h3>
                <div className="sub-history-progress-bar-wrap">
                  <div
                    className="sub-history-progress-bar"
                    style={{
                      width: `${Math.min(100, (summary.properties_used / summary.properties_limit) * 100)}%`,
                    }}
                  />
                </div>
                <div className="sub-history-progress-info">
                  <span>
                    {summary.properties_used} / {summary.properties_limit} properties used
                  </span>
                  <span className={summary.remaining_uploads === 0 ? "sub-history-text-red" : "sub-history-text-green"}>
                    {summary.remaining_uploads === 0
                      ? "Limit reached — upgrade your plan"
                      : `${summary.remaining_uploads} remaining`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PROPERTIES SECTION */}
        {activeSection === "properties" && (
          <div className="sub-history-properties">
            {active_properties && active_properties.length > 0 ? (
              <>
                <p className="sub-history-section-desc">
                  Properties listed under your active plans. Each property is valid until its plan expires.
                </p>
                <div className="sub-history-prop-list">
                  {active_properties.map((prop) => (
                    <div key={prop.id} className="sub-history-prop-card">
                      <div className="sub-history-prop-image">
                        {prop.cover_image ? (
                          <img src={prop.cover_image} alt={prop.title} />
                        ) : (
                          <div className="sub-history-prop-placeholder">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="#94a3b8" strokeWidth="1.5" />
                            </svg>
                          </div>
                        )}
                        <span className={`sub-history-prop-status ${prop.is_active ? "live" : "paused"}`}>
                          {prop.is_active ? "Live" : "Paused"}
                        </span>
                      </div>
                      <div className="sub-history-prop-details">
                        <h4>{prop.title}</h4>
                        <div className="sub-history-prop-meta">
                          <span>{prop.property_type}</span>
                          <span className="sub-history-dot" />
                          <span>{prop.listing_type === "sale" ? "For Sale" : "For Rent"}</span>
                          <span className="sub-history-dot" />
                          <span>{prop.location}</span>
                        </div>
                        <div className="sub-history-prop-price">{formatPrice(prop.price)}</div>
                        {prop.plan_name && (
                          <div className="sub-history-prop-plan">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                            </svg>
                            {prop.plan_name}
                          </div>
                        )}
                        <div className="sub-history-prop-footer">
                          <span className="sub-history-prop-views">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" />
                              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                            </svg>
                            {prop.views} views
                          </span>
                          <span className="sub-history-prop-date">Listed {formatDate(prop.listed_on)}</span>
                        </div>
                        <div className="sub-history-prop-validity">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                            <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          Valid until {formatDate(prop.valid_until)} — <strong>{prop.days_remaining} days left</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="sub-history-empty">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="#94a3b8" strokeWidth="1.5" />
                  <polyline points="9,22 9,12 15,12 15,22" stroke="#94a3b8" strokeWidth="1.5" />
                </svg>
                <h3>No Properties Listed</h3>
                <p>
                  {activeSubscriptions.length > 0
                    ? "You haven't listed any properties under your active plans yet."
                    : "Purchase a plan to start listing properties."}
                </p>
                <button onClick={() => navigate(activeSubscriptions.length > 0 ? "/seller-dashboard/properties" : "/seller-dashboard/plans")}>
                  {activeSubscriptions.length > 0 ? "Add Property" : "Browse Plans"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* BILLING HISTORY SECTION */}
        {activeSection === "history" && (
          <div className="sub-history-billing">
            {history && history.length > 0 ? (
              <div className="sub-history-timeline">
                {history.map((sub, idx) => {
                  const badge = getStatusBadge(sub);
                  return (
                    <div key={sub.id} className={`sub-history-timeline-item ${idx === 0 ? "first" : ""}`}>
                      <div className="sub-history-timeline-dot">
                        <div className={`sub-history-dot-inner ${badge.cls}`} />
                      </div>
                      <div className="sub-history-timeline-card">
                        <div className="sub-history-timeline-top">
                          <div>
                            <h4>{sub.plan_name}</h4>
                            <span className={`sub-history-status-badge ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </div>
                          <span className="sub-history-timeline-price">{formatPrice(sub.price)} <span className="sub-history-gst-tag">+18% GST</span></span>
                        </div>
                        <div className="sub-history-timeline-details">
                          <div className="sub-history-timeline-row">
                            <span>Period</span>
                            <span>{formatDate(sub.start_date)} — {formatDate(sub.end_date)}</span>
                          </div>
                          <div className="sub-history-timeline-row">
                            <span>Duration</span>
                            <span>{sub.duration_months} month{sub.duration_months > 1 ? "s" : ""}</span>
                          </div>
                          <div className="sub-history-timeline-row">
                            <span>Properties Used</span>
                            <span>{sub.properties_used} / {sub.properties_limit}</span>
                          </div>
                          {sub.payment_id && (
                            <div className="sub-history-timeline-row">
                              <span>Payment ID</span>
                              <span className="sub-history-mono">{sub.payment_id}</span>
                            </div>
                          )}
                          {sub.order_id && (
                            <div className="sub-history-timeline-row">
                              <span>Order ID</span>
                              <span className="sub-history-mono">{sub.order_id}</span>
                            </div>
                          )}
                          <div className="sub-history-timeline-row">
                            <span>Purchased</span>
                            <span>{formatDate(sub.purchased_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="sub-history-empty">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="5" width="20" height="14" rx="2" stroke="#94a3b8" strokeWidth="1.5" />
                  <path d="M2 10h20" stroke="#94a3b8" strokeWidth="1.5" />
                </svg>
                <h3>No Billing History</h3>
                <p>You haven't purchased any plans yet.</p>
                <button onClick={() => navigate("/seller-dashboard/plans")}>Browse Plans</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionHistory;
