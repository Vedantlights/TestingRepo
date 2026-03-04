// src/pages/SellerOverview.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProperty } from "./PropertyContext";
import { useAuth } from "../../context/AuthContext";
import AddPropertyPopup from "./AddPropertyPopup";
import "../styles/SellerOverview.css";

const MAX_PROPERTIES = 10;

const SellerOverview = ({ onNavigate }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { properties, inquiries, getStats, refreshProperties, loading, error } = useProperty();
  const [showPopup, setShowPopup] = useState(false);

  const stats = getStats();

  // Refresh properties when component mounts or comes into focus (to get updated views)
  useEffect(() => {
    const handleFocus = () => {
      if (refreshProperties) {
        refreshProperties();
      }
    };
    
    // Refresh on mount
    if (refreshProperties) {
      refreshProperties();
    }
    
    // Refresh when window comes into focus (user returns to tab)
    window.addEventListener('focus', handleFocus);
    
    // Also refresh periodically (every 30 seconds) to get updated view counts
    const interval = setInterval(() => {
      if (refreshProperties) {
        refreshProperties();
      }
    }, 30000); // 30 seconds
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [refreshProperties]);

  const handleAddProperty = () => {
    if (properties.length >= MAX_PROPERTIES) {
      alert(`You can add maximum ${MAX_PROPERTIES} properties.`);
      return;
    }
    setShowPopup(true);
  };

  const formatPrice = (price) => {
    const num = parseFloat(price);
    if (num >= 10000000) {
      return `₹${(num / 10000000).toFixed(2)} Cr`;
    } else if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} Lac`;
    } else if (num >= 1000) {
      return `₹${(num / 1000).toFixed(1)}K`;
    }
    return `₹${num}`;
  };

  const formatNumber = (num) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num;
  };

  const getTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const recentInquiries = inquiries
    .filter(i => i.status === 'new')
    .slice(0, 4);

  if (loading && properties.length === 0) {
    return (
      <div className="seller-overview">
        <div className="seller-overview-header">
          <h1>Dashboard</h1>
          <p className="seller-overview-subtitle">Loading your properties...</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px', color: '#64748b' }}>
          <div className="seller-overview-stat-value">Loading...</div>
        </div>
      </div>
    );
  }

  if (error && properties.length === 0) {
    return (
      <div className="seller-overview">
        <div className="seller-overview-header">
          <h1>Dashboard</h1>
          <p className="seller-overview-subtitle" style={{ color: '#ef4444' }}>{error}</p>
        </div>
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <button 
            className="seller-overview-add-btn" 
            onClick={() => refreshProperties && refreshProperties()}
            style={{ margin: '0 auto' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="seller-overview">
      {/* Welcome Header */}
      <div className="seller-overview-header">
        <div className="seller-overview-header-content">
          <div className="seller-overview-greeting">
            <h1>
              Welcome Back, {user?.full_name?.split(' ')[0] || user?.first_name || 'User'} <span style={{color: 'red'}}>❤️</span>
            </h1>
            <p className="seller-overview-subtitle">Here's what's happening with your properties today</p>
          </div>
          <button className="seller-overview-add-btn" onClick={handleAddProperty}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>Add New Property</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="seller-overview-stats-grid">
        <div 
          className="seller-overview-stat-card seller-overview-stat-primary" 
          onClick={() => onNavigate && onNavigate('properties')}
          style={{ cursor: 'pointer' }}
        >
          <div className="seller-overview-stat-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2"/>
              <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <div className="seller-overview-stat-content">
            <span className="seller-overview-stat-label">Total Listings</span>
            <div className="seller-overview-stat-value-row">
              <span className="seller-overview-stat-value">{stats.totalProperties}</span>
              <span className="seller-overview-stat-badge seller-overview-badge-success">{stats.activeListings} Active</span>
            </div>
            {(stats.pendingApproval > 0) && (
              <p className="seller-overview-stat-hint" style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '4px' }}>
                {stats.pendingApproval} pending approval
              </p>
            )}
          </div>
        </div>

        <div className="seller-overview-stat-card">
          <div className="seller-overview-stat-icon-wrapper seller-overview-icon-blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <div className="seller-overview-stat-content">
            <span className="seller-overview-stat-label">People Showed Interest</span>
            <div className="seller-overview-stat-value-row">
              <span className="seller-overview-stat-value">{formatNumber(stats.totalViews)}</span>
              <span className="seller-overview-stat-change seller-overview-change-positive">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {stats.totalViews > 0 ? 'Active' : 'No views yet'}
              </span>
            </div>
            <p className="seller-overview-stat-hint" style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
              {stats.totalViews > 0 
                ? `${stats.totalViews} ${stats.totalViews === 1 ? 'person has' : 'people have'} viewed your properties`
                : 'Share your properties to get more views'}
            </p>
          </div>
        </div>

        <div 
          className="seller-overview-stat-card" 
          onClick={() => onNavigate && onNavigate('inquiries')}
          style={{ cursor: 'pointer' }}
        >
          <div className="seller-overview-stat-icon-wrapper seller-overview-icon-green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <div className="seller-overview-stat-content">
            <span className="seller-overview-stat-label">Total Inquiries</span>
            <div className="seller-overview-stat-value-row">
              <span className="seller-overview-stat-value">{stats.totalInquiries}</span>
              {stats.newInquiries > 0 && (
                <span className="seller-overview-stat-badge seller-overview-badge-warning">{stats.newInquiries} New</span>
              )}
            </div>
          </div>
        </div>

        <div className="seller-overview-stat-card">
          <div className="seller-overview-stat-icon-wrapper seller-overview-icon-orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="seller-overview-stat-content">
            <span className="seller-overview-stat-label">Listing Status</span>
            <div className="seller-overview-status-pills">
              <span className="seller-overview-status-pill seller-overview-pill-sale">{stats.forSale} Sale</span>
              <span className="seller-overview-status-pill seller-overview-pill-rent">{stats.forRent} Rent</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="seller-overview-quick-actions">
        <h2 className="seller-overview-section-title">Quick Actions</h2>
        <div className="seller-overview-actions-grid">
          <button className="seller-overview-action-card" onClick={handleAddProperty}>
            <div className="seller-overview-action-icon seller-overview-action-add">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="seller-overview-action-title">Add New Property</span>
            <span className="seller-overview-action-desc">List a new property for sale or rent</span>
          </button>

          <button className="seller-overview-action-card" onClick={() => onNavigate && onNavigate('properties')}>
            <div className="seller-overview-action-icon seller-overview-action-manage">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="seller-overview-action-title">Manage Properties</span>
            <span className="seller-overview-action-desc">Edit, update or remove listings</span>
          </button>

          <button className="seller-overview-action-card" onClick={() => onNavigate && onNavigate('inquiries')}>
            <div className="seller-overview-action-icon seller-overview-action-inquiries">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="seller-overview-action-title">View Inquiries</span>
            <span className="seller-overview-action-desc">Respond to buyer inquiries</span>
          </button>

          <button
            type="button"
            className="seller-overview-action-card seller-leads-stat-btn"
            onClick={() => navigate('/seller-dashboard/inquiries')}
            title="View leads from buyers who viewed your contact details"
          >
            <div className="seller-overview-action-icon seller-overview-action-leads">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2"/>
                <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="seller-overview-action-title">Leads</span>
            <span className="seller-overview-action-desc">View leads from buyers who viewed your contact details</span>
          </button>

          <button className="seller-overview-action-card" onClick={() => onNavigate && onNavigate('profile')}>
            <div className="seller-overview-action-icon seller-overview-action-profile">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="seller-overview-action-title">Update Profile</span>
            <span className="seller-overview-action-desc">Manage your account settings</span>
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="seller-overview-content-grid">
        {/* Recent Properties */}
        <div className="seller-overview-properties-section">
          <div className="seller-overview-section-header">
            <h2 className="seller-overview-section-title">Your Properties</h2>
            <button className="seller-overview-view-all-btn" onClick={() => onNavigate && onNavigate('properties')}>
              View All
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="seller-overview-properties-list">
            {properties.length === 0 ? (
              <div className="seller-overview-empty-state">
                <div className="seller-overview-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </div>
                <h3>No Properties Listed</h3>
                <p>Start by adding your first property</p>
                <button className="seller-overview-empty-action-btn" onClick={handleAddProperty}>
                  Add Property
                </button>
              </div>
            ) : (
              properties.slice(0, 3).map((property, index) => (
                <div 
                  className="seller-overview-property-item" 
                  key={property.id}
                  style={{ animationDelay: `${index * 0.1}s`, cursor: 'pointer' }}
                  onClick={() => window.open(`/seller-dashboard/details/${property.id}`, '_blank', 'noopener,noreferrer')}
                >
                  <div className="seller-overview-property-thumbnail">
                    <img src={property.images?.[0]} alt={property.title} />
                    <span className={`seller-overview-property-badge ${property.status === 'sale' ? 'seller-overview-badge-sale' : 'seller-overview-badge-rent'}`}>
                      {property.status === 'sale' ? 'For Sale' : 'For Rent'}
                    </span>
                  </div>
                  <div className="seller-overview-property-info">
                    <h4 className="seller-overview-property-title">{property.title}</h4>
                    <p className="seller-overview-property-location">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2"/>
                        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      {property.location}
                    </p>
                    <div className="seller-overview-property-stats">
                      <span className="seller-overview-property-stat-item" title={`${property.views || 0} people showed interest`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2"/>
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                        {property.views || 0} {property.views === 1 ? 'person' : 'people'} interested
                      </span>
                      <span className="seller-overview-property-stat-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                        {property.inquiries || 0} inquiries
                      </span>
                    </div>
                  </div>
                  <div className="seller-overview-property-price">
                    <span className="seller-overview-price">{formatPrice(property.price)}</span>
                    {property.status === 'rent' && <span className="seller-overview-per-month">/month</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Inquiries */}
        <div className="seller-overview-inquiries-section">
          <div className="seller-overview-section-header">
            <h2 className="seller-overview-section-title">
              Recent Inquiries
              {stats.newInquiries > 0 && (
                <span className="seller-overview-title-badge">{stats.newInquiries}</span>
              )}
            </h2>
            <button className="seller-overview-view-all-btn" onClick={() => onNavigate && onNavigate('inquiries')}>
              View All
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="seller-overview-inquiries-list">
            {recentInquiries.length === 0 ? (
              <div className="seller-overview-empty-state seller-overview-empty-small">
                <p>No new inquiries</p>
              </div>
            ) : (
              recentInquiries.map((inquiry, index) => (
                <div 
                  className="seller-overview-inquiry-item" 
                  key={inquiry.id}
                  style={{ animationDelay: `${index * 0.1}s`, cursor: 'pointer' }}
                  onClick={() => {
                    // Navigate to inquiries page with inquiry ID as query parameter
                    navigate(`/seller-dashboard/inquiries?inquiryId=${inquiry.id}`);
                  }}
                >
                  <div className="seller-overview-inquiry-avatar">
                    {inquiry.buyerProfileImage ? (
                      <img src={inquiry.buyerProfileImage} alt={inquiry.buyerName} />
                    ) : (inquiry.avatar && (inquiry.avatar.startsWith('http://') || inquiry.avatar.startsWith('https://'))) ? (
                      <img src={inquiry.avatar} alt={inquiry.buyerName} />
                    ) : (
                      inquiry.avatar || (inquiry.buyerName ? inquiry.buyerName.charAt(0).toUpperCase() : 'U')
                    )}
                  </div>
                  <div className="seller-overview-inquiry-content">
                    <div className="seller-overview-inquiry-header">
                      <span className="seller-overview-inquiry-name">{inquiry.buyerName}</span>
                      <span className="seller-overview-inquiry-time">{getTimeAgo(inquiry.createdAt)}</span>
                    </div>
                    <p className="seller-overview-inquiry-property">{inquiry.propertyTitle}</p>
                    <p className="seller-overview-inquiry-message">{inquiry.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Property Popup */}
      {showPopup && <AddPropertyPopup onClose={() => setShowPopup(false)} />}
    </div>
  );
};

export default SellerOverview;
