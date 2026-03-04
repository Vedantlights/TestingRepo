// src/pages/SellerProperties.jsx
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useProperty } from "./PropertyContext";
import AddPropertyPopup from "./AddPropertyPopup";
import DeletePropertyModal from "../../components/DeletePropertyModal/DeletePropertyModal";
import { API_BASE_URL } from "../../config/api.config";
import { sellerDashboardAPI } from "../../services/api.service";
import "../styles/SellerProperties.css";

const MAX_PROPERTIES = 3;

// Plan limits for paid listing plans
const PLAN_LIMITS = { basic_listing: 1, pro_listing: 5 };

const SellerProperties = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { properties, deleteProperty } = useProperty();
  const [canAddProperty, setCanAddProperty] = useState(false);
  const [maxAllowedProperties, setMaxAllowedProperties] = useState(MAX_PROPERTIES);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState(null);
  const [pendingProperty, setPendingProperty] = useState(null);

  // Check if user can add property (active paid plan with slots)
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data } = await sellerDashboardAPI.getStats();
        const sub = data?.subscription;
        const totalProps = data?.total_properties ?? properties.length;
        const endDate = sub?.end_date ? new Date(sub.end_date) : null;
        const isActive = endDate && endDate > new Date();
        const planType = sub?.plan_type;

        if (planType && PLAN_LIMITS[planType] !== undefined && isActive) {
          const limit = PLAN_LIMITS[planType];
          setMaxAllowedProperties(limit);
          setCanAddProperty(totalProps < limit);
        } else {
          setCanAddProperty(false);
          setMaxAllowedProperties(0);
        }
      } catch {
        setCanAddProperty(false);
      } finally {
        setCheckingAccess(false);
      }
    };
    checkAccess();
  }, [properties.length]);

  // Open Add Property form when navigating from payment success
  useEffect(() => {
    const state = location.state || {};

    // Capture any pending property data passed through navigation (after payment)
    if (state.pendingProperty) {
      setPendingProperty(state.pendingProperty);
    }

    if (state.openAddProperty && canAddProperty && !checkingAccess) {
      setEditIndex(null);
      setShowForm(true);
      // Clear navigation state so the popup doesn't reopen on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, canAddProperty, checkingAccess, location.pathname, navigate]);

  // Filter and sort properties - memoized for performance
  const filteredProperties = useMemo(() => {
    return properties
      .filter(p => {
        const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
        const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             p.location.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'newest':
            return new Date(b.createdAt) - new Date(a.createdAt);
          case 'oldest':
            return new Date(a.createdAt) - new Date(b.createdAt);
          case 'price-high':
            return parseFloat(b.price) - parseFloat(a.price);
          case 'price-low':
            return parseFloat(a.price) - parseFloat(b.price);
          default:
            return 0;
        }
      });
  }, [properties, filterStatus, searchTerm, sortBy]);

  const openNew = useCallback(() => {
    if (checkingAccess) return;
    if (!canAddProperty) {
      navigate('/seller-dashboard/plans');
      return;
    }
    if (properties.length >= maxAllowedProperties) {
      alert(`You have reached your plan limit (${maxAllowedProperties}). Upgrade to add more.`);
      return;
    }
    setEditIndex(null);
    setShowForm(true);
  }, [properties.length, canAddProperty, maxAllowedProperties, checkingAccess, navigate]);

  const openEdit = useCallback((idx) => {
    setEditIndex(idx);
    setShowForm(true);
  }, []);

  const handleDeleteClick = useCallback((id) => {
    setPropertyToDelete(id);
    setDeleteModalOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!propertyToDelete) return;
    try {
      await deleteProperty(propertyToDelete);
      setPropertyToDelete(null);
    } catch (error) {
      console.error('Error deleting property:', error);
      alert('Failed to delete property. Please try again.');
    }
  }, [propertyToDelete, deleteProperty]);

  const handleViewDetails = useCallback((propertyId) => {
    console.log('Navigating to property:', propertyId);
    // Navigate to seller dashboard details route to keep seller navbar - open in new tab
    const path = `/seller-dashboard/details/${propertyId}`;
    console.log('Navigation path:', path);
    window.open(path, '_blank', 'noopener,noreferrer');
  }, []);

  // Helper function to check if property is older than 24 hours
  const isPropertyOlderThan24Hours = useCallback((property) => {
    if (!property || !property.createdAt) {
      return false; // If no timestamp, assume it's new (backward compatibility)
    }
    
    const createdAt = new Date(property.createdAt);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceCreation >= 24;
  }, []);

  const formatPrice = useCallback((price) => {
    const num = parseFloat(price);
    if (num >= 10000000) {
      return `₹${(num / 10000000).toFixed(2)} Cr`;
    } else if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} Lac`;
    } else if (num >= 1000) {
      return `₹${(num / 1000).toFixed(1)}K`;
    }
    return `₹${num}`;
  }, []);

  const getPropertyIndex = useCallback((propertyId) => {
    return properties.findIndex(p => p.id === propertyId);
  }, [properties]);

  return (
    <div className="seller-properties">
      {/* Header */}
      <div className="seller-props-header">
        <div className="seller-props-header-content">
          <div>
            <h1>My Properties</h1>
            <p className="seller-props-subtitle">
              {canAddProperty
                ? `${properties.length} of ${maxAllowedProperties} properties listed`
                : `${properties.length} properties • Choose a plan to add more`}
            </p>
          </div>
          <button className="seller-props-add-btn" onClick={openNew}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Add Property
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="seller-props-toolbar">
        <div className="seller-props-search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search properties..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="seller-props-toolbar-actions">
          <div className="seller-props-filter-group">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="sale">For Sale</option>
              <option value="rent">For Rent</option>
            </select>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="price-high">Price: High to Low</option>
              <option value="price-low">Price: Low to High</option>
            </select>
          </div>

          <div className="seller-props-view-toggle">
            <button 
              className={`seller-props-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>
            <button 
              className={`seller-props-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Properties Grid/List */}
      {filteredProperties.length === 0 ? (
        <div className="seller-props-empty-state">
          <div className="seller-props-empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </div>
          <h3>No Properties Found</h3>
          <p>
            {searchTerm || filterStatus !== 'all'
              ? 'Try adjusting your filters'
              : 'Start by adding your first property listing'}
          </p>
          {!searchTerm && filterStatus === 'all' && (
            <button className="seller-props-empty-action-btn" onClick={openNew}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Add Your First Property
            </button>
          )}
        </div>
      ) : (
        <div className={`seller-props-container ${viewMode}`}>
          {filteredProperties.map((property, index) => (
            <div 
              key={property.id} 
              className={`seller-props-card ${viewMode}`}
              style={{ animationDelay: `${index * 0.05}s`, cursor: 'pointer' }}
              onClick={() => handleViewDetails(property.id)}
            >
              <div className="seller-props-image">
                <img 
                  src={(() => {
                    // Prioritize display_image, then first image, then cover_image
                    const imageUrl = property.display_image 
                      || property.images?.[0] 
                      || property.cover_image;
                    if (!imageUrl) return 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=500';
                    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                      return imageUrl;
                    }
                    if (imageUrl.startsWith('/')) {
                      return `${API_BASE_URL.replace('/api', '')}${imageUrl}`;
                    }
                    return `${API_BASE_URL.replace('/api', '')}/uploads/${imageUrl}`;
                  })()} 
                  alt={property.title} 
                  onError={(e) => {
                    console.error('Image load failed for property:', property.id, 'URL:', e.target.src);
                    e.target.src = 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=500';
                  }}
                />
                <div className="seller-props-image-overlay">
                  <button 
                    className="seller-props-overlay-btn" 
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(getPropertyIndex(property.id));
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </button>
                  <button 
                    className="seller-props-overlay-btn delete" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(property.id);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </button>
                </div>
                <span className={`seller-props-badge ${property.status}`}>
                  {property.status === 'sale' ? 'For Sale' : 'For Rent'}
                </span>
                {property.featured && (
                  <span className="seller-props-featured-badge">Featured</span>
                )}
              </div>

              <div className="seller-props-content">
                <h3 className="seller-props-title">{property.title}</h3>
                <p className="seller-props-location">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  {property.location}
                </p>

                <div className="seller-props-features">
                  <span className="seller-props-feature">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M3 22V8l9-6 9 6v14H3z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M9 22v-6h6v6" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    {property.bedrooms} Beds
                  </span>
                  <span className="seller-props-feature">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M6 12V5a2 2 0 012-2h2v9" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    {property.bathrooms} Baths
                  </span>
                  <span className="seller-props-feature">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    {property.area} sqft
                  </span>
                </div>

                <div className="seller-props-stats">
                  <div className="seller-props-stat-item" title={`${property.views || 0} people showed interest in this property`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2"/>
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    <span>{property.views || 0} {property.views === 1 ? 'person' : 'people'} interested</span>
                  </div>
                  <div className="seller-props-stat-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    <span>{property.inquiries || 0} inquiries</span>
                  </div>
                </div>

                <div className="seller-props-footer">
                  <div className="seller-props-price-section">
                    <span className="seller-props-price">{formatPrice(property.price)}</span>
                    {property.status === 'rent' && <span className="seller-props-per-month">/month</span>}
                  </div>
                  <div className="seller-props-action-btns">
                    <button 
                      className="seller-props-view-details-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDetails(property.id);
                      }}
                      title="View Details"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      View
                    </button>
                    <button 
                      className="seller-props-edit-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(getPropertyIndex(property.id));
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      Edit
                    </button>
                    <button 
                      className="seller-props-delete-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(property.id);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Add Property Card */}
          {properties.length < MAX_PROPERTIES && viewMode === 'grid' && (
            <div className="seller-props-card seller-props-add-card" onClick={openNew}>
              <div className="seller-props-add-card-content">
                <div className="seller-props-add-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <h3>Add New Property</h3>
                <p>List a new property for sale or rent</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <AddPropertyPopup
          onClose={() => {
            setShowForm(false);
            setPendingProperty(null);
          }}
          editIndex={editIndex}
          initialData={editIndex !== null ? properties[editIndex] : pendingProperty}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeletePropertyModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setPropertyToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};

export default SellerProperties;