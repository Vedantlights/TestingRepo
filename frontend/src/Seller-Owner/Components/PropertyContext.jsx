// src/context/PropertyContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { sellerPropertiesAPI, sellerInquiriesAPI } from "../../services/api.service";
import { getUserChatRooms, getChatRoomDetails } from "../../services/firebase.service";

const PropertyContext = createContext();

// No demo data - only real backend data

export const PropertyProvider = ({ children }) => {
  // Properties state - start with empty arrays (real-time data only)
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inquiries, setInquiries] = useState([]);

  // Fetch properties from backend on mount
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await sellerPropertiesAPI.list();

        if (response.success && response.data && response.data.properties) {
          // Convert backend format to frontend format
          const backendProperties = response.data.properties.map(prop => ({
            id: prop.id,
            title: prop.title,
            location: prop.location,
            price: prop.price.toString(),
            bedrooms: prop.bedrooms,
            bathrooms: prop.bathrooms,
            area: prop.area.toString(),
            status: prop.status,
            propertyType: prop.property_type,
            furnishing: prop.furnishing || '',
            facing: prop.facing || '',
            floor: prop.floor || '',
            totalFloors: prop.total_floors || '',
            age: prop.age || '',
            amenities: Array.isArray(prop.amenities) ? prop.amenities : (prop.amenities ? prop.amenities.split(',') : []),
            description: prop.description || '',
            images: Array.isArray(prop.images) && prop.images.length > 0
              ? prop.images
              : (prop.cover_image ? [prop.cover_image] : []),
            createdAt: prop.created_at,
            views: prop.views_count || 0,
            inquiries: prop.inquiry_count || 0,
            featured: false,
            latitude: prop.latitude,
            longitude: prop.longitude,
            carpetArea: prop.carpet_area?.toString() || '',
            balconies: prop.balconies || '',
            priceNegotiable: prop.price_negotiable || false,
            maintenanceCharges: prop.maintenance_charges?.toString() || '',
            depositAmount: prop.deposit_amount?.toString() || '',
            videoUrl: prop.video_url,
            brochureUrl: prop.brochure_url,
            seats: prop.seats || '',
            pricePerSeat: prop.price_per_seat?.toString() || '',
            isActive: prop.is_active !== false
          }));

          // Set only backend data (no demo data)
          setProperties(backendProperties);
        } else {
          setProperties([]);
        }
      } catch (err) {
        console.error('Error fetching properties:', err);
        setProperties([]);
        setError(err.message || 'Failed to load properties');
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();
  }, []);

  // Fetch inquiries from backend and group by unique buyer+property conversations
  const fetchInquiries = async () => {
    try {
      const response = await sellerInquiriesAPI.list();
      if (response.success && response.data && response.data.inquiries) {
        // Convert backend format to frontend format
        const backendInquiries = response.data.inquiries.map(inq => ({
          id: inq.id,
          // Backend returns a nested property object with id
          propertyId: inq.property?.id || inq.property_id || null,
          // Store buyerId so we can map inquiries to chat rooms in Firebase
          buyerId: inq.buyer?.id || inq.buyer_id || null,
          propertyTitle: inq.property?.title || inq.property_title || '',
          buyerName: inq.buyer?.name || inq.name || '',
          buyerEmail: inq.buyer?.email || inq.email || '',
          buyerPhone: inq.buyer?.phone || inq.mobile || '',
          buyerProfileImage: inq.buyer?.profile_image || null,
          message: inq.message || '',
          status: inq.status || 'new',
          createdAt: inq.created_at,
          avatar: inq.buyer?.profile_image || (inq.buyer?.name || inq.name || 'U')[0].toUpperCase()
        }));

        // Group inquiries by unique buyer+property combination (like chat apps)
        // This ensures each user appears only once per property in the list
        const conversationMap = new Map();

        backendInquiries.forEach(inquiry => {
          // Create unique key: buyerId_propertyId
          const conversationKey = `${inquiry.buyerId || 'guest'}_${inquiry.propertyId}`;

          if (!conversationMap.has(conversationKey)) {
            // First time seeing this conversation - add it
            conversationMap.set(conversationKey, {
              ...inquiry,
              conversationKey, // Store key for reference
              // Keep the most recent inquiry ID as the primary ID
              inquiryIds: [inquiry.id] // Track all inquiry IDs for this conversation
            });
          } else {
            // Conversation already exists - update with most recent data
            const existing = conversationMap.get(conversationKey);

            // Compare timestamps to keep the most recent inquiry
            const existingDate = new Date(existing.createdAt);
            const newDate = new Date(inquiry.createdAt);

            if (newDate > existingDate) {
              // This inquiry is more recent - update the conversation
              conversationMap.set(conversationKey, {
                ...inquiry,
                conversationKey,
                inquiryIds: [...existing.inquiryIds, inquiry.id]
              });
            } else {
              // Existing is more recent - just add this inquiry ID
              existing.inquiryIds.push(inquiry.id);
            }
          }
        });

        // Convert map to array - now we have unique conversations
        const uniqueConversations = Array.from(conversationMap.values());

        // Sort by most recent activity (createdAt)
        uniqueConversations.sort((a, b) => {
          const dateA = new Date(a.createdAt);
          const dateB = new Date(b.createdAt);
          return dateB - dateA; // Most recent first
        });

        // Log for debugging
        console.log('[PropertyContext] Grouped inquiries into unique conversations:',
          uniqueConversations.length, 'conversations from', backendInquiries.length, 'inquiries'
        );

        // Set unique conversations (no duplicates)
        setInquiries(uniqueConversations);
      } else {
        setInquiries([]);
      }
    } catch (error) {
      console.error('[PropertyContext] Error fetching inquiries:', error);
      // Set empty array on error (no demo data)
      setInquiries([]);
    }
  };

  useEffect(() => {
    fetchInquiries();

    // Refresh inquiries every 30 seconds to detect new messages from buyers
    const intervalId = setInterval(() => {
      fetchInquiries();
    }, 30000); // 30 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Add new property - Save to backend
  const addProperty = async (property) => {
    try {
      // Prepare data for backend API
      const propertyData = {
        title: property.title,
        status: property.status,
        property_type: property.propertyType,
        location: property.location,
        latitude: property.latitude || null,
        longitude: property.longitude || null,
        state: property.state || null,
        additional_address: property.additionalAddress || null,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        balconies: property.balconies || '',
        area: parseFloat(property.area),
        carpet_area: property.carpetArea ? parseFloat(property.carpetArea) : null,
        floor: property.floor || '',
        total_floors: property.totalFloors ? parseInt(property.totalFloors) : null,
        facing: property.facing || '',
        age: property.age || '',
        furnishing: property.furnishing || '',
        description: property.description,
        price: parseFloat(property.price),
        price_negotiable: property.priceNegotiable || false,
        maintenance_charges: property.maintenanceCharges ? parseFloat(property.maintenanceCharges) : null,
        deposit_amount: property.depositAmount ? parseFloat(property.depositAmount) : null,
        images: property.images || [],
        video_url: property.videoUrl || null,
        brochure_url: property.brochureUrl || null,
        seats: property.seats ? parseInt(property.seats) : null,
        price_per_seat: property.pricePerSeat ? parseFloat(property.pricePerSeat) : null,
        amenities: property.amenities || [],
        available_for_bachelors: property.availableForBachelors || false
      };

      // Call backend API
      const response = await sellerPropertiesAPI.add(propertyData);

      if (response.success && response.data && response.data.property) {
        // Convert backend response to frontend format
        const backendProp = response.data.property;
        const newProperty = {
          id: backendProp.id,
          title: backendProp.title,
          location: backendProp.location,
          price: backendProp.price.toString(),
          bedrooms: backendProp.bedrooms,
          bathrooms: backendProp.bathrooms,
          area: backendProp.area.toString(),
          status: backendProp.status,
          propertyType: backendProp.property_type,
          furnishing: backendProp.furnishing || '',
          facing: backendProp.facing || '',
          floor: backendProp.floor || '',
          totalFloors: backendProp.total_floors || '',
          age: backendProp.age || '',
          amenities: backendProp.amenities || [],
          description: backendProp.description || '',
          images: backendProp.images || [],
          createdAt: backendProp.created_at,
          views: 0,
          inquiries: 0,
          featured: false,
          seats: backendProp.seats || '',
          pricePerSeat: backendProp.price_per_seat?.toString() || '',
          isActive: backendProp.is_active !== false
        };

        // Refresh properties from backend after successful add
        const refreshResponse = await sellerPropertiesAPI.list();
        if (refreshResponse.success && refreshResponse.data && refreshResponse.data.properties) {
          const backendProperties = refreshResponse.data.properties.map(prop => ({
            id: prop.id,
            title: prop.title,
            location: prop.location,
            price: prop.price.toString(),
            bedrooms: prop.bedrooms,
            bathrooms: prop.bathrooms,
            area: prop.area.toString(),
            status: prop.status,
            propertyType: prop.property_type,
            furnishing: prop.furnishing || '',
            facing: prop.facing || '',
            floor: prop.floor || '',
            totalFloors: prop.total_floors || '',
            age: prop.age || '',
            amenities: Array.isArray(prop.amenities) ? prop.amenities : (prop.amenities ? prop.amenities.split(',') : []),
            description: prop.description || '',
            images: Array.isArray(prop.images) && prop.images.length > 0
              ? prop.images
              : (prop.cover_image ? [prop.cover_image] : []),
            createdAt: prop.created_at,
            views: prop.views_count || 0,
            inquiries: prop.inquiry_count || 0,
            featured: false,
            latitude: prop.latitude,
            longitude: prop.longitude,
            carpetArea: prop.carpet_area?.toString() || '',
            balconies: prop.balconies || '',
            priceNegotiable: prop.price_negotiable || false,
            maintenanceCharges: prop.maintenance_charges?.toString() || '',
            depositAmount: prop.deposit_amount?.toString() || '',
            videoUrl: prop.video_url,
            brochureUrl: prop.brochure_url,
            seats: prop.seats || '',
            pricePerSeat: prop.price_per_seat?.toString() || '',
            isActive: prop.is_active !== false
          }));
          // Set only backend data (no demo data)
          setProperties(backendProperties);
        } else {
          // If refresh fails, add the new property to state
          setProperties(prev => [newProperty, ...prev]);
        }
        return newProperty;
      } else {
        throw new Error(response.message || 'Failed to add property');
      }
    } catch (error) {
      console.error('Error adding property:', error);
      // Special handling: no active paid plan - let caller handle subscription flow
      if (
        error?.status === 403 &&
        (error?.data?.code === 'NO_ACTIVE_PAID_PLAN' ||
          error?.data?.requires_subscription === true)
      ) {
        // Do NOT show a generic alert here; let the UI redirect to plans/payment
        throw error;
      }

      // Show user-friendly error message for all other errors
      const errorMessage =
        error?.message ||
        'Failed to save property to database. Please check your connection and try again.';
      alert(errorMessage);
      throw error; // Re-throw so UI can show error
    }
  };

  // Update property - Save to backend
  const updateProperty = async (id, updates) => {
    try {
      // All properties are from backend now (no demo data)
      const isBackendProperty = true;

      if (isBackendProperty) {
        // Prepare data for backend API
        const propertyData = {
          title: updates.title,
          status: updates.status,
          property_type: updates.propertyType,
          location: updates.location,
          latitude: updates.latitude || null,
          longitude: updates.longitude || null,
          state: updates.state || null,
          additional_address: updates.additionalAddress || null,
          bedrooms: updates.bedrooms,
          bathrooms: updates.bathrooms,
          balconies: updates.balconies || '',
          area: updates.area ? parseFloat(updates.area) : null,
          carpet_area: updates.carpetArea ? parseFloat(updates.carpetArea) : null,
          floor: updates.floor || '',
          total_floors: updates.totalFloors ? parseInt(updates.totalFloors) : null,
          facing: updates.facing || '',
          age: updates.age || '',
          furnishing: updates.furnishing || '',
          description: updates.description,
          price: updates.price ? parseFloat(updates.price) : null,
          price_negotiable: updates.priceNegotiable,
          maintenance_charges: updates.maintenanceCharges ? parseFloat(updates.maintenanceCharges) : null,
          deposit_amount: updates.depositAmount ? parseFloat(updates.depositAmount) : null,
          images: updates.images || [],
          video_url: updates.videoUrl || null,
          brochure_url: updates.brochureUrl || null,
          seats: updates.seats ? parseInt(updates.seats) : null,
          price_per_seat: updates.pricePerSeat ? parseFloat(updates.pricePerSeat) : null,
          amenities: updates.amenities || [],
          available_for_bachelors: updates.availableForBachelors || false
        };

        // Call backend API
        await sellerPropertiesAPI.update(id, propertyData);
        // Refetch so counts and is_active stay in sync (e.g. after admin approval)
        await refreshProperties();
        return;
      }

      // Update local state if no backend call
      setProperties(prev =>
        prev.map(p => p.id === id ? { ...p, ...updates } : p)
      );
    } catch (error) {
      console.error('Error updating property:', error);
      setProperties(prev =>
        prev.map(p => p.id === id ? { ...p, ...updates } : p)
      );
      throw error;
    }
  };

  // Delete property - Delete from backend
  const deleteProperty = async (id) => {
    try {
      const isBackendProperty = true;

      if (isBackendProperty) {
        await sellerPropertiesAPI.delete(id);
        // Refetch to keep counts and list in sync
        await refreshProperties();
      } else {
        setProperties(prev => prev.filter(p => p.id !== id));
      }
      setInquiries(prev => prev.filter(i => i.propertyId !== id));
    } catch (error) {
      console.error('Error deleting property:', error);
      setProperties(prev => prev.filter(p => p.id !== id));
      setInquiries(prev => prev.filter(i => i.propertyId !== id));
      throw error;
    }
  };

  // Sync inquiry status from Firebase (without API call)
  // This is used when Firebase is the source of truth
  const syncInquiryStatusFromFirebase = (id, status) => {
    setInquiries(prev => {
      const inquiry = prev.find(i => i.id === id);
      if (inquiry && inquiry.status !== status) {
        console.log(`[PropertyContext] Syncing inquiry ${id} status from Firebase: ${inquiry.status} -> ${status}`);
        return prev.map(i => i.id === id ? { ...i, status } : i);
      }
      return prev;
    });
  };

  // Update inquiry status - Save to backend and persist (real-time updates)
  const updateInquiryStatus = async (id, status) => {
    // Store original status for potential rollback
    let originalStatus = null;
    setInquiries(prev => {
      const inquiry = prev.find(i => i.id === id);
      if (inquiry) {
        originalStatus = inquiry.status;
      }
      // Optimistically update local state first for immediate UI feedback
      return prev.map(i => i.id === id ? { ...i, status } : i);
    });

    try {
      // All inquiries are from backend now (no demo data)
      const isBackendInquiry = true;

      if (isBackendInquiry) {
        // Call backend API to persist the status to database
        console.log(`[PropertyContext] Updating inquiry ${id} status to: ${status}`);
        const response = await sellerInquiriesAPI.updateStatus(id, status);

        if (!response.success) {
          console.error('[PropertyContext] Failed to update inquiry status:', response.message);
          console.error('[PropertyContext] Full response:', response);
          // Revert optimistic update on failure
          if (originalStatus !== null) {
            setInquiries(prev =>
              prev.map(i => i.id === id ? { ...i, status: originalStatus } : i)
            );
          }
          throw new Error(response.message || 'Failed to update status');
        }

        // Use the status from API response to ensure consistency with database
        if (response.data && response.data.inquiry) {
          const confirmedStatus = response.data.inquiry.status;
          console.log(`[PropertyContext] Status updated successfully. Confirmed status from DB: ${confirmedStatus}`);
          setInquiries(prev =>
            prev.map(i => i.id === id ? { ...i, status: confirmedStatus } : i)
          );
        } else {
          console.warn('[PropertyContext] API response missing inquiry data:', response);
        }
      }
    } catch (error) {
      console.error('[PropertyContext] Error updating inquiry status:', error);
      console.error('[PropertyContext] Error details:', {
        message: error.message,
        status: error.status,
        data: error.data,
        fullError: error
      });

      // Check if error message indicates database schema issue
      if (error.message && (
        error.message.includes('database schema') ||
        error.message.includes('ENUM') ||
        error.message.includes('migration')
      )) {
        console.error('[PropertyContext] ⚠️ DATABASE MIGRATION REQUIRED!');
        console.error('[PropertyContext] Please run: backend/database/run_inquiry_status_migration.php');
        alert('Database migration required! Please contact administrator to run the migration script.');
      }

      // Revert optimistic update on error
      if (originalStatus !== null) {
        setInquiries(prev =>
          prev.map(i => i.id === id ? { ...i, status: originalStatus } : i)
        );
      }
      throw error; // Re-throw so caller can handle it
    }
  };

  // Delete inquiry
  const deleteInquiry = (id) => {
    setInquiries(prev => prev.filter(i => i.id !== id));
  };

  // Get stats (from current properties list - always in sync with backend after fetch/refresh)
  const getStats = () => {
    const totalProperties = properties.length;
    const activeListings = properties.filter(p => p.isActive !== false).length;
    const pendingApproval = properties.filter(p => p.isActive === false).length;
    const forSale = properties.filter(p => p.status === 'sale').length;
    const forRent = properties.filter(p => p.status === 'rent').length;
    const totalViews = properties.reduce((sum, p) => sum + (p.views || 0), 0);
    const totalInquiries = inquiries.length;
    const newInquiries = inquiries.filter(i => i.status === 'new').length;

    return {
      totalProperties,
      activeListings,
      pendingApproval,
      forSale,
      forRent,
      totalViews,
      totalInquiries,
      newInquiries
    };
  };

  // Refresh properties from backend (to get updated views, etc.)
  const refreshProperties = async () => {
    try {
      setError(null);
      const response = await sellerPropertiesAPI.list();
      if (response.success && response.data && response.data.properties) {
        const backendProperties = response.data.properties.map(prop => ({
          id: prop.id,
          title: prop.title,
          location: prop.location,
          price: prop.price.toString(),
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          area: prop.area.toString(),
          status: prop.status,
          propertyType: prop.property_type,
          furnishing: prop.furnishing || '',
          facing: prop.facing || '',
          floor: prop.floor || '',
          totalFloors: prop.total_floors || '',
          age: prop.age || '',
          amenities: Array.isArray(prop.amenities) ? prop.amenities : (prop.amenities ? prop.amenities.split(',') : []),
          description: prop.description || '',
          images: Array.isArray(prop.images) && prop.images.length > 0
            ? prop.images
            : (prop.cover_image ? [prop.cover_image] : []),
          createdAt: prop.created_at,
          views: prop.views_count || 0,
          inquiries: prop.inquiry_count || 0,
          featured: false,
          latitude: prop.latitude,
          longitude: prop.longitude,
          carpetArea: prop.carpet_area?.toString() || '',
          balconies: prop.balconies || '',
          priceNegotiable: prop.price_negotiable || false,
          maintenanceCharges: prop.maintenance_charges?.toString() || '',
          depositAmount: prop.deposit_amount?.toString() || '',
          videoUrl: prop.video_url,
          brochureUrl: prop.brochure_url,
          seats: prop.seats || '',
          pricePerSeat: prop.price_per_seat?.toString() || '',
          isActive: prop.is_active !== false
        }));
        setProperties(backendProperties);
      }
    } catch (error) {
      console.error('Error refreshing properties:', error);
    }
  };

  return (
    <PropertyContext.Provider value={{
      properties,
      setProperties,
      inquiries,
      setInquiries,
      addProperty,
      updateProperty,
      deleteProperty,
      updateInquiryStatus,
      syncInquiryStatusFromFirebase,
      deleteInquiry,
      getStats,
      refreshProperties,
      refreshInquiries: fetchInquiries,
      loading,
      error
    }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => {
  const context = useContext(PropertyContext);
  if (!context) {
    throw new Error('useProperty must be used within a PropertyProvider');
  }
  return context;
};