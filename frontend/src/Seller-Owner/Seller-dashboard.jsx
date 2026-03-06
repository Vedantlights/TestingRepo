import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Component imports
import SellerOverview from './Components/SellerOverview';
import SellerProperties from './Components/SellerProperties';
import SellerInquiries from './Components/SellerInquiries';
import SellerProfile from './Components/SellerProfile';
import SubscriptionHistory from './Components/SubscriptionHistory';
// Use buyer's ViewDetailsPage for all property details (same layout for buyers and sellers)
import ViewDetailsPage from '../UserDashboard/pages/ViewDetailsPage';
import SellerContactPage from './Components/SellerContactPage';
import PlansPage from './Components/PlansPage';
import CheckoutPage from './Components/CheckoutPage';
import PaymentSuccessPage from './Components/PaymentSuccessPage';
import PaymentFailedPage from './Components/PaymentFailedPage';

import { PropertyProvider, useProperty } from './Components/PropertyContext';
import { sellerDashboardAPI } from '../services/api.service';

import './Seller-dashboard.css';

// Inner component that uses the PropertyContext
const SellerDashboardContent = () => {
  const { user, logout: authLogout, switchRole, token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(89);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [imageError, setImageError] = useState(false);
  const userMenuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const previousPathnameRef = useRef(location.pathname);

  // Get inquiries from PropertyContext - this is already dynamic and updates when inquiries change
  const { inquiries } = useProperty();
  const [unreadChatMessages, setUnreadChatMessages] = useState(0);

  // Notification badge shows ONLY unread chat messages count
  // It reduces when messages are read
  const notifications = useMemo(() => {
    return unreadChatMessages;
  }, [unreadChatMessages]);

  // Update active tab based on route
  useEffect(() => {
    // Only update if pathname actually changed - prevents unnecessary re-renders during scroll
    if (previousPathnameRef.current === location.pathname) {
      return;
    }
    
    previousPathnameRef.current = location.pathname;
    
    const isDetailsPage = location.pathname.includes('/seller-pro-details/') || location.pathname.includes('/details/');
    
    // If we're on details page, don't change activeTab (keep current tab active)
    if (isDetailsPage) {
      return;
    }
    
    // Determine the new tab based on pathname
    let newTab = null;
    
    if (location.pathname.includes('/properties') || location.pathname === '/seller-dashboard/properties') {
      newTab = 'properties';
    } else if (location.pathname.includes('/inquiries') || location.pathname === '/seller-dashboard/inquiries') {
      newTab = 'inquiries';
    } else if (location.pathname.includes('/profile') || location.pathname === '/seller-dashboard/profile') {
      newTab = 'profile';
    } else if (location.pathname.includes('/subscription') || location.pathname === '/seller-dashboard/subscription') {
      newTab = 'subscription';
    } else if (location.pathname.includes('/plans') || location.pathname.includes('/checkout') || location.pathname.includes('/payment-success') || location.pathname.includes('/payment-failed')) {
      newTab = null; // Don't change tab on payment pages
    } else if (location.pathname.includes('/support') || location.pathname === '/seller-dashboard/support') {
      newTab = 'support';
    } else if (location.pathname === '/seller-dashboard' || location.pathname === '/seller-dashboard/') {
      newTab = 'overview';
    }
    
    // Only update state if we have a valid new tab
    // Use functional update to avoid dependency on activeTab
    if (newTab) {
      setActiveTab(prevTab => {
        // Only update if tab actually changed - prevents unnecessary re-renders
        return prevTab !== newTab ? newTab : prevTab;
      });
    }
  }, [location.pathname]);

  // Handle scroll for header shadow effect - Optimized with throttling
  useEffect(() => {
    let ticking = false;
    let currentScrolled = false;
    
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const newScrolled = window.scrollY > 10;
          // Only update state if the value actually changed
          if (newScrolled !== currentScrolled) {
            currentScrolled = newScrolled;
            setScrolled(newScrolled);
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const toggleUserMenu = () => {
    setShowUserMenu(!showUserMenu);
  };

  const openProfileFromHeader = () => {
    setShowUserMenu(false);
    handleTabChange('profile');
  };

  // Fetch subscription data on mount and update remaining days
  useEffect(() => {
    const fetchSubscriptionData = async () => {
      try {
        const response = await sellerDashboardAPI.getStats();
        
        if (response.success && response.data?.subscription?.end_date) {
          const endDate = new Date(response.data.subscription.end_date);
          const now = new Date();
          const diffTime = endDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          setDaysRemaining(Math.max(0, diffDays));
        } else {
          // Fallback: calculate from trial start date if available
          const trialStartDate = localStorage.getItem('trialStartDate');
          if (trialStartDate) {
            const start = new Date(trialStartDate);
            const end = new Date(start);
            end.setMonth(end.getMonth() + 3);
            const now = new Date();
            const diffTime = end - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            setDaysRemaining(Math.max(0, diffDays));
          }
        }
      } catch (error) {
        console.error('Error fetching subscription data:', error);
        // Fallback: calculate from trial start date if available
        const trialStartDate = localStorage.getItem('trialStartDate');
        if (trialStartDate) {
          const start = new Date(trialStartDate);
          const end = new Date(start);
          end.setMonth(end.getMonth() + 3);
          const now = new Date();
          const diffTime = end - now;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          setDaysRemaining(Math.max(0, diffDays));
        }
      }
    };

    fetchSubscriptionData();
    
    // Update remaining days every minute to keep it accurate
    const interval = setInterval(() => {
      fetchSubscriptionData();
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    // Use auth context logout which handles all cleanup
    authLogout();
    // Navigate to landing page home after logout
    window.location.href = '/';
  };

  // Handle switch to buyer dashboard
  const handleSwitchToBuyer = async () => {
    console.log('🔄 Switch to Buyer button clicked');
    
    if (!user || !token) {
      console.log('❌ No token or user - redirecting to login');
      navigate('/login');
      return;
    }
    
    try {
      console.log('🔄 Calling switchRole API to switch to buyer...');
      const result = await switchRole('buyer');
      
      if (result.success) {
        console.log('✅ Role switched to buyer successfully');
        // Navigate to buyer dashboard after successful role switch
        navigate('/buyer-dashboard', { replace: false });
      } else {
        console.error('❌ Role switch failed:', result.message);
        // Still navigate - backend will handle authorization
        navigate('/buyer-dashboard', { replace: false });
      }
    } catch (error) {
      console.error('❌ Error switching role:', error);
      // On error, still try to navigate - backend will handle authorization
      navigate('/buyer-dashboard', { replace: false });
    }
  };

  const handleTabChange = (tab) => {
    console.log('Tab changed to:', tab);
    setActiveTab(tab);
    setIsSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Navigate to the appropriate route
    if (tab === 'overview') {
      navigate('/seller-dashboard');
    } else if (tab === 'properties') {
      navigate('/seller-dashboard/properties');
    } else if (tab === 'inquiries') {
      navigate('/seller-dashboard/inquiries');
    } else if (tab === 'profile') {
      navigate('/seller-dashboard/profile');
    } else if (tab === 'subscription') {
      navigate('/seller-dashboard/subscription');
    } else if (tab === 'support') {
      navigate('/seller-dashboard/support');
    }
  };

  const renderContent = () => {
    // CHECK 1: Are we on property details page?
    // Use buyer's ViewDetailsPage layout for all property details
    const isDetailsPage = location.pathname.includes('/seller-pro-details/') || location.pathname.includes('/details/');
    
    if (isDetailsPage) {
      // Use buyer's ViewDetailsPage component (same layout for all users)
      return <ViewDetailsPage />;
    }

    // CHECK 2: Payment flow pages
    if (location.pathname.includes('/plans')) return <PlansPage />;
    if (location.pathname.includes('/checkout')) return <CheckoutPage />;
    if (location.pathname.includes('/payment-success')) return <PaymentSuccessPage />;
    if (location.pathname.includes('/payment-failed')) return <PaymentFailedPage />;

    // CHECK 3: Handle tab-based content
    switch (activeTab) {
      case 'overview':
        console.log('📊 Rendering SellerOverview');
        return <SellerOverview onNavigate={handleTabChange} />;
      case 'properties':
        console.log('🏠 Rendering SellerProperties');
        return <SellerProperties />;
      case 'inquiries':
        console.log('💬 Rendering SellerInquiries');
        return <SellerInquiries onUnreadCountChange={setUnreadChatMessages} />;
      case 'profile':
        console.log('👤 Rendering SellerProfile');
        return <SellerProfile />;
      case 'subscription':
        console.log('💳 Rendering SubscriptionHistory');
        return <SubscriptionHistory />;
      case 'support':
        console.log('📞 Rendering Support/Contact');
        return <SellerContactPage />;
      default:
        console.log('📊 Rendering SellerOverview (default)');
        return <SellerOverview onNavigate={handleTabChange} />;
    }
  };

  const navItems = [
    { id: 'overview', label: 'Dashboard', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
        <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
        <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
        <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
      </svg>
    )},
    { id: 'properties', label: 'My Properties', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )},
    { id: 'inquiries', label: 'Inquiries', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )},
    { id: 'profile', label: 'Profile', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
      </svg>
    )},
    { id: 'subscription', label: 'Subscription', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
        <path d="M2 10h20" stroke="currentColor" strokeWidth="2"/>
        <path d="M6 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M14 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )}
  ];

  return (
    <div className="seller-dashboard">
      
      {/* Header */}
      <header className={`seller-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="header-left">
          <button 
            className={`menu-toggle ${isSidebarOpen ? 'active' : ''}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <div 
            className="logo" 
            onClick={() => handleTabChange('overview')}
            style={{ cursor: 'pointer' }}
            title="Go to Dashboard"
          >
            <div className="logo-icon-wrapper">
            <img src='/finallogo.png' alt='logo'/>
            </div>
          </div>
        </div>
        
        <nav className="header-nav">
          {navItems.map((item) => {
            // Don't highlight tab when on details page
            const isDetailsPage = location.pathname.includes('/seller-pro-details/') || location.pathname.includes('/details/');
            const isActive = !isDetailsPage && activeTab === item.id;
            
            return (
              <button 
                key={item.id}
                className={`nav-btn ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTabChange(item.id);
                }}
                type="button"
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.id === 'inquiries' && notifications > 0 && (
                  <span className="nav-badge">{notifications}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="header-right">
          <button 
            className={`free-trial-badge ${daysRemaining <= 7 ? 'urgent' : ''}`}
            onClick={() => handleTabChange('subscription')}
          >
            <span className="trial-text">Free Trial</span>
            <br></br>
            <span className="trial-days">{daysRemaining}</span>
            <span className="trial-text">days left</span>
          </button>

          {/* Switch to Buyer Dashboard Button */}
          <button 
            className="seller-switch-buyer-btn" 
            title="Switch to Buyer Dashboard"
            onClick={handleSwitchToBuyer}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: '6px' }}>
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
              <path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Buy Property</span>
          </button>

          {/* User Header */}
          <div className="seller-user-header" ref={userMenuRef} onClick={toggleUserMenu}>
            <div className="seller-user-avatar">
              {user?.profile_image && !imageError ? (
                <img 
                  src={user.profile_image} 
                  alt={user?.full_name || user?.name || 'User'} 
                  onError={() => setImageError(true)}
                />
              ) : (
                <span>
                  {user?.full_name?.charAt(0)?.toUpperCase() || 
                   user?.name?.charAt(0)?.toUpperCase() || 
                   user?.email?.charAt(0)?.toUpperCase() || 
                   'U'}
                </span>
              )}
            </div>
            
            {/* User Dropdown Menu */}
            {showUserMenu && (
              <div className="seller-user-dropdown">
                <button onClick={openProfileFromHeader}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  My Profile
                </button>
                <button onClick={() => {
                  setShowUserMenu(false);
                  handleTabChange('support');
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M13 7H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M17 11H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Support
                </button>
                <button onClick={handleLogout}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" 
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      <aside className={`mobile-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="mobile-sidebar-header">
          <div 
            className="logo"
            onClick={() => handleTabChange('overview')}
            style={{ cursor: 'pointer' }}
          >
            <div className="logo-icon-wrapper">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" fill="white" stroke="white" strokeWidth="2"/>
                <path d="M9 22V12h6v10" stroke="#003B73" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="logo-text">360Coordinates</span>
          </div>
          <button 
            className="close-sidebar"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        
        <div 
          className="mobile-user-section"
          onClick={() => handleTabChange('profile')}
          style={{ cursor: 'pointer' }}
        >
          <div className="mobile-user-avatar">
            {user?.name ? user.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="mobile-user-info">
            <span className="mobile-user-name">
            {user?.full_name || user?.email?.split('@')[0] || 'User'}
            </span>
            <span className="mobile-user-role">
              {user?.user_type === 'agent' ? 'Agent/Builder' : 'Seller'}
            </span>
          </div>
        </div>
        
        <nav className="mobile-nav">
          {navItems.map((item) => (
            <button 
              key={item.id}
              className={`mobile-nav-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => handleTabChange(item.id)}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
              <span className="mobile-nav-label">{item.label}</span>
              {item.id === 'inquiries' && notifications > 0 && (
                <span className="mobile-nav-badge">{notifications}</span>
              )}
            </button>
          ))}
          
          <div className="mobile-nav-divider"></div>

          {/* Switch to Buyer Dashboard (mobile sidebar) */}
          <button 
            className="seller-mobile-switch-btn" 
            onClick={handleSwitchToBuyer}
            title="Switch to Buyer Dashboard"
          >
            <span className="mobile-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="mobile-nav-label">Switch to Buyer</span>
          </button>
          
          <button 
            className="mobile-nav-btn" 
            onClick={() => handleTabChange('support')}
          >
            <span className="mobile-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 7H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M17 11H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="mobile-nav-label">Support</span>
          </button>
          
          <div className="mobile-nav-divider"></div>
          
          <button className="mobile-nav-btn logout" onClick={handleLogout}>
            <span className="mobile-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" 
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="mobile-nav-label">Logout</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="seller-main">
        <div className="main-content-wrapper">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

// Main component that wraps everything with PropertyProvider
const SellerDashboard = () => {
  return (
    <PropertyProvider>
      <SellerDashboardContent />
    </PropertyProvider>
  );
};

export default SellerDashboard;