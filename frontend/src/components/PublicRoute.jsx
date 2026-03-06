// src/components/PublicRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const PublicRoute = ({ children }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Show spinner while loading
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div className="spinner" style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #0077C0',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p>Loading...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Public routes that should be accessible to all users (authenticated and unauthenticated)
  const publicRoutes = ['/about', '/contact', '/privacy-policy', '/terms-conditions'];
  const isPublicRoute = publicRoutes.some(route => location.pathname === route || location.pathname.toLowerCase() === route);

  // If authenticated and NOT on a public route, redirect based on user_type
  // Exception: Don't redirect from login/register when pending phone verification (e.g. after Google signup)
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const pendingPhoneVerification = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pendingPhoneVerification');
  if (isAuthenticated && user && !isPublicRoute && !(isAuthPage && pendingPhoneVerification)) {
    const userType = user.user_type || user.role;
    
    switch (userType) {
      case 'buyer':
        return <Navigate to="/buyer-dashboard" replace />;
      case 'seller':
        return <Navigate to="/seller-dashboard" replace />;
      case 'agent':
        return <Navigate to="/agent-dashboard" replace />;
      default:
        return <Navigate to="/dashboard" replace />;
    }
  }

  // Not authenticated or on a public route, render children (public page)
  return children;
};

export default PublicRoute;

