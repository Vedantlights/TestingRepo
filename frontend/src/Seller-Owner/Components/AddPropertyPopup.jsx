// src/components/AddPropertyPopup.jsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useProperty } from "./PropertyContext";
import { sellerPropertiesAPI } from "../../services/api.service";
import { API_BASE_URL, API_ENDPOINTS } from "../../config/api.config";
import {
  sanitizeInput,
  validateTextLength,
  validateArea,
  PLOT_LAND_AREA_MAX_SQFT,
  validateLatitude,
  validateLongitude,
  validatePrice,
  validateCarpetArea,
  validateDeposit,
  validateFloors,
  validateImageFile
} from "../../utils/validation";
import LocationPicker from "../../components/Map/LocationPicker";
import LocationAutoSuggest from "../../components/LocationAutoSuggest";
import StateAutoSuggest from "../../components/StateAutoSuggest";
import PropertyUploadSuccessModal from "../../components/PropertyUploadSuccessModal/PropertyUploadSuccessModal";
import { useAutoScrollForm } from "../../hooks/useAutoScrollForm";
import "../styles/AddPropertyPopup.css";

const STEPS = [
  { id: 1, title: "Basic Info", icon: "📝" },
  { id: 2, title: "Property Details", icon: "🏠" },
  { id: 3, title: "Amenities", icon: "✨" },
  { id: 4, title: "Photos", icon: "📷" },
  { id: 5, title: "Pricing", icon: "💰" }
];

const PROPERTY_TYPES = [
  { value: "Apartment", icon: "🏢", category: "residential", subCategory: "standard" },
  { value: "Villa / Banglow", icon: "🏡", category: "residential", subCategory: "independent" },
  { value: "Independent House", icon: "🏘️", category: "residential", subCategory: "independent" },
  { value: "Row House/ Farm House", icon: "🏘️", category: "residential", subCategory: "standard" },
  { value: "Penthouse", icon: "🌆", category: "residential", subCategory: "luxury" },
  { value: "Studio Apartment", icon: "🛏️", category: "residential", subCategory: "studio" },
  { value: "Plot / Land / Indusrtial Property", icon: "📐", category: "land", subCategory: "plot" },
  { value: "Commercial Office", icon: "🏢", category: "commercial", subCategory: "office" },
  { value: "Commercial Shop", icon: "🏪", category: "commercial", subCategory: "shop" },
  { value: "PG / Hostel", icon: "🛏️", category: "pg", subCategory: "accommodation" },
  { value: "Warehouse / Godown", icon: "🏪", category: "commercial", subCategory: "shop" }
];

// Property types that hide "Floor Number" (Total Floors still shown)
const PROPERTY_TYPES_HIDE_FLOOR_NUMBER = ['Villa / Banglow', 'Independent House', 'Row House/ Farm House'];

// Property type field configurations - based on real-world requirements
const PROPERTY_TYPE_FIELDS = {
  // Standard Residential (Apartment, Flat, Row House, Penthouse)
  residential_standard: {
    showBedrooms: true,
    showBathrooms: true,
    showBalconies: true,
    showFloor: true,
    showTotalFloors: true,
    showFacing: true,
    showFurnishing: true,
    showAge: true,
    showCarpetArea: true,
    bedroomsRequired: true,
    bathroomsRequired: true
  },
  // Independent Residential (Villa, Independent House)
  residential_independent: {
    showBedrooms: true,
    showBathrooms: true,
    showBalconies: true,
    showFloor: true, // Allow floor number when total floors is specified
    showTotalFloors: true, // May have multiple floors
    showFacing: true,
    showFurnishing: true,
    showAge: true,
    showCarpetArea: true,
    bedroomsRequired: true,
    bathroomsRequired: true
  },
  // Studio Apartment - special case
  residential_studio: {
    showBedrooms: false, // Studio = 0 bedrooms (combined living/sleeping)
    showBathrooms: true,
    showBalconies: true,
    showFloor: true,
    showTotalFloors: true,
    showFacing: true,
    showFurnishing: true,
    showAge: true,
    showCarpetArea: true,
    bedroomsRequired: false,
    bathroomsRequired: true
  },
  // Farm House - often single floor
  residential_farmhouse: {
    showBedrooms: true,
    showBathrooms: true,
    showBalconies: false, // Farm houses may not have balconies
    showFloor: true, // Allow floor number when total floors is specified
    showTotalFloors: true,
    showFacing: true,
    showFurnishing: true,
    showAge: true,
    showCarpetArea: true,
    bedroomsRequired: true,
    bathroomsRequired: true
  },
  // Commercial Office
  commercial_office: {
    showBedrooms: false,
    showBathrooms: true,
    showBalconies: false,
    showFloor: true,
    showTotalFloors: true,
    showFacing: true,
    showFurnishing: true,
    showAge: true,
    showCarpetArea: true,
    bedroomsRequired: false,
    bathroomsRequired: true // Required by backend API
  },
  // Commercial Shop
  commercial_shop: {
    showBedrooms: false,
    showBathrooms: true, // May have restroom
    showBalconies: false,
    showFloor: true, // Ground floor preferred
    showTotalFloors: true,
    showFacing: true, // Important for shops
    showFurnishing: false, // Shops usually unfurnished
    showAge: true,
    showCarpetArea: true,
    bedroomsRequired: false,
    bathroomsRequired: true // Required by backend API
  },
  // Plot/Land
  land_plot: {
    showBedrooms: false,
    showBathrooms: false,
    showBalconies: false,
    showFloor: false,
    showTotalFloors: false,
    showFacing: true, // Important for plot
    showFurnishing: false,
    showAge: false,
    showCarpetArea: false, // Only plot area
    bedroomsRequired: false,
    bathroomsRequired: false
  },
  // PG/Hostel
  pg_accommodation: {
    showBedrooms: true, // Number of beds/rooms
    showBathrooms: true,
    showBalconies: false,
    showFloor: true,
    showTotalFloors: true,
    showFacing: true,
    showFurnishing: true,
    showAge: true,
    showCarpetArea: true,
    bedroomsRequired: true,
    bathroomsRequired: true
  }
};

const AMENITIES = [
  { id: "parking", label: "Parking", icon: "🚗" },
  { id: "lift", label: "Lift", icon: "🛗" },
  { id: "security", label: "24x7 Security", icon: "👮" },
  { id: "power_backup", label: "Power Backup", icon: "⚡" },
  { id: "gym", label: "Gym", icon: "🏋️" },
  { id: "swimming_pool", label: "Swimming Pool", icon: "🏊" },
  { id: "garden", label: "Garden", icon: "🌳" },
  { id: "clubhouse", label: "Club House", icon: "🏛️" },
  { id: "playground", label: "Children's Play Area", icon: "🎢" },
  { id: "cctv", label: "CCTV", icon: "📹" },
  { id: "intercom", label: "Intercom", icon: "📞" },
  { id: "fire_safety", label: "Fire Safety", icon: "🔥" },
  { id: "water_supply", label: "24x7 Water", icon: "💧" },
  { id: "gas_pipeline", label: "Gas Pipeline", icon: "🔥" },
  { id: "wifi", label: "WiFi", icon: "📶" },
  { id: "ac", label: "Air Conditioning", icon: "❄️" },
  { id: "electricity", label: "Electricity", icon: "⚡" },

  // Plot/Land specific
  { id: "internal_roads", label: "Internal Roads", icon: "🛣️" },
  { id: "led_lighting", label: "LED Street Lighting", icon: "💡" },
  { id: "rainwater_harvesting", label: "Rainwater Harvesting", icon: "🌧️" },
  { id: "underground_drainage", label: "Underground Drainage", icon: "🚰" },
  { id: "stormwater_drainage", label: "Stormwater Drainage", icon: "🌊" },
  { id: "water_line", label: "Water Supply Line/Borewell", icon: "💧" },
  { id: "electricity_provision", label: "Electricity Provision", icon: "⚡" },
  { id: "gated_entrance", label: "Gated Entrance", icon: "🚧" },
  { id: "compound_wall", label: "Compound Wall", icon: "🧱" },
  { id: "security_cabin", label: "Security Cabin", icon: "🏠" },
  { id: "landscaped_garden", label: "Landscaped Garden", icon: "🌳" },
  { id: "jogging_track", label: "Jogging/Walking Track", icon: "🏃" },
  { id: "open_gym", label: "Open Gym/Fitness Zone", icon: "💪" },
  { id: "visitor_parking", label: "Visitor Parking", icon: "🅿️" },

  // Commercial/Office/Coworking
  { id: "power_backup_ups", label: "24/7 Power Backup (UPS/DG)", icon: "⚡" },
  { id: "high_speed_internet", label: "High-Speed Internet/Fiber Ready", icon: "🌐" },
  { id: "centralized_ac", label: "Centralized AC (HVAC)", icon: "❄️" },
  { id: "lifts_high_speed", label: "Elevators/High-Speed Lifts", icon: "🛗" },
  { id: "access_control", label: "Access Control (RFID/Biometric)", icon: "🔐" },
  { id: "security_staff", label: "Security Staff (24×7)", icon: "👮" },
  { id: "reception_desk", label: "Reception Desk", icon: "💁" },
  { id: "lobby_area", label: "Lobby Area", icon: "🛋️" },
  { id: "conference_room", label: "Conference Room", icon: "🤝" },
  { id: "washrooms", label: "Washrooms (Private/Common)", icon: "🚻" },
  { id: "pantry", label: "Pantry/Kitchenette", icon: "☕" },

  // Commercial Shop
  { id: "power_supply_247", label: "24/7 Power Supply", icon: "⚡" },
  { id: "customer_parking", label: "Customer Parking", icon: "🚗" },
  { id: "two_wheeler_parking", label: "Two-Wheeler Parking", icon: "🛵" },
  { id: "wheelchair_accessible", label: "Wheelchair Accessible/Ramp", icon: "♿" },
  { id: "escalator_access", label: "Lift/Escalator Access", icon: "🛗" },
  { id: "display_window", label: "Glass Front/Display Window", icon: "🪟" },
  { id: "shutter_door", label: "Shutter Door", icon: "🚪" },
  { id: "mezzanine_floor", label: "Mezzanine Floor/Storage Room", icon: "📦" },

  // Coworking specific
  { id: "dedicated_desk", label: "Dedicated Desk/Hot Desk", icon: "💻" },
  { id: "private_cabins", label: "Private Cabins", icon: "🏢" },
  { id: "meeting_rooms", label: "Meeting Rooms", icon: "👥" },
  { id: "coffee_tea", label: "Coffee/Tea/Water", icon: "☕" },
  { id: "office_supplies", label: "Printer/Scanner/Office Supplies", icon: "🖨️" },
  { id: "housekeeping", label: "Housekeeping & Daily Cleaning", icon: "🧹" },
  { id: "quiet_zones", label: "Quiet Zones/Phone Booths", icon: "🤫" },
  { id: "mobile_app_access", label: "Mobile App Access", icon: "📱" },
  { id: "event_space", label: "Event Space/Community Area", icon: "🎉" },
  { id: "lounge", label: "Lounge/Breakout Zones", icon: "🛋️" }
];

// Amenities configuration based on property type
const PROPERTY_TYPE_AMENITIES = {
  // Residential properties (Apartment, Flat, Row House, Penthouse, Villa, Independent House, Studio Apartment)
  residential: [
    "parking", "lift", "security", "power_backup", "gym", "swimming_pool",
    "garden", "clubhouse", "playground", "cctv", "intercom", "fire_safety",
    "water_supply", "gas_pipeline", "wifi"
  ],
  // Farm House - similar to residential but may not have lift
  residential_farmhouse: [
    "parking", "security", "power_backup", "gym", "swimming_pool",
    "garden", "clubhouse", "playground", "cctv", "fire_safety",
    "water_supply", "gas_pipeline", "wifi"
  ],
  // Commercial Office
  commercial_office: [
    "power_backup_ups", "high_speed_internet", "centralized_ac", "lifts_high_speed",
    "fire_safety", "access_control", "parking", "visitor_parking", "security_staff",
    "reception_desk", "lobby_area", "conference_room", "washrooms", "pantry",
    "cctv", "security", "lift", "wifi"
  ],
  // Commercial Shop
  commercial_shop: [
    "power_supply_247", "power_backup", "customer_parking", "two_wheeler_parking",
    "wheelchair_accessible", "escalator_access", "display_window", "shutter_door",
    "washrooms", "mezzanine_floor", "high_speed_internet",
    "parking", "security", "cctv", "fire_safety", "wifi"
  ],
  // Plot/Land - minimal amenities including electricity
  land_plot: [
    "internal_roads", "led_lighting", "rainwater_harvesting", "underground_drainage",
    "stormwater_drainage", "water_line", "electricity_provision", "gated_entrance",
    "compound_wall", "security_cabin", "landscaped_garden", "playground",
    "jogging_track", "open_gym", "visitor_parking",
    "security", "water_supply", "cctv", "electricity"
  ],
  // PG/Hostel
  pg_accommodation: [
    "parking", "security", "power_backup", "cctv",
    "fire_safety", "water_supply", "wifi", "intercom"
  ]
};

const FURNISHING_OPTIONS = ["Unfurnished", "Semi-Furnished", "Fully-Furnished"];
const FACING_OPTIONS = ["North", "South", "East", "West", "North-East", "North-West", "South-East", "South-West"];
const AGE_OPTIONS = ["New Construction", "Less than 1 Year", "1-5 Years", "5-10 Years", "10+ Years"];

export default function AddPropertyPopup({ onClose, editIndex = null, initialData = null }) {
  const { addProperty, updateProperty, properties } = useProperty();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [stepError, setStepError] = useState(null); // Step-level error message
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [showEditNoticeModal, setShowEditNoticeModal] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [isPublished, setIsPublished] = useState(false); // Track if publishing is completed
  const [showCloseWarning, setShowCloseWarning] = useState(false); // Show warning modal when trying to close on final step
  const [isDiscarded, setIsDiscarded] = useState(false); // Track if user discarded the form
  const [imageFiles, setImageFiles] = useState([]); // Store actual File objects
  const [imageValidationStatus, setImageValidationStatus] = useState([]); // Track validation status for each image
  const [isCheckingImages, setIsCheckingImages] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [mapCenterFromAddress, setMapCenterFromAddress] = useState(null); // Center map when user enters address
  const [stateAutoFilled, setStateAutoFilled] = useState(false); // Track if state was auto-filled from map
  const [showActionSelector, setShowActionSelector] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraFacingMode, setCameraFacingMode] = useState('environment'); // 'environment' (rear) or 'user' (front)
  const fileRef = useRef();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const popupBodyRef = useRef(null);
  const popupContainerRef = useRef(null);

  // Check property limit (3 properties max for free users)
  const PROPERTY_LIMIT = 3;
  const currentPropertyCount = properties?.length || 0;
  const hasReachedLimit = editIndex === null && currentPropertyCount >= PROPERTY_LIMIT;

  // Check if property is older than 24 hours (only allow title and price editing)
  const isPropertyOlderThan24Hours = () => {
    if (editIndex === null || !initialData?.createdAt) {
      return false;
    }
    const createdAt = new Date(initialData.createdAt);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceCreation >= 24;
  };

  const isRestrictedEdit = isPropertyOlderThan24Hours();

  // Show limit warning if user has reached the limit
  useEffect(() => {
    if (hasReachedLimit) {
      setShowLimitWarning(true);
    }
  }, [hasReachedLimit]);

  // Scroll to top when step changes
  useEffect(() => {
    if (popupBodyRef.current) {
      popupBodyRef.current.scrollTop = 0;
    }
    // Clear step error when step changes
    setStepError(null);
  }, [currentStep]);

  const [formData, setFormData] = useState(initialData || {
    // Step 1: Basic Info
    title: "",
    status: "sale",
    propertyType: "",

    // Step 2: Property Details
    location: "",
    latitude: "",
    longitude: "",
    state: "",
    additionalAddress: "",
    bedrooms: "",
    bathrooms: "",
    balconies: "",
    area: "",
    carpetArea: "",
    floor: "",
    totalFloors: "",
    facing: "",
    age: "",
    furnishing: "",
    seats: "", // NEW
    pricePerSeat: "", // NEW

    // Step 3: Amenities
    amenities: [],
    description: "",

    // Step 4: Photos
    images: [],

    // Step 5: Pricing
    price: "",
    priceNegotiable: false,
    maintenanceCharges: "",
    depositAmount: "",
    availableForBachelors: false
  });

  // Reset all form state (for hard discard)
  const resetFormState = useCallback(() => {
    setFormData(initialData || {
      title: "",
      status: "sale",
      propertyType: "",
      location: "",
      latitude: "",
      longitude: "",
      state: "",
      additionalAddress: "",
      bedrooms: "",
      bathrooms: "",
      balconies: "",
      area: "",
      carpetArea: "",
      floor: "",
      totalFloors: "",
      facing: "",
      age: "",
      furnishing: "",
      seats: "",
      pricePerSeat: "",
      amenities: [],
      description: "",
      images: [],
      price: "",
      priceNegotiable: false,
      maintenanceCharges: "",
      depositAmount: "",
      availableForBachelors: false
    });
    setCurrentStep(1);
    setErrors({});
    setStepError(null);
    setImageFiles([]);
    setImageValidationStatus([]);
    setIsCheckingImages(false);
    setStateAutoFilled(false);
    setIsSubmitting(false);
    setUploadingImages(false);
    setIsPublished(false);
  }, [initialData]);

  // Handle discard and close - HARD DISCARD
  const handleDiscardAndClose = useCallback(() => {
    setIsDiscarded(true);
    resetFormState();
    setShowCloseWarning(false);
    onClose();
  }, [resetFormState, onClose]);

  // Handle close attempt - check if on final step and not published
  const handleCloseAttempt = useCallback(() => {
    const isFinalStep = currentStep === STEPS.length;
    if (isFinalStep && !isPublished) {
      // Show warning modal instead of closing
      setShowCloseWarning(true);
      return;
    }
    // Allow closing if not on final step or already published
    onClose();
  }, [currentStep, isPublished, onClose]);

  // Close on escape
  useEffect(() => {
    if (showEditNoticeModal || showCloseWarning) return; // Don't close main popup when modals are open
    const onKey = (e) => {
      if (e.key === "Escape") {
        handleCloseAttempt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCloseAttempt, showEditNoticeModal, showCloseWarning]);

  // Close success modal on ESC key
  useEffect(() => {
    if (!showEditNoticeModal) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setShowEditNoticeModal(false);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showEditNoticeModal, onClose]);

  // Disable number input spinner functionality (wheel and arrow keys) ONLY within popup
  useEffect(() => {
    const container = popupContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      // Check if the event target is a number input within the popup
      if (e.target.type === 'number' && container.contains(e.target)) {
        // Only prevent if the input is focused
        if (document.activeElement === e.target) {
          e.preventDefault();
        }
      }
    };

    const handleKeyDown = (e) => {
      // Check if arrow keys are pressed on a number input within the popup
      if (
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        e.target.type === 'number' &&
        container.contains(e.target)
      ) {
        e.preventDefault();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleChange = (field, value) => {
    // Sanitize text inputs
    let sanitizedValue = value;
    if (typeof value === 'string' && ['title', 'location', 'description'].includes(field)) {
      sanitizedValue = sanitizeInput(value);
    }

    setFormData(prev => {
      const newData = { ...prev, [field]: sanitizedValue };

      // Auto-set bedrooms to "0" for Studio Apartment
      if (field === 'propertyType' && value === 'Studio Apartment') {
        newData.bedrooms = '0';
      }
      // Clear bedrooms if switching away from Studio Apartment and it was set to 0
      if (field === 'propertyType' && value !== 'Studio Apartment' && prev.bedrooms === '0') {
        newData.bedrooms = '';
      }

      // Clear amenities that are not applicable to the new property type
      if (field === 'propertyType') {
        // Get available amenities for the new property type
        const propertyType = PROPERTY_TYPES.find(pt => pt.value === value);
        let availableAmenityIds = [];

        if (propertyType) {
          if (value === 'Row House/ Farm House') {
            availableAmenityIds = PROPERTY_TYPE_AMENITIES.residential_farmhouse;
          } else if (value === 'Plot / Land / Indusrtial Property') {
            availableAmenityIds = PROPERTY_TYPE_AMENITIES.land_plot;
          } else if (propertyType.category === 'residential') {
            availableAmenityIds = PROPERTY_TYPE_AMENITIES.residential;
          } else if (propertyType.category === 'commercial') {
            const configKey = `${propertyType.category}_${propertyType.subCategory}`;
            availableAmenityIds = PROPERTY_TYPE_AMENITIES[configKey] || PROPERTY_TYPE_AMENITIES.commercial_office;
          } else if (propertyType.category === 'pg') {
            availableAmenityIds = PROPERTY_TYPE_AMENITIES.pg_accommodation;
          } else if (propertyType.category === 'land') {
            availableAmenityIds = PROPERTY_TYPE_AMENITIES.land_plot;
          }
        }

        // Filter out amenities that are not available for the new property type
        if (availableAmenityIds.length > 0 && prev.amenities) {
          newData.amenities = prev.amenities.filter(amenityId => availableAmenityIds.includes(amenityId));
        }
      }

      return newData;
    });
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
    // Clear step error when user makes changes
    if (stepError) {
      setStepError(null);
    }
  };

  const toggleAmenity = (amenityId) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenityId)
        ? prev.amenities.filter(a => a !== amenityId)
        : [...prev.amenities, amenityId]
    }));
    if (errors.amenities) {
      setErrors(prev => ({ ...prev, amenities: null }));
    }
    if (stepError) {
      setStepError(null);
    }
  };

  // Handle location selection from LocationPicker - only update coordinates, preserve user's address
  const handleLocationSelect = (locationData) => {
    if (isRestrictedEdit) return; // Prevent location changes after 24 hours

    setFormData(prev => ({
      ...prev,
      latitude: locationData.latitude.toString(),
      longitude: locationData.longitude.toString()
      // Do NOT overwrite location or state - keep user's typed address as-is
    }));

    setShowLocationPicker(false);
    if (errors.location || errors.state) {
      setErrors(prev => ({ ...prev, location: null, state: null, mapLocation: null }));
    }
    if (stepError) {
      setStepError(null);
    }
  };

  const handleImageUpload = async (e) => {
    // Close action selector overlay when image upload begins
    setShowActionSelector(false);

    const files = Array.from(e.target.files || []);

    // Check total image count
    const currentCount = formData.images?.length || 0;
    if (currentCount + files.length > 10) {
      setErrors(prev => ({
        ...prev,
        images: `Maximum 10 photos allowed. You have ${currentCount} and trying to add ${files.length}`
      }));
      return;
    }

    // Basic file validation first
    const validFiles = [];
    for (const file of files) {
      const fileValidation = validateImageFile(file);
      if (!fileValidation.valid) {
        setErrors(prev => ({
          ...prev,
          images: fileValidation.message
        }));
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      return;
    }

    // Create image objects with pending status
    const newImageObjects = validFiles.map(file => ({
      file: file,
      preview: URL.createObjectURL(file),
      status: 'pending', // pending, checking, approved, rejected
      errorMessage: '',
      imageId: null,
      imageUrl: null
    }));

    // Add to state immediately
    setImageFiles(prev => [...prev, ...validFiles].slice(0, 10));
    setImageValidationStatus(prev => [...prev, ...newImageObjects].slice(0, 10));

    // Create blob URLs for preview
    const newImages = validFiles.map(f => URL.createObjectURL(f));
    setFormData(prev => ({
      ...prev,
      images: [...(prev.images || []), ...newImages].slice(0, 10)
    }));

    // Clear any previous errors
    if (errors.images) {
      setErrors(prev => ({ ...prev, images: null }));
    }

    // Immediately validate each image through moderation API (in parallel for speed)
    setIsCheckingImages(true);
    const startIndex = imageValidationStatus.length;

    // Validate all images in parallel for faster processing
    const validationPromises = newImageObjects.map((imgObj, i) =>
      validateImageThroughModeration(imgObj, startIndex + i)
    );

    // Wait for all validations to complete
    await Promise.all(validationPromises);

    setIsCheckingImages(false);
  };

  // Validate single image through moderation API
  const validateImageThroughModeration = async (imageObj, index) => {
    // Update status to checking
    setImageValidationStatus(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          status: 'checking'
        };
      }
      return updated;
    });

    try {
      // Get property ID - use 0 for new properties (validation-only mode)
      const propertyId = editIndex !== null ? properties[editIndex]?.id : 0;
      const validateOnly = propertyId <= 0; // Validation-only mode for new properties

      const formData = new FormData();
      formData.append('image', imageObj.file);
      formData.append('property_id', propertyId);
      if (validateOnly) {
        formData.append('validate_only', 'true');
      }

      const token = localStorage.getItem('authToken');
      console.log(`[Image ${index + 1}] Starting validation...`);

      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.MODERATE_AND_UPLOAD}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      console.log(`[Image ${index + 1}] Response status:`, response.status);

      // Check if response is OK
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Image ${index + 1}] HTTP Error ${response.status}:`, errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText || `HTTP ${response.status} Error` };
        }

        setImageValidationStatus(prev => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = {
              ...updated[index],
              status: 'rejected',
              errorMessage: errorData.message || 'Validation failed',
              fullErrorMessage: errorData.message || `HTTP ${response.status} Error`
            };
          }
          return updated;
        });
        return;
      }

      const result = await response.json();
      console.log(`[Image ${index + 1}] API Response:`, result);

      // CRITICAL: Check moderation_status explicitly, not just response status
      // Backend returns: { status: "success", data: { moderation_status: "PENDING" | "NEEDS_REVIEW" | "SAFE" } }
      const moderationStatus = result.data?.moderation_status;

      // Update status based on result
      setImageValidationStatus(prev => {
        const updated = [...prev];
        if (updated[index]) {
          // AUTO-APPROVE FOR AGENT/SELLER: If upload was successful and not explicitly rejected,
          // mark as approved even if moderation_status is 'PENDING' or 'NEEDS_REVIEW'
          // This ensures property submission doesn't fail for valid uploaded images
          if (result.status === 'success' && result.data?.image_url) {
            // Only reject if explicitly rejected by moderation (error response already handled above)
            // For Agent/Seller uploads, auto-approve successful uploads
            console.log(`[Image ${index + 1}] ✅ Auto-approved for Seller (moderation_status: ${moderationStatus || 'N/A'})`);
            updated[index] = {
              ...updated[index],
              status: 'approved', // Auto-approve for Agent/Seller
              imageId: result.data?.image_id,
              imageUrl: result.data?.image_url,
              moderationStatus: moderationStatus || 'SAFE' // Store actual moderation status for reference
            };
          }
          // Only mark as approved when moderation_status is explicitly "SAFE" (fallback for explicit SAFE status)
          else if (moderationStatus === 'SAFE') {
            console.log(`[Image ${index + 1}] ✅ Approved (SAFE)`);
            updated[index] = {
              ...updated[index],
              status: 'approved',
              imageId: result.data?.image_id,
              imageUrl: result.data?.image_url,
              moderationStatus: 'SAFE'
            };
          }
          // Handle explicit rejection (should have been caught by error response check above, but handle just in case)
          else if (result.status === 'error' || moderationStatus === 'REJECTED' || moderationStatus === 'UNSAFE') {
            // Extract specific error reason from message
            let errorReason = result.message || 'Image was rejected';
            console.log(`[Image ${index + 1}] ❌ Rejected:`, errorReason);

            // Make error message more concise for display
            if (errorReason.includes('animal appearance')) {
              const match = errorReason.match(/\(([^)]+)\)/);
              errorReason = match ? `${match[1]} detected` : 'Animal detected';
            } else if (errorReason.includes('human appearance')) {
              errorReason = 'Human detected';
            } else if (errorReason.includes('blurry')) {
              errorReason = 'Image is too blurry';
            } else if (errorReason.includes('low quality')) {
              errorReason = 'Image quality too low';
            }

            updated[index] = {
              ...updated[index],
              status: 'rejected',
              errorMessage: errorReason, // Show EXACT error from API
              fullErrorMessage: result.message || 'Image was rejected'
            };
          }
          // Legacy support: If status is success but no moderation_status, auto-approve for Agent/Seller
          else if (result.status === 'success') {
            console.log(`[Image ${index + 1}] ✅ Auto-approved (response missing moderation_status)`);
            updated[index] = {
              ...updated[index],
              status: 'approved', // Auto-approve for Agent/Seller
              moderationStatus: 'SAFE', // Default to SAFE for successful uploads
              imageUrl: result.data?.image_url || null
            };
          }
        }
        return updated;
      });

      // Check if all images are approved and auto-proceed
      setTimeout(() => {
        checkAndAutoProceed();
      }, 500);

    } catch (error) {
      console.error(`[Image ${index + 1}] ❌ Validation error:`, error);
      console.error(`[Image ${index + 1}] Error details:`, {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      setImageValidationStatus(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            status: 'rejected',
            errorMessage: error.message || 'Validation failed. Please check console for details.',
            fullErrorMessage: error.message || 'Failed to validate image. Please try again.'
          };
        }
        return updated;
      });
    }
  };

  // Check if all images are approved and auto-proceed to next step
  const checkAndAutoProceed = () => {
    if (currentStep === 4 && imageValidationStatus.length > 0) {
      const allApproved = imageValidationStatus.every(img => img.status === 'approved');
      const noneChecking = !imageValidationStatus.some(img => img.status === 'checking');
      const noneRejected = !imageValidationStatus.some(img => img.status === 'rejected');

      if (allApproved && noneChecking && noneRejected && imageValidationStatus.length > 0) {
        // Auto-proceed after 1 second
        setTimeout(() => {
          handleNext();
        }, 1000);
      }
    }
  };

  // Handle upload zone click - show action selector
  const handleUploadZoneClick = () => {
    if (isRestrictedEdit) return;
    setShowActionSelector(true);
  };

  // Handle action selection
  const handleActionSelect = (action) => {
    setShowActionSelector(false);
    if (action === 'gallery') {
      fileRef.current?.click();
    } else if (action === 'camera') {
      startCamera();
    }
  };

  // Start camera with MediaDevices API
  const startCamera = async () => {
    try {
      // Check if MediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera is not supported on this device. Please use gallery upload instead.');
        return;
      }

      const constraints = {
        video: {
          facingMode: cameraFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      setShowCameraModal(true);

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert('Camera permission denied. Please allow camera access and try again.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        alert('No camera found on this device. Please use gallery upload instead.');
      } else {
        alert('Failed to access camera. Please try again or use gallery upload.');
      }
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowCameraModal(false);
  };

  // Flip camera between front and back
  const flipCamera = async () => {
    const newFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(newFacingMode);

    // Stop current stream
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }

    // Start new stream with flipped camera
    try {
      const constraints = {
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Error flipping camera:', error);
      alert('Failed to switch camera. Please try again.');
    }
  };

  // Capture image from camera
  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Failed to capture image. Please try again.');
        return;
      }

      // Create File object from blob
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      // Create a synthetic event object to pass to handleImageUpload
      const syntheticEvent = {
        target: {
          files: [file]
        }
      };

      // Stop camera
      stopCamera();

      // Process the captured image through existing upload handler
      handleImageUpload(syntheticEvent);
    }, 'image/jpeg', 0.95);
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const removeImage = (idx) => {
    // Revoke blob URL to free memory
    if (formData.images && formData.images[idx] && formData.images[idx].startsWith('blob:')) {
      URL.revokeObjectURL(formData.images[idx]);
    }

    // Also revoke preview URL from validation status
    if (imageValidationStatus[idx]?.preview && imageValidationStatus[idx].preview.startsWith('blob:')) {
      URL.revokeObjectURL(imageValidationStatus[idx].preview);
    }

    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx)
    }));

    // Also remove from imageFiles array
    setImageFiles(prev => prev.filter((_, i) => i !== idx));

    // Remove from validation status
    setImageValidationStatus(prev => prev.filter((_, i) => i !== idx));
  };

  const validateStep = async (step) => {
    const newErrors = {};
    let stepErrorMessage = null;
    const fieldConfig = getPropertyTypeConfig();

    switch (step) {
      case 1:
        // Title validation
        if (!formData.title?.trim()) {
          newErrors.title = "Property name is required";
        } else {
          const titleValidation = validateTextLength(formData.title, 1, 200, 'Property title');
          if (!titleValidation.valid) {
            newErrors.title = titleValidation.message;
          }
        }

        // Status validation (should always have a value, but validate anyway)
        if (!formData.status) {
          newErrors.status = "Sell / Rent / PG-Hostel not selected";
        }

        // Property type validation
        if (!formData.propertyType) {
          newErrors.propertyType = "Property type not selected";
        }

        if (Object.keys(newErrors).length > 0) {
          stepErrorMessage = "Please complete all required fields before proceeding";
        }
        break;

      case 2:
        // Location validation
        if (!formData.location?.trim()) {
          newErrors.location = "Location is required";
        } else if (formData.location.trim().length < 5) {
          newErrors.location = "Location must be at least 5 characters";
        }

        // Area validation
        if (!formData.area) {
          newErrors.area = formData.propertyType === 'Plot / Land / Indusrtial Property'
            ? "Area / Carpet area missing"
            : "Area / Carpet area missing";
        } else {
          const isPlotLand = formData.propertyType === 'Plot / Land / Indusrtial Property';
          const areaMax = isPlotLand ? PLOT_LAND_AREA_MAX_SQFT : undefined;
          const areaValidation = validateArea(formData.area, 100, areaMax);
          if (!areaValidation.valid) {
            newErrors.area = areaValidation.message;
          }
        }

        // Map location required - user must manually pin on map
        if (!formData.latitude?.trim() || !formData.longitude?.trim()) {
          newErrors.mapLocation = "Select exact location on map (click on map or drag marker)";
        } else {
          // Validate coordinate format when present
          const latValidation = validateLatitude(formData.latitude);
          if (!latValidation.valid) {
            newErrors.latitude = latValidation.message;
          }
          const lngValidation = validateLongitude(formData.longitude);
          if (!lngValidation.valid) {
            newErrors.longitude = lngValidation.message;
          }
        }

        // Carpet area validation
        if (formData.carpetArea && formData.area) {
          const carpetValidation = validateCarpetArea(formData.carpetArea, formData.area);
          if (!carpetValidation.valid) {
            newErrors.carpetArea = carpetValidation.message;
          }
        }

        // Floor validation
        if (formData.floor && formData.totalFloors) {
          const floorValidation = validateFloors(formData.floor, formData.totalFloors);
          if (!floorValidation.valid) {
            newErrors.floor = floorValidation.message;
          }
        }

        // Dynamic validation based on property type
        if (fieldConfig.bedroomsRequired && !formData.bedrooms) {
          newErrors.bedrooms = "Bedroom / Bathroom not selected";
        } else if (formData.bedrooms) {
          const bedroomsNum = parseInt(formData.bedrooms);
          if (isNaN(bedroomsNum) || bedroomsNum < 0 || bedroomsNum > 10) {
            newErrors.bedrooms = "Invalid bedroom count";
          }
        }

        if (fieldConfig.bathroomsRequired && !formData.bathrooms) {
          newErrors.bathrooms = "Bedroom / Bathroom not selected";
        } else if (formData.bathrooms && formData.bathrooms !== '4+') {
          const bathroomsNum = parseInt(formData.bathrooms, 10);
          const minBathrooms = fieldConfig.bathroomsRequired ? 1 : 0;
          if (isNaN(bathroomsNum) || bathroomsNum < minBathrooms || bathroomsNum > 10) {
            newErrors.bathrooms = "Invalid bathroom count";
          }
        }

        if (fieldConfig.showBalconies && !formData.balconies) {
          newErrors.balconies = "Balconies is required";
        }

        const showFloorNumber = fieldConfig.showFloor && !PROPERTY_TYPES_HIDE_FLOOR_NUMBER.includes(formData.propertyType);
        if (showFloorNumber && !formData.floor) {
          newErrors.floor = "Floor number is required";
        }

        if (fieldConfig.showTotalFloors && !formData.totalFloors) {
          newErrors.totalFloors = "Total floors is required";
        }

        if (fieldConfig.showSeats && !formData.seats) {
          newErrors.seats = "Number of seats is required";
        }

        // State validation - required
        if (!formData.state?.trim()) {
          newErrors.state = "State is required";
        }

        // Facing validation - required when shown
        if (fieldConfig.showFacing && !formData.facing?.trim()) {
          newErrors.facing = "Facing is required";
        }

        if (fieldConfig.showAge && !formData.age?.trim()) {
          newErrors.age = "Property age is required";
        }

        // Furnishing validation - required when shown
        if (fieldConfig.showFurnishing && !formData.furnishing?.trim()) {
          newErrors.furnishing = "Furnishing status missing";
        }

        // Update step error message to include logical validation errors
        if (Object.keys(newErrors).length > 0) {
          // Check if there are logical validation errors (more specific messages)
          if (newErrors.mapLocation) {
            stepErrorMessage = newErrors.mapLocation;
          } else if (newErrors.floor) {
            stepErrorMessage = newErrors.floor;
          } else if (newErrors.carpetArea) {
            stepErrorMessage = newErrors.carpetArea;
          } else if (newErrors.area) {
            stepErrorMessage = newErrors.area;
          } else {
            stepErrorMessage = "Please complete all required fields before proceeding";
          }
        }
        break;

      case 3:
        // Description validation
        if (!formData.description || !formData.description.trim()) {
          newErrors.description = "Description is required";
        } else {
          // Check minimum character count (100 characters)
          const charCount = formData.description.trim().length;
          if (charCount < 100) {
            newErrors.description = `Description must contain at least 100 characters. Currently: ${charCount} characters.`;
          }

          // Check for mobile numbers (Indian format: 10 digits, may have +91, spaces, dashes)
          const mobilePattern = /(\+91[\s-]?)?[6-9]\d{9}/g;
          if (mobilePattern.test(formData.description)) {
            newErrors.description = "Description cannot contain mobile numbers. Please remove any phone numbers.";
          }

          // Check for email addresses
          const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          if (emailPattern.test(formData.description)) {
            newErrors.description = "Description cannot contain email addresses. Please remove any email addresses.";
          }

          // Check maximum character length
          if (formData.description.length > 1000) {
            newErrors.description = "Description cannot exceed 1000 characters.";
          }
        }

        if (!formData.amenities || formData.amenities.length < 2) {
          newErrors.amenities = "Select at least 2 amenities";
        }

        if (Object.keys(newErrors).length > 0) {
          if (newErrors.amenities) {
            stepErrorMessage = newErrors.amenities;
          } else {
            stepErrorMessage = "Please complete the description with valid content before proceeding";
          }
        }
        break;

      case 4:
        // Image validation - Check if images are validated (minimum 3 compulsory)
        // Use imageValidationStatus.length as source of truth (it tracks actual uploaded images)
        // Fallback to formData.images.length for cases where validation status hasn't been initialized yet
        const uploadedImageCount = Math.max(
          imageValidationStatus.length,
          formData.images?.length || 0
        );

        if (uploadedImageCount === 0) {
          newErrors.images = "Upload at least 3 property images (minimum 3 required)";
          stepErrorMessage = "Upload at least 3 property images (minimum 3 required)";
        } else if (uploadedImageCount < 3) {
          newErrors.images = `Upload at least 3 property images (${uploadedImageCount}/3 uploaded)`;
          stepErrorMessage = `Upload at least 3 property images (${uploadedImageCount}/3 uploaded)`;
        } else {
          // Check if any images are still being validated
          if (isCheckingImages) {
            newErrors.images = "Please wait while images are being validated";
            stepErrorMessage = "Please wait while images are being validated";
          }
          // Check if any images are rejected
          else if (imageValidationStatus.some(img => img.status === 'rejected')) {
            const rejectedCount = imageValidationStatus.filter(img => img.status === 'rejected').length;
            newErrors.images = `Please remove ${rejectedCount} rejected image(s) and upload valid property images only`;
            stepErrorMessage = `Please remove ${rejectedCount} rejected image(s) and upload valid property images only`;
          }
          // Check if any images are still pending validation
          else if (imageValidationStatus.some(img => img.status === 'pending' || img.status === 'checking')) {
            newErrors.images = "Please wait for all images to be validated";
            stepErrorMessage = "Please wait for all images to be validated";
          }
          // Check if at least 3 images are approved
          else {
            const approvedCount = imageValidationStatus.filter(img => img.status === 'approved').length;
            if (approvedCount < 3) {
              newErrors.images = `At least 3 images must be approved (${approvedCount}/${uploadedImageCount} approved)`;
              stepErrorMessage = `At least 3 images must be approved (${approvedCount}/${uploadedImageCount} approved)`;
            }
          }
        }
        break;

      case 5:
        // Price validation
        if (!formData.price) {
          newErrors.price = formData.status === 'sale'
            ? "Price / Rent / Budget missing"
            : "Price / Rent / Budget missing";
          stepErrorMessage = "Price / Rent / Budget missing";
        } else {
          const priceValidation = validatePrice(formData.price, formData.status);
          if (!priceValidation.valid) {
            newErrors.price = priceValidation.message;
            if (!stepErrorMessage) stepErrorMessage = priceValidation.message;
          }
        }

        // Validate price per seat for coworking
        if (fieldConfig.showPricePerSeat && !formData.pricePerSeat) {
          newErrors.pricePerSeat = "Price per seat is required";
          if (!stepErrorMessage) stepErrorMessage = "Price per seat is required";
        }

        // Deposit validation for rent
        if (formData.status === 'rent' && formData.depositAmount && formData.price) {
          const depositValidation = validateDeposit(formData.depositAmount, formData.price);
          if (!depositValidation.valid) {
            newErrors.depositAmount = depositValidation.message;
            if (!stepErrorMessage) {
              stepErrorMessage = depositValidation.message;
            }
          }
        }

        // Maintenance charges validation
        if (formData.maintenanceCharges) {
          const maintenanceNum = parseFloat(formData.maintenanceCharges);
          if (isNaN(maintenanceNum) || maintenanceNum < 0) {
            newErrors.maintenanceCharges = "Maintenance charges must be a positive number";
          }
        }
        break;

      default:
        break;
    }

    setErrors(newErrors);
    setStepError(stepErrorMessage);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
    const isValid = await validateStep(currentStep);
    if (isValid) {
      setStepError(null); // Clear step error on successful validation
      setCurrentStep(prev => Math.min(prev + 1, 5));
    } else {
      // Scroll to first error field
      setTimeout(() => {
        if (popupBodyRef.current) {
          const firstErrorField = popupBodyRef.current.querySelector('.error, .seller-popup-error-text');
          if (firstErrorField) {
            firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            // If no field with error class, scroll to top to show step error
            popupBodyRef.current.scrollTop = 0;
          }
        }
      }, 100);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // Check if a step is completed (user has moved past it)
  const isStepCompleted = (stepId) => {
    return currentStep > stepId;
  };

  // Handle step circle click - allow going back to completed steps, prevent skipping forward
  const handleStepClick = async (stepId) => {
    // Allow clicking on current step (no change)
    if (stepId === currentStep) {
      return;
    }

    // Allow going back to completed steps (steps that have been completed)
    if (stepId < currentStep) {
      setCurrentStep(stepId);
      return;
    }

    // Prevent going forward to incomplete steps
    // User must use the "Next" button to move forward after completing current step
    // This ensures validation happens before moving forward
  };

  const handleSubmit = async () => {
    // CRITICAL: Block all publishing if form was discarded
    if (isDiscarded) {
      console.log('Publishing blocked: Form was discarded');
      return;
    }

    const isValid = await validateStep(currentStep);
    if (!isValid) return;

    setIsSubmitting(true);
    setUploadingImages(true);

    try {
      let uploadedImageUrls = [];
      let propertyId = null;

      // For new properties: Create property first to get ID, then upload images with moderation
      // For edit: Use existing property ID
      if (editIndex !== null) {
        propertyId = properties[editIndex]?.id;
      }

      // If editing, handle images first
      if (editIndex !== null && imageFiles.length > 0) {
        try {
          // Upload each image file with property ID for moderation
          const uploadPromises = imageFiles.map(async (file, index) => {
            try {
              const response = await sellerPropertiesAPI.uploadImage(file, propertyId);
              if (response.success && response.data && response.data.url) {
                // Check moderation status
                const moderationStatus = response.data.moderation_status;
                if (moderationStatus === 'UNSAFE') {
                  return {
                    success: false,
                    index,
                    error: response.data.moderation_reason || 'Image rejected by moderation system'
                  };
                }
                if (moderationStatus === 'NEEDS_REVIEW') {
                  // Image is under review - still add it but log the status
                  console.log(`Image ${index + 1} is under review:`, response.data.moderation_reason);
                  // Note: Review images are saved but may not be immediately visible
                  // They will be moved to approved folder after admin review
                }
                return {
                  success: true,
                  url: response.data.url,
                  index,
                  moderationStatus: moderationStatus
                };
              } else {
                // Handle error response - check for moderation info in error data
                const errorData = response.data || {};
                const moderationStatus = errorData.moderation_status;
                let errorMsg = response.message || errorData.errors?.[0] || 'Upload failed';

                // If it's a moderation rejection, use the moderation reason
                if (moderationStatus === 'UNSAFE' && errorData.moderation_reason) {
                  errorMsg = errorData.moderation_reason;
                }

                console.error(`Image ${index + 1} upload failed:`, errorMsg);
                return { success: false, index, error: errorMsg };
              }
            } catch (error) {
              console.error(`Image ${index + 1} upload error:`, error);
              return { success: false, index, error: error.message || 'Upload failed' };
            }
          });

          const results = await Promise.all(uploadPromises);
          const successful = results.filter(r => r.success);
          const failed = results.filter(r => !r.success);

          if (failed.length > 0) {
            const errorMessages = failed.map(f => f.error).filter(Boolean);
            const uniqueErrors = [...new Set(errorMessages)];
            const errorMessage = failed.length === imageFiles.length
              ? `Failed to upload all images. ${uniqueErrors[0] || 'Please check server permissions and try again.'}`
              : `Failed to upload ${failed.length} of ${imageFiles.length} images. ${uniqueErrors.join('; ')}`;
            alert(errorMessage);
            setUploadingImages(false);
            setIsSubmitting(false);
            return;
          }

          uploadedImageUrls = successful.map(r => r.url);

          // Update formData with uploaded URLs
          if (uploadedImageUrls.length > 0) {
            formData.images = [...(formData.images || []).filter(img =>
              typeof img === 'string' && !img.startsWith('blob:')
            ), ...uploadedImageUrls];
          }
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          alert(`Failed to upload images: ${uploadError.message || 'Please check server permissions and try again.'}`);
          setUploadingImages(false);
          setIsSubmitting(false);
          return;
        }
      } else if (editIndex !== null && formData.images && formData.images.length > 0) {
        // If editing and no new images, filter out blob URLs
        uploadedImageUrls = formData.images.filter(img =>
          typeof img === 'string' && !img.startsWith('blob:')
        );
        formData.images = uploadedImageUrls;
      }

      setUploadingImages(false);

      // For new properties: Create property first, then upload images
      if (editIndex === null) {
        // Create property with empty images array first to get property ID
        const propertyDataWithoutImages = { ...formData, images: [] };
        let createdProperty;
        try {
          createdProperty = await addProperty(propertyDataWithoutImages);
        } catch (error) {
          // If property creation fails, we can't upload images
          console.error('Property creation failed:', error);
          throw new Error('Failed to create property. Please try again.');
        }

        if (createdProperty && createdProperty.id) {
          propertyId = createdProperty.id;
        } else {
          // Property was created but ID not returned - try to get from refresh
          throw new Error('Failed to get property ID after creation. Please refresh and try again.');
        }

        // Now upload images with property ID for moderation
        if (imageFiles.length > 0) {
          setUploadingImages(true);
          try {
            const uploadPromises = imageFiles.map(async (file, index) => {
              try {
                const response = await sellerPropertiesAPI.uploadImage(file, propertyId);

                // CRITICAL: Check moderation_status explicitly - only approve if "SAFE"
                // Backend returns: { success: true, data: { moderation_status: "PENDING" | "NEEDS_REVIEW" | "SAFE" } }
                if (response.success && response.data && response.data.url) {
                  const moderationStatus = response.data.moderation_status;

                  // Only approve if moderation_status is explicitly "SAFE"
                  if (moderationStatus === 'SAFE') {
                    // SAFE - Image approved
                    return {
                      success: true,
                      url: response.data.url,
                      index,
                      moderationStatus: 'SAFE'
                    };
                  }
                  // Handle PENDING or NEEDS_REVIEW - mark as pending, NOT approved
                  else if (moderationStatus === 'PENDING' || moderationStatus === 'NEEDS_REVIEW' || response.pending) {
                    // Image is under review
                    console.log(`Image ${index + 1} is under review:`, response.data.moderation_reason || response.message);
                    return {
                      success: true,
                      url: response.data.url,
                      index,
                      moderationStatus: moderationStatus || 'PENDING',
                      pending: true
                    };
                  }
                  // If moderation_status is missing, treat as pending (backward compatibility)
                  else {
                    console.warn(`Image ${index + 1} response missing moderation_status, treating as pending review`);
                    return {
                      success: true,
                      url: response.data.url,
                      index,
                      moderationStatus: 'PENDING',
                      pending: true
                    };
                  }
                } else {
                  // This shouldn't happen if response.success is true
                  return { success: false, index, error: response.message || 'Upload failed' };
                }
              } catch (error) {
                // Handle REJECTED images - error contains specific rejection message
                console.error(`Image ${index + 1} upload error:`, error);

                // Extract specific error message from API response
                let errorMsg = 'Upload failed';
                if (error.message) {
                  errorMsg = error.message; // This is the SPECIFIC error from moderation API
                } else if (error.details && error.details.detected_issue) {
                  errorMsg = error.details.detected_issue;
                }

                // Show the exact error message from moderation API
                return {
                  success: false,
                  index,
                  error: errorMsg,
                  error_code: error.error_code,
                  rejected: error.rejected || false
                };
              }
            });

            const results = await Promise.all(uploadPromises);
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);

            if (failed.length > 0) {
              // If some images failed but property was created, still update with successful images
              if (successful.length > 0) {
                uploadedImageUrls = successful.map(r => r.url);
                await sellerPropertiesAPI.update(propertyId, { images: uploadedImageUrls });
              }
              // Property was created successfully, show success modal regardless of image failures
              setUploadingImages(false);
              setIsSubmitting(false);
              setIsPublished(true); // Mark as published before showing success modal
              setShowEditNoticeModal(true);
              return;
            }

            uploadedImageUrls = successful.map(r => r.url);

            // Update property with uploaded image URLs
            if (uploadedImageUrls.length > 0) {
              try {
                await sellerPropertiesAPI.update(propertyId, { images: uploadedImageUrls });
              } catch (updateError) {
                console.error('Failed to update property with images:', updateError);
                // Property exists but images weren't linked - still show success
              }
            }

            // Upload video if provided
            if (formData.video && formData.video.file && propertyId) {
              try {
                console.log('Uploading video for property ID:', propertyId);
                const videoResponse = await sellerPropertiesAPI.uploadVideo(formData.video.file, propertyId);
                if (videoResponse.success && videoResponse.data?.url) {
                  console.log('Video uploaded successfully:', videoResponse.data.url);
                  // Video URL is automatically saved to database by the backend
                }
              } catch (videoError) {
                console.error('Video upload error:', videoError);
                // Don't fail the entire submission if video upload fails
              }
            }

            // Property was created successfully, show success modal
            setUploadingImages(false);
            setIsSubmitting(false);
            setIsPublished(true); // Mark as published before showing success modal
            setShowEditNoticeModal(true);
          } catch (uploadError) {
            console.error('Image upload error:', uploadError);
            // Property was created successfully, show success modal even if images failed
            setUploadingImages(false);
            setIsSubmitting(false);
            setIsPublished(true); // Mark as published before showing success modal
            setShowEditNoticeModal(true);
          }
        } else {
          // No images to upload, property already created
          setIsPublished(true); // Mark as published before showing success modal
          setShowEditNoticeModal(true);
        }
      } else {
        // Editing existing property
        const propertyId = properties[editIndex]?.id;
        if (propertyId) {
          // Upload video if a new video file was selected
          if (formData.video && formData.video.file) {
            try {
              console.log('Uploading video for property ID:', propertyId);
              const videoResponse = await sellerPropertiesAPI.uploadVideo(formData.video.file, propertyId);
              if (videoResponse.success && videoResponse.data?.url) {
                // Update formData with the uploaded video URL
                formData.videoUrl = videoResponse.data.url;
                console.log('Video uploaded successfully:', videoResponse.data.url);
              }
            } catch (videoError) {
              console.error('Video upload error:', videoError);
              // Continue with property update even if video upload fails
            }
          }

          // Prepare update data - filter out blob URLs and ensure images are URLs
          const updateData = { ...formData };

          // Filter images to only include valid URLs (not blob URLs)
          if (updateData.images && Array.isArray(updateData.images)) {
            updateData.images = updateData.images
              .filter(img => typeof img === 'string' && !img.startsWith('blob:'))
              .map(img => {
                // If image is already a full URL, use it; otherwise ensure it's a valid path
                if (img.startsWith('http://') || img.startsWith('https://')) {
                  return img;
                }
                // If it's a relative path, make it absolute
                if (img.startsWith('/')) {
                  return img;
                }
                return img;
              });
          }

          console.log('Updating property with data:', {
            propertyId,
            images: updateData.images,
            imageCount: updateData.images?.length || 0
          });

          await updateProperty(propertyId, updateData);
          // Show success modal instead of alert
          setUploadingImages(false);
          setIsSubmitting(false);
          setIsPublished(true); // Mark as published before showing success modal
          setShowEditNoticeModal(true);
          return;
        }
      }

      // Note: onClose() is handled by PropertyUploadSuccessModal's onClose handler
      // Do not call onClose() here as it would unmount the component before modal can render
    } catch (error) {
      setUploadingImages(false);
      // Show detailed error message
      const errorMessage = error.message || error.status === 401
        ? 'Authentication required. Please log in to add properties.'
        : error.status === 403
          ? 'Access denied. Please check your permissions.'
          : 'Failed to save property. Please check your connection and try again.';
      alert(errorMessage);
      console.error('Property save error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="seller-popup-step-indicator">
      {STEPS.map((step, idx) => {
        const isCompleted = isStepCompleted(step.id);
        // Allow clicking on completed steps (to go back) or current step
        const isClickable = isCompleted || step.id === currentStep;

        return (
          <div
            key={step.id}
            className={`seller-popup-step-item ${currentStep === step.id ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isClickable ? 'clickable' : ''}`}
          >
            <div
              className="seller-popup-step-circle"
              onClick={() => isClickable && handleStepClick(step.id)}
              style={{ cursor: isClickable ? 'pointer' : 'default' }}
              title={!isClickable && step.id > currentStep ? 'Complete current step first' : isClickable && isCompleted ? 'Click to go back to this step' : ''}
            >
              {isCompleted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span>{step.icon}</span>
              )}
            </div>
            <span className="seller-popup-step-title">{step.title}</span>
            {idx < STEPS.length - 1 && <div className="step-line" />}
          </div>
        );
      })}
    </div>
  );

  const renderStep1 = () => (
    <div className="seller-popup-step-content">
      {isRestrictedEdit && (
        <div className="restricted-edit-warning" style={{
          padding: '12px 16px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#856404',
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          ⚠️ This property was created more than 24 hours ago. You can only edit the <strong>Title</strong> and <strong>Price-related fields</strong> (price, price negotiable, maintenance charges, deposit amount). Location-related fields (location, state, additional address) and all other fields are locked.
        </div>
      )}
      <h3 className="step-heading">Basic Information</h3>
      <p className="step-subheading">Let's start with the basic details of your property</p>
      {stepError && <span className="seller-popup-error-text seller-popup-step-error">{stepError}</span>}

      <div className="seller-popup-form-group">
        <label>Property Title <span className="required">*</span></label>
        <input
          type="text"
          name="title"
          placeholder="e.g., Spacious 3BHK Apartment with Sea View"
          value={formData.title}
          onChange={(e) => handleChange('title', e.target.value)}
          className={errors.title ? 'error' : ''}
          disabled={false}
        />
        {errors.title && <span className="seller-popup-error-text error-message">{errors.title}</span>}
      </div>

      <div className="seller-popup-form-group" data-field="status">
        <label>I want to</label>
        <div className={`toggle-buttons ${errors.status ? 'error' : ''}`}>
          <button
            type="button"
            className={`toggle-btn ${formData.status === 'sale' ? 'active' : ''}`}
            onClick={() => !isRestrictedEdit && handleChange('status', 'sale')}
            disabled={isRestrictedEdit}
            style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
          >
            <span className="toggle-icon">🏷️</span>
            Sell
          </button>
          <button
            type="button"
            className={`toggle-btn ${formData.status === 'rent' ? 'active' : ''}`}
            onClick={() => !isRestrictedEdit && handleChange('status', 'rent')}
            disabled={isRestrictedEdit}
            style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
          >
            <span className="toggle-icon">🔑</span>
            Rent / Lease
          </button>
        </div>
        {errors.status && <span className="seller-popup-error-text error-message">{errors.status}</span>}
      </div>

      <div className="seller-popup-form-group" data-field="propertyType">
        <label>Property Type <span className="required">*</span></label>
        <div className={`seller-popup-property-type-grid ${errors.propertyType ? 'error' : ''}`}>
          {PROPERTY_TYPES.map(type => (
            <button
              key={type.value}
              type="button"
              className={`property-type-btn ${formData.propertyType === type.value ? 'active' : ''}`}
              onClick={() => !isRestrictedEdit && handleChange('propertyType', type.value)}
              disabled={isRestrictedEdit}
              style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
            >
              <span className="seller-popup-type-icon">{type.icon}</span>
              <span className="seller-popup-type-label">{type.value}</span>
            </button>
          ))}
        </div>
        {errors.propertyType && <span className="seller-popup-error-text error-message">{errors.propertyType}</span>}
      </div>

      {/* Available for Bachelors - Show for specific property types when status is rent */}
      {formData.status === 'rent' &&
        ['Apartment', 'Independent House', 'Penthouse', 'Villa / Banglow', 'Row House/ Farm House', 'Studio Apartment'].includes(formData.propertyType) && (
          <div className="seller-popup-form-group">
            <label>Available for Bachelors</label>
            <div className="toggle-buttons">
              <button
                type="button"
                className={`toggle-btn ${formData.availableForBachelors ? 'active' : ''}`}
                onClick={() => !isRestrictedEdit && handleChange('availableForBachelors', true)}
                disabled={isRestrictedEdit}
                style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
              >
                <span className="toggle-icon">✓</span>
                Yes
              </button>
              <button
                type="button"
                className={`toggle-btn ${!formData.availableForBachelors ? 'active' : ''}`}
                onClick={() => !isRestrictedEdit && handleChange('availableForBachelors', false)}
                disabled={isRestrictedEdit}
                style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
              >
                <span className="toggle-icon">✗</span>
                No
              </button>
            </div>
          </div>
        )}
    </div>
  );

  // Get property type configuration
  const getPropertyTypeConfig = () => {
    if (!formData.propertyType) return PROPERTY_TYPE_FIELDS.residential_standard; // default

    const propertyType = PROPERTY_TYPES.find(pt => pt.value === formData.propertyType);
    if (!propertyType) return PROPERTY_TYPE_FIELDS.residential_standard;

    // Build config key based on category and subCategory
    const configKey = `${propertyType.category}_${propertyType.subCategory}`;
    return PROPERTY_TYPE_FIELDS[configKey] || PROPERTY_TYPE_FIELDS.residential_standard;
  };

  // Field validation function for auto-scroll
  const validateField = useCallback((fieldName, value) => {
    const trimmedValue = typeof value === 'string' ? value.trim() : value;
    const fieldConfig = getPropertyTypeConfig();

    switch (fieldName) {
      case 'title':
        return trimmedValue && trimmedValue.length >= 3;
      case 'status':
        return value === 'sale' || value === 'rent' || value === 'pg-hostel';
      case 'propertyType':
        return !!value && PROPERTY_TYPES.some(pt => pt.value === value);
      case 'location':
        return trimmedValue && trimmedValue.length >= 3;
      case 'state':
        return trimmedValue && trimmedValue.length >= 2;
      case 'area':
        if (!value) return false;
        const isPlotLandArea = formData.propertyType === 'Plot / Land / Indusrtial Property';
        const areaMaxForType = isPlotLandArea ? PLOT_LAND_AREA_MAX_SQFT : undefined;
        const areaValidation = validateArea(value, 100, areaMaxForType);
        return areaValidation.valid;
      case 'carpetArea':
        if (!value) return true; // Optional field
        if (!formData.area) return true; // Can't validate without area
        const carpetValidation = validateCarpetArea(value, formData.area);
        return carpetValidation.valid;
      case 'bedrooms':
        if (!fieldConfig.showBedrooms || !fieldConfig.bedroomsRequired) return true;
        return !!value;
      case 'bathrooms':
        if (!fieldConfig.showBathrooms || !fieldConfig.bathroomsRequired) return true;
        return !!value;
      case 'floor':
        if (!value || !formData.totalFloors) return true; // Optional or can't validate
        const floorValidation = validateFloors(value, formData.totalFloors);
        return floorValidation.valid;
      case 'facing':
        if (!fieldConfig.showFacing) return true;
        return trimmedValue && trimmedValue.length >= 2;
      case 'furnishing':
        if (!fieldConfig.showFurnishing) return true;
        return trimmedValue && trimmedValue.length >= 2;
      case 'description':
        if (!trimmedValue) return false;
        return trimmedValue.length >= 100 && trimmedValue.length <= 1000;
      case 'price':
        if (!value) return false;
        const priceValidation = validatePrice(value, formData.status);
        return priceValidation.valid;
      case 'depositAmount':
        if (!value || formData.status !== 'rent') return true; // Optional
        if (!formData.price) return true; // Can't validate without price
        const depositValidation = validateDeposit(value, formData.price);
        return depositValidation.valid;
      default:
        return false;
    }
  }, [formData.area, formData.totalFloors, formData.status, formData.price]);

  // Define field order for each step
  const getFieldOrderForStep = useCallback((step) => {
    const fieldConfig = getPropertyTypeConfig();

    switch (step) {
      case 1:
        return ['title', 'status', 'propertyType'];
      case 2:
        const step2Fields = ['location', 'mapLocation', 'state'];
        if (fieldConfig.showBedrooms && fieldConfig.bedroomsRequired) {
          step2Fields.push('bedrooms');
        }
        if (fieldConfig.showBathrooms && fieldConfig.bathroomsRequired) {
          step2Fields.push('bathrooms');
        }
        step2Fields.push('area');
        if (fieldConfig.showCarpetArea) {
          step2Fields.push('carpetArea');
        }
        const showFloorNumber = fieldConfig.showFloor && !PROPERTY_TYPES_HIDE_FLOOR_NUMBER.includes(formData.propertyType);
        if (showFloorNumber) step2Fields.push('floor');
        if (fieldConfig.showTotalFloors) step2Fields.push('totalFloors');
        if (fieldConfig.showSeats) {
          step2Fields.push('seats');
        }
        if (fieldConfig.showFacing) {
          step2Fields.push('facing');
        }
        if (fieldConfig.showFurnishing) {
          step2Fields.push('furnishing');
        }
        return step2Fields;
      case 3:
        return ['description'];
      case 4:
        return []; // Images - handled differently
      case 5:
        const step5Fields = ['price'];
        if (fieldConfig.showPricePerSeat) {
          step5Fields.push('pricePerSeat');
        }
        if (formData.status === 'rent') {
          step5Fields.push('depositAmount');
        }
        return step5Fields;
      default:
        return [];
    }
  }, [formData.propertyType, formData.status]);

  // Auto-scroll hook - only active on current step
  const currentStepFieldOrder = getFieldOrderForStep(currentStep);
  useAutoScrollForm({
    formData,
    errors,
    validateField,
    fieldOrder: currentStepFieldOrder,
    formRef: popupBodyRef,
    enabled: currentStep <= 3, // Only enable for steps 1-3 (steps 4-5 have different UI)
    scrollOffset: 50,
    scrollDelay: 400,
  });

  const fieldConfig = getPropertyTypeConfig();

  const renderStep2 = () => (
    <div className="seller-popup-step-content">
      {isRestrictedEdit && (
        <div className="restricted-edit-warning" style={{
          padding: '12px 16px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#856404',
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          ⚠️ This property was created more than 24 hours ago. You can only edit the <strong>Title</strong> and <strong>Price-related fields</strong>. Location-related fields (location, state, additional address) and all other fields are locked.
        </div>
      )}
      <h3 className="step-heading">Property Details</h3>
      <p className="step-subheading">Tell us more about your property specifications</p>
      {stepError && <span className="seller-popup-error-text seller-popup-step-error">{stepError}</span>}

      <div className="seller-popup-form-group" data-field="location">
        <label>Location <span className="required">*</span></label>
        <LocationAutoSuggest
          placeholder="Enter locality, area or landmark"
          value={formData.location}
          onChange={(locationData) => {
            if (isRestrictedEdit) return;
            if (!locationData) {
              setFormData(prev => ({ ...prev, location: "", latitude: "", longitude: "" }));
              setStateAutoFilled(false);
              setMapCenterFromAddress(null);
              return;
            }
            // Auto-populate state from location input if available
            const stateFromLocation = locationData.state || '';
            const wasStateAutoFilled = !!stateFromLocation;

            setFormData(prev => ({
              ...prev,
              location: locationData.fullAddress || locationData.placeName || "",
              // Do NOT auto-pin from typed address: user must manually select location on map
              latitude: "",
              longitude: "",
              // Always update state from location (even if empty) to reflect the new location
              state: stateFromLocation
            }));
            // Store center for map - so map opens at this area when user opens LocationPicker
            if (locationData.coordinates?.lat != null && locationData.coordinates?.lng != null) {
              setMapCenterFromAddress({ lng: locationData.coordinates.lng, lat: locationData.coordinates.lat });
            } else {
              setMapCenterFromAddress(null);
            }

            // Track if state was auto-filled from location input
            setStateAutoFilled(wasStateAutoFilled);
            if (errors.location || errors.state) {
              setErrors(prev => ({ ...prev, location: null, state: null }));
            }
            if (stepError) {
              setStepError(null);
            }
          }}
          className={errors.location ? "seller-location-error" : ""}
          error={errors.location}
          disabled={isRestrictedEdit}
        />
      </div>

      {/* Location Picker Button */}
      <div className="seller-popup-form-group" data-field="mapLocation">
        <label>Property Location on Map <span className="required">*</span></label>
        {!formData.latitude || !formData.longitude ? (
          <>
            <button
              type="button"
              className="location-picker-btn"
              onClick={() => !isRestrictedEdit && setShowLocationPicker(true)}
              disabled={isRestrictedEdit}
              style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span>Add Location on Map</span>
            </button>
            <span className={errors.mapLocation ? "seller-popup-error-text" : "seller-popup-hint"}>
              {errors.mapLocation || "Select exact location on map for better visibility"}
            </span>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="location-icon" style={{ fontSize: '18px' }}>📍</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.875rem', color: '#059669', fontWeight: '500' }}>
                  Location set on map
                </span>
              </div>
            </div>
            <small className="location-picker-coordinates" style={{ marginLeft: '26px', fontSize: '0.75rem', color: '#059669', fontFamily: 'monospace' }}>
              Coordinates: {parseFloat(formData.latitude).toFixed(6)}, {parseFloat(formData.longitude).toFixed(6)}
            </small>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="location-picker-change-btn"
                onClick={() => !isRestrictedEdit && setShowLocationPicker(true)}
                disabled={isRestrictedEdit}
                title={isRestrictedEdit ? "Location cannot be changed after 24 hours" : "Change location"}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.875rem',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: isRestrictedEdit ? 'not-allowed' : 'pointer',
                  color: isRestrictedEdit ? '#9ca3af' : '#374151',
                  fontWeight: '500',
                  opacity: isRestrictedEdit ? 0.5 : 1
                }}
              >
                Change Location
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isRestrictedEdit) {
                    setFormData(prev => ({ ...prev, latitude: '', longitude: '' }));
                  }
                }}
                disabled={isRestrictedEdit}
                title={isRestrictedEdit ? "Location cannot be removed after 24 hours" : "Remove location"}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.875rem',
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  cursor: isRestrictedEdit ? 'not-allowed' : 'pointer',
                  color: isRestrictedEdit ? '#d1d5db' : '#991b1b',
                  fontWeight: '500',
                  opacity: isRestrictedEdit ? 0.5 : 1
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {/* State and Additional Address Fields */}
      <div className="form-row two-cols">
        <div className="seller-popup-form-group" data-field="state">
          <label>
            State <span className="required">*</span>
            {stateAutoFilled && !isRestrictedEdit && (
              <span style={{
                fontSize: '0.75rem',
                color: '#059669',
                marginLeft: '8px',
                fontWeight: 'normal'
              }}>
                (Auto-filled from map)
              </span>
            )}
          </label>
          <div style={{ position: 'relative' }}>
            <StateAutoSuggest
              placeholder="Enter state"
              value={formData.state || ''}
              onChange={(stateName) => {
                if (!isRestrictedEdit) {
                  handleChange('state', stateName);
                  // If user manually changes state, clear auto-fill flag
                  if (stateAutoFilled && stateName !== formData.state) {
                    setStateAutoFilled(false);
                  }
                }
              }}
              className={errors.state ? "seller-state-error" : ""}
              error={errors.state}
              disabled={isRestrictedEdit}
              readOnly={stateAutoFilled && !isRestrictedEdit}
            />
            {stateAutoFilled && !isRestrictedEdit && (
              <button
                type="button"
                onClick={() => {
                  setStateAutoFilled(false);
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#7c3aed',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  zIndex: 10
                }}
                title="Edit state manually"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="seller-popup-form-group">
          <label>Additional Address (Optional)</label>
          <input
            type="text"
            placeholder="Enter additional address details"
            value={formData.additionalAddress || ''}
            onChange={(e) => !isRestrictedEdit && handleChange('additionalAddress', e.target.value)}
            disabled={isRestrictedEdit}
          />
        </div>
      </div>

      {/* Dynamic fields based on property type */}
      {(fieldConfig.showBedrooms || fieldConfig.showBathrooms || fieldConfig.showBalconies) && (
        <div className="form-row three-cols">
          {fieldConfig.showBedrooms && (
            <div className="seller-popup-form-group" data-field="bedrooms">
              <label>
                {formData.propertyType === 'Studio Apartment' ? 'Studio' : 'Bedrooms'}
                {fieldConfig.bedroomsRequired && <span className="required">*</span>}
              </label>
              {formData.propertyType === 'Studio Apartment' ? (
                <div className="number-selector">
                  <button
                    type="button"
                    className="num-btn active"
                    disabled
                    style={{ cursor: 'not-allowed', opacity: 0.7 }}
                  >
                    Studio
                  </button>
                </div>
              ) : (
                <div className={`number-selector ${errors.bedrooms ? 'error' : ''}`}>
                  {['1', '2', '3', '4', '5', '5+'].map(num => (
                    <button
                      key={num}
                      type="button"
                      className={`num-btn ${formData.bedrooms === num ? 'active' : ''}`}
                      onClick={() => !isRestrictedEdit && handleChange('bedrooms', num)}
                      disabled={isRestrictedEdit}
                      style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              )}
              {errors.bedrooms && <span className="seller-popup-error-text error-message">{errors.bedrooms}</span>}
            </div>
          )}

          {fieldConfig.showBathrooms && (
            <div className="seller-popup-form-group" data-field="bathrooms">
              <label>Bathrooms {fieldConfig.bathroomsRequired && <span className="required">*</span>}</label>
              <div className={`number-selector ${errors.bathrooms ? 'error' : ''}`}>
                {(fieldConfig.bathroomsRequired ? ['1', '2', '3', '4', '4+'] : ['0', '1', '2', '3', '4', '4+']).map(num => (
                  <button
                    key={num}
                    type="button"
                    className={`num-btn ${formData.bathrooms === num ? 'active' : ''}`}
                    onClick={() => !isRestrictedEdit && handleChange('bathrooms', num)}
                    disabled={isRestrictedEdit}
                    style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
                  >
                    {num}
                  </button>
                ))}
              </div>
              {errors.bathrooms && <span className="seller-popup-error-text error-message">{errors.bathrooms}</span>}
            </div>
          )}

          {fieldConfig.showBalconies && (
            <div className="seller-popup-form-group" data-field="balconies">
              <label>Balconies <span className="required">*</span></label>
              <div className={`number-selector ${errors.balconies ? 'error' : ''}`}>
                {['0', '1', '2', '3', '3+'].map(num => (
                  <button
                    key={num}
                    type="button"
                    className={`num-btn ${formData.balconies === num ? 'active' : ''}`}
                    onClick={() => !isRestrictedEdit && handleChange('balconies', num)}
                    disabled={isRestrictedEdit}
                    style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
                  >
                    {num}
                  </button>
                ))}
              </div>
              {errors.balconies && <span className="seller-popup-error-text error-message">{errors.balconies}</span>}
            </div>
          )}
        </div>
      )}

      <div className="form-row two-cols">
        <div className="seller-popup-form-group" data-field="area">
          <label>
            {formData.propertyType === 'Plot / Land / Indusrtial Property' ? 'Plot Area' : 'Built-up Area'}
            <span className="required">*</span>
          </label>
          <div className="input-with-suffix">
            <input
              type="number"
              name="area"
              placeholder={formData.propertyType === 'Plot / Land / Indusrtial Property' ? 'Enter plot area' : 'Enter area'}
              value={formData.area}
              onChange={(e) => !isRestrictedEdit && handleChange('area', e.target.value)}
              className={errors.area ? 'error' : ''}
              disabled={isRestrictedEdit}
            />
            <span className="suffix">sq.ft</span>
          </div>
          {errors.area && <span className="seller-popup-error-text">{errors.area}</span>}
        </div>

        {fieldConfig.showCarpetArea && (
          <div className="seller-popup-form-group" data-field="carpetArea">
            <label>Carpet Area</label>
            <div className="input-with-suffix">
              <input
                type="number"
                name="carpetArea"
                placeholder="Enter area"
                value={formData.carpetArea}
                onChange={(e) => !isRestrictedEdit && handleChange('carpetArea', e.target.value)}
                disabled={isRestrictedEdit}
              />
              <span className="suffix">sq.ft</span>
            </div>
          </div>
        )}
      </div>

      {(fieldConfig.showFloor || fieldConfig.showTotalFloors) && (
        <div className="form-row two-cols">
          {fieldConfig.showFloor && !PROPERTY_TYPES_HIDE_FLOOR_NUMBER.includes(formData.propertyType) && (
            <div className="seller-popup-form-group" data-field="floor">
              <label>Floor Number <span className="required">*</span></label>
              <input
                type="number"
                name="floor"
                min={0}
                step={1}
                placeholder="e.g., 5"
                value={formData.floor}
                onChange={(e) => {
                  if (isRestrictedEdit) return;
                  const v = e.target.value;
                  if (v === '' || /^\d+$/.test(v)) handleChange('floor', v);
                }}
                disabled={isRestrictedEdit}
              />
              {errors.floor && <span className="seller-popup-error-text">{errors.floor}</span>}
            </div>
          )}

          {fieldConfig.showTotalFloors && (
            <div className="seller-popup-form-group" data-field="totalFloors">
              <label>Total Floors <span className="required">*</span></label>
              <input
                type="number"
                placeholder="Total floors in building"
                value={formData.totalFloors}
                onChange={(e) => !isRestrictedEdit && handleChange('totalFloors', e.target.value)}
                disabled={isRestrictedEdit}
              />
              {errors.totalFloors && <span className="seller-popup-error-text">{errors.totalFloors}</span>}
            </div>
          )}
        </div>
      )}

      {fieldConfig.showSeats && (
        <div className="form-row two-cols">
          <div className="seller-popup-form-group" data-field="seats">
            <label>Number of Seats <span className="required">*</span></label>
            <input
              type="number"
              placeholder="e.g., 10"
              value={formData.seats}
              onChange={(e) => !isRestrictedEdit && handleChange('seats', e.target.value)}
              className={errors.seats ? 'error' : ''}
              disabled={isRestrictedEdit}
            />
            {errors.seats && <span className="seller-popup-error-text">{errors.seats}</span>}
          </div>
        </div>
      )}

      {(fieldConfig.showFacing || fieldConfig.showAge || fieldConfig.showFurnishing) && (
        <div className="form-row three-cols">
          {fieldConfig.showFacing && (
            <div className="seller-popup-form-group" data-field="facing">
              <label>Facing <span className="required">*</span></label>
              <select
                name="facing"
                value={formData.facing}
                onChange={(e) => !isRestrictedEdit && handleChange('facing', e.target.value)}
                disabled={isRestrictedEdit}
                className={errors.facing ? 'error' : ''}
              >
                <option value="">Select</option>
                {FACING_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {errors.facing && <span className="seller-popup-error-text">{errors.facing}</span>}
            </div>
          )}

          {fieldConfig.showAge && (
            <div className="seller-popup-form-group" data-field="age">
              <label>Property Age <span className="required">*</span></label>
              <select
                value={formData.age}
                onChange={(e) => !isRestrictedEdit && handleChange('age', e.target.value)}
                disabled={isRestrictedEdit}
              >
                <option value="">Select</option>
                {AGE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {errors.age && <span className="seller-popup-error-text">{errors.age}</span>}
            </div>
          )}

          {fieldConfig.showFurnishing && (
            <div className="seller-popup-form-group">
              <label>Furnishing {fieldConfig.showFurnishing && <span className="required">*</span>}</label>
              <select
                value={formData.furnishing}
                onChange={(e) => !isRestrictedEdit && handleChange('furnishing', e.target.value)}
                disabled={isRestrictedEdit}
                className={errors.furnishing ? 'error' : ''}
              >
                <option value="">Select</option>
                {FURNISHING_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {errors.furnishing && <span className="seller-popup-error-text">{errors.furnishing}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Get available amenities based on property type
  const getAvailableAmenities = () => {
    if (!formData.propertyType) return AMENITIES;

    const propertyType = PROPERTY_TYPES.find(pt => pt.value === formData.propertyType);
    if (!propertyType) return AMENITIES;

    // Special case for Farm House
    if (formData.propertyType === 'Row House/ Farm House') {
      const amenityIds = PROPERTY_TYPE_AMENITIES.residential_farmhouse;
      return AMENITIES.filter(a => amenityIds.includes(a.id));
    }

    // Special case for Plot/Land
    if (formData.propertyType === 'Plot / Land / Indusrtial Property') {
      const amenityIds = PROPERTY_TYPE_AMENITIES.land_plot;
      return AMENITIES.filter(a => amenityIds.includes(a.id));
    }

    // For residential properties
    if (propertyType.category === 'residential') {
      const amenityIds = PROPERTY_TYPE_AMENITIES.residential;
      return AMENITIES.filter(a => amenityIds.includes(a.id));
    }

    // For commercial properties
    if (propertyType.category === 'commercial') {
      const configKey = `${propertyType.category}_${propertyType.subCategory}`;
      const amenityIds = PROPERTY_TYPE_AMENITIES[configKey] || PROPERTY_TYPE_AMENITIES.commercial_office;
      return AMENITIES.filter(a => amenityIds.includes(a.id));
    }

    // For PG/Hostel
    if (propertyType.category === 'pg') {
      const amenityIds = PROPERTY_TYPE_AMENITIES.pg_accommodation;
      return AMENITIES.filter(a => amenityIds.includes(a.id));
    }

    // For land
    if (propertyType.category === 'land') {
      const amenityIds = PROPERTY_TYPE_AMENITIES.land_plot;
      return AMENITIES.filter(a => amenityIds.includes(a.id));
    }

    // Default: return all amenities
    return AMENITIES;
  };

  const renderStep3 = () => {
    const availableAmenities = getAvailableAmenities();

    return (
      <div className="seller-popup-step-content">
        {isRestrictedEdit && (
          <div className="restricted-edit-warning" style={{
            padding: '12px 16px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            marginBottom: '20px',
            color: '#856404',
            fontSize: '14px',
            lineHeight: '1.5'
          }}>
            ⚠️ This property was created more than 24 hours ago. You can only edit the <strong>Title</strong> and <strong>Price-related fields</strong>. Location-related fields (location, state, additional address) and all other fields are locked.
          </div>
        )}
        <h3 className="step-heading">Amenities & Description</h3>
        <p className="step-subheading">Select the amenities available and describe your property</p>
        {stepError && <span className="seller-popup-error-text seller-popup-step-error">{stepError}</span>}

        <div className="seller-popup-form-group" data-field="amenities">
          <label>Select Amenities <span className="required">*</span></label>
          <div className={`seller-popup-amenities-grid ${errors.amenities ? 'error' : ''}`}>
            {availableAmenities.map(amenity => (
              <button
                key={amenity.id}
                type="button"
                className={`amenity-btn ${formData.amenities.includes(amenity.id) ? 'active' : ''}`}
                onClick={() => !isRestrictedEdit && toggleAmenity(amenity.id)}
                disabled={isRestrictedEdit}
                style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
              >
                <span className="seller-popup-amenity-icon">{amenity.icon}</span>
                <span className="seller-popup-amenity-label">{amenity.label}</span>
                {formData.amenities.includes(amenity.id) && (
                  <span className="check-icon">✓</span>
                )}
              </button>
            ))}
          </div>
          {errors.amenities && <span className="seller-popup-error-text error-message">{errors.amenities}</span>}
        </div>

        <div className="seller-popup-form-group" data-field="description">
          <label>Property Description <span className="required">*</span></label>
          <textarea
            name="description"
            placeholder="Describe your property in detail (minimum 100 characters required). Mention unique features, nearby landmarks, connectivity, etc. Note: Mobile numbers and email addresses are not allowed."
            value={formData.description}
            onChange={(e) => !isRestrictedEdit && handleChange('description', e.target.value)}
            rows={5}
            className={errors.description ? 'error' : ''}
            disabled={isRestrictedEdit}
          />
          <span className="char-count">
            Characters: {(formData.description || '').length}/1000 (min: 100)
          </span>
          {errors.description && <span className="seller-popup-error-text">{errors.description}</span>}
        </div>
      </div>
    );
  };

  const renderStep4 = () => (
    <div className="seller-popup-step-content">
      {isRestrictedEdit && (
        <div className="restricted-edit-warning" style={{
          padding: '12px 16px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#856404',
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          ⚠️ This property was created more than 24 hours ago. You can only edit the <strong>Title</strong> and <strong>Price-related fields</strong>. Location-related fields (location, state, additional address) and all other fields are locked.
        </div>
      )}
      <h3 className="step-heading">Upload Photos</h3>
      <p className="step-subheading">Add up to 10 high-quality photos of your property (minimum 3 required)</p>
      {stepError && <span className="seller-popup-error-text seller-popup-step-error">{stepError}</span>}

      <div
        className={`upload-zone ${errors.images ? 'error' : ''}`}
        onClick={handleUploadZoneClick}
        style={{ opacity: isRestrictedEdit ? 0.5 : 1, cursor: isRestrictedEdit ? 'not-allowed' : 'pointer' }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className="upload-content">
          <div className="seller-popup-upload-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h4>Drag & drop your photos here</h4>
          <p>or click to browse from your device</p>
          <span className="seller-popup-upload-hint">Supports: JPG, PNG, WEBP (Max 5MB each)</span>
        </div>
      </div>
      {errors.images && <span className="seller-popup-error-text center">{errors.images}</span>}

      {formData.images?.length > 0 && (
        <div className="image-preview-section">
          <div className="preview-header">
            <span>Uploaded Photos ({formData.images.length}/10)</span>
            <button
              type="button"
              className="add-more-btn"
              onClick={() => !isRestrictedEdit && fileRef.current?.click()}
              disabled={isRestrictedEdit || isCheckingImages}
              style={{ opacity: (isRestrictedEdit || isCheckingImages) ? 0.5 : 1, cursor: (isRestrictedEdit || isCheckingImages) ? 'not-allowed' : 'pointer' }}
            >
              + Add More
            </button>
          </div>
          <div className="image-preview-grid">
            {formData.images.map((src, idx) => {
              const validationStatus = imageValidationStatus[idx] || { status: 'pending', errorMessage: '' };
              return (
                <div key={idx} className={`preview-item image-validation-item ${validationStatus.status}`}>
                  <img src={src} alt={`Preview ${idx + 1}`} />
                  {idx === 0 && <span className="cover-badge">Cover</span>}

                  {/* Simple Status Overlay */}
                  {validationStatus.status === 'checking' && (
                    <div className="validation-overlay checking-overlay">
                      <div className="overlay-content">
                        <p className="status-message-text">Checking...</p>
                      </div>
                    </div>
                  )}

                  {validationStatus.status === 'approved' && (
                    <div className="validation-overlay approved-overlay">
                      <div className="overlay-content">
                        <svg className="checkmark" width="32" height="32" viewBox="0 0 24 24" fill="none">
                          <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p className="approved-text">Approved</p>
                      </div>
                    </div>
                  )}

                  {validationStatus.status === 'rejected' && (
                    <div className="validation-overlay rejected-overlay">
                      <div className="overlay-content">
                        <svg className="x-icon" width="32" height="32" viewBox="0 0 24 24" fill="none">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        <p className="rejected-title">REJECTED</p>
                        <p className="rejected-message">{validationStatus.errorMessage || 'Image rejected'}</p>
                        <button
                          type="button"
                          className="remove-rejected-btn"
                          onClick={() => !isRestrictedEdit && removeImage(idx)}
                          disabled={isRestrictedEdit}
                        >
                          Remove & Try Again
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Status Badge */}
                  {validationStatus.status === 'approved' && (
                    <div className="status-badge approved-badge">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}

                  {validationStatus.status === 'rejected' && (
                    <div className="status-badge rejected-badge">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                  )}

                  {/* Remove Button - ALWAYS visible (except when checking) */}
                  {validationStatus.status !== 'checking' && (
                    <button
                      type="button"
                      className="remove-image-btn"
                      onClick={() => !isRestrictedEdit && removeImage(idx)}
                      disabled={isRestrictedEdit}
                      title="Remove image"
                      style={{
                        opacity: isRestrictedEdit ? 0.5 : 1,
                        cursor: isRestrictedEdit ? 'not-allowed' : 'pointer',
                        zIndex: 20
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Warning if rejected images exist */}
          {imageValidationStatus.some(img => img.status === 'rejected') && (
            <div className="image-validation-warning">
              <strong>⚠️ Remove rejected images to continue</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                {imageValidationStatus.filter(img => img.status === 'rejected').length} image(s) were rejected.
                Please remove them and upload valid property images only.
              </p>
            </div>
          )}

          {/* Success message if all approved */}
          {imageValidationStatus.length > 0 &&
            imageValidationStatus.every(img => img.status === 'approved') &&
            !isCheckingImages && (
              <div className="image-validation-success" style={{
                background: '#e8f5e9',
                color: '#2e7d32',
                padding: '12px',
                borderRadius: '4px',
                marginTop: '16px',
                fontSize: '14px',
                border: '1px solid #4CAF50',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>✅</span>
                <span>All images approved! Proceeding to next step...</span>
              </div>
            )}
        </div>
      )}
    </div>
  );

  const renderStep5 = () => (
    <div className="seller-popup-step-content">
      {isRestrictedEdit && (
        <div className="restricted-edit-warning" style={{
          padding: '12px 16px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#856404',
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          ⚠️ This property was created more than 24 hours ago. You can only edit the <strong>Title</strong> and <strong>Price-related fields</strong> (price, price negotiable, maintenance charges, deposit amount). Location-related fields (location, state, additional address) and all other fields are locked.
        </div>
      )}
      <h3 className="step-heading">Pricing Details</h3>
      <p className="step-subheading">Set the right price for your property</p>

      <div className="seller-popup-form-group" data-field="price">
        <label>
          {formData.status === 'sale' ? 'Expected Price' : 'Monthly Rent'}
          <span className="required">*</span>
        </label>
        <div className="price-input-wrapper">
          <span className="currency">₹</span>
          <input
            type="number"
            name="price"
            placeholder={formData.status === 'sale' ? 'Enter expected price' : 'Enter monthly rent'}
            value={formData.price}
            onChange={(e) => handleChange('price', e.target.value)}
            className={errors.price ? 'error' : ''}
          />
        </div>
        {formData.price && (
          <span className="price-words">
            {formatPriceInWords(formData.price)}
          </span>
        )}
        {errors.price && <span className="seller-popup-error-text">{errors.price}</span>}
      </div>

      {fieldConfig.showPricePerSeat && (
        <div className="seller-popup-form-group" data-field="pricePerSeat">
          <label>Price per Seat (Monthly) <span className="required">*</span></label>
          <div className="price-input-wrapper">
            <span className="currency">₹</span>
            <input
              type="number"
              name="pricePerSeat"
              placeholder="Enter price per seat"
              value={formData.pricePerSeat}
              onChange={(e) => handleChange('pricePerSeat', e.target.value)}
              className={errors.pricePerSeat ? 'error' : ''}
            />
          </div>
          {formData.pricePerSeat && (
            <span className="price-words">
              {formatPriceInWords(formData.pricePerSeat)}
            </span>
          )}
          {errors.pricePerSeat && <span className="seller-popup-error-text">{errors.pricePerSeat}</span>}
        </div>
      )}

      <div className="seller-popup-form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={formData.priceNegotiable}
            onChange={(e) => handleChange('priceNegotiable', e.target.checked)}
          />
          <span className="checkmark"></span>
          Price is negotiable
        </label>
      </div>

      {formData.status === 'rent' && (
        <div className="form-row two-cols">
          <div className="seller-popup-form-group" data-field="depositAmount">
            <label>Security Deposit</label>
            <div className="price-input-wrapper">
              <span className="currency">₹</span>
              <input
                type="number"
                name="depositAmount"
                placeholder="Enter deposit amount"
                value={formData.depositAmount}
                onChange={(e) => handleChange('depositAmount', e.target.value)}
              />
            </div>
            {formData.depositAmount && (
              <span className="price-words">
                {formatPriceInWords(formData.depositAmount)}
              </span>
            )}
          </div>

          <div className="seller-popup-form-group">
            <label>Maintenance (per month)</label>
            <div className="price-input-wrapper">
              <span className="currency">₹</span>
              <input
                type="number"
                placeholder="Enter maintenance"
                value={formData.maintenanceCharges}
                onChange={(e) => handleChange('maintenanceCharges', e.target.value)}
              />
            </div>
            {formData.maintenanceCharges && (
              <span className="price-words">
                {formatPriceInWords(formData.maintenanceCharges)}
              </span>
            )}
          </div>
        </div>
      )}

      {formData.status === 'sale' && (
        <div className="seller-popup-form-group">
          <label>Maintenance (per month)</label>
          <div className="price-input-wrapper">
            <span className="currency">₹</span>
            <input
              type="number"
              placeholder="Enter monthly maintenance"
              value={formData.maintenanceCharges}
              onChange={(e) => handleChange('maintenanceCharges', e.target.value)}
            />
          </div>
          {formData.maintenanceCharges && (
            <span className="price-words">
              {formatPriceInWords(formData.maintenanceCharges)}
            </span>
          )}
        </div>
      )}

      <div className="seller-popup-listing-summary">
        <h4>Listing Summary</h4>
        <div className="seller-popup-summary-grid">
          <div className="seller-popup-summary-item">
            <span className="seller-popup-summary-label">Property</span>
            <span className="seller-popup-summary-value">{formData.title || '-'}</span>
          </div>
          <div className="seller-popup-summary-item">
            <span className="seller-popup-summary-label">Type</span>
            <span className="seller-popup-summary-value">{formData.propertyType || '-'}</span>
          </div>
          <div className="seller-popup-summary-item">
            <span className="seller-popup-summary-label">Location</span>
            <span className="seller-popup-summary-value">{formData.location || '-'}</span>
          </div>
          <div className="seller-popup-summary-item">
            <span className="seller-popup-summary-label">Configuration</span>
            <span className="seller-popup-summary-value">
              {formData.bedrooms ? `${formData.bedrooms} BHK` : '-'}
            </span>
          </div>
          <div className="seller-popup-summary-item">
            <span className="seller-popup-summary-label">Area</span>
            <span className="seller-popup-summary-value">
              {formData.area ? `${formData.area} sq.ft` : '-'}
            </span>
          </div>
          <div className="seller-popup-summary-item">
            <span className="seller-popup-summary-label">Photos</span>
            <span className="seller-popup-summary-value">
              {formData.images?.length || 0} uploaded
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const formatPriceInWords = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '';

    if (num >= 10000000) {
      return `₹${(num / 10000000).toFixed(2)} Crore`;
    } else if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} Lakh`;
    } else if (num >= 1000) {
      return `₹${(num / 1000).toFixed(2)} Thousand`;
    }
    return `₹${num}`;
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      default: return renderStep1();
    }
  };

  return (
    <div className="seller-popup-overlay">

      {/* Property Limit Warning Modal */}
      {showLimitWarning && (
        <div className="seller-popup-limit-warning-overlay">
          <div className="seller-popup-limit-warning-modal">
            <div className="seller-popup-limit-warning-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>

            <div className="seller-popup-limit-warning-content">
              <h3>Property Limit Reached</h3>
              <p>You've uploaded <strong>{currentPropertyCount}</strong> out of <strong>{PROPERTY_LIMIT}</strong> properties allowed in your free plan.</p>

              <div className="seller-popup-limit-progress">
                <div className="seller-popup-limit-progress-bar">
                  <div
                    className="seller-popup-limit-progress-fill"
                    style={{ width: `${(currentPropertyCount / PROPERTY_LIMIT) * 100}%` }}
                  ></div>
                </div>
                <span className="seller-popup-limit-progress-text">{currentPropertyCount}/{PROPERTY_LIMIT} Properties Used</span>
              </div>

              <div className="seller-popup-limit-warning-features">
                <p className="seller-popup-features-title">Upgrade to Pro to unlock:</p>
                <ul>
                  <li>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    More property listings
                  </li>
                  <li>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Priority placement in search
                  </li>
                  <li>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Advanced analytics & insights
                  </li>
                  <li>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Dedicated support
                  </li>
                </ul>
              </div>
            </div>

            <div className="seller-popup-limit-warning-actions">
              <button className="seller-popup-limit-btn-secondary" onClick={onClose}>
                Maybe Later
              </button>
              <button className="seller-popup-limit-btn-primary" onClick={() => {
                onClose();
                // Navigate to subscription page - you can pass a callback or use navigate
                window.location.href = '/subscription';
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" />
                </svg>
                Upgrade to Pro
              </button>
            </div>

            <button className="seller-popup-limit-warning-close" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Property Upload Success Modal - Render outside popup-overlay */}
      <PropertyUploadSuccessModal
        isOpen={showEditNoticeModal}
        redirectPath="/seller-dashboard/properties"
        onClose={() => {
          setShowEditNoticeModal(false);
          onClose();
        }}
      />

      {/* Close Warning Modal - Show when trying to close on final step without publishing */}
      {showCloseWarning && (
        <div className="seller-popup-overlay" style={{ zIndex: 10000 }}>
          <div className="seller-popup-container" style={{ maxWidth: '500px' }}>
            <div className="seller-popup-header">
              <h2>Publishing Not Completed</h2>
              <button
                className="seller-popup-close-btn"
                onClick={() => setShowCloseWarning(false)}
                aria-label="Close"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="seller-popup-body" style={{ padding: '2rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 1rem', color: 'var(--warning-color, #f59e0b)' }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p style={{ fontSize: '1rem', lineHeight: '1.6', color: 'var(--text-color, #333)' }}>
                  You haven't published this property yet.
                  <br />
                  Please publish before closing, or your data will be lost.
                </p>
              </div>
            </div>
            <div className="seller-popup-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button
                type="button"
                className="seller-popup-cancel-btn"
                onClick={() => setShowCloseWarning(false)}
              >
                Continue Editing
              </button>

            </div>
          </div>
        </div>
      )}

      {/* Main Popup - Only show if limit not reached, edit notice not shown, and close warning not shown */}
      {!showLimitWarning && !showEditNoticeModal && !showCloseWarning && (
        <div className="seller-popup-container" ref={popupContainerRef} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="seller-popup-header">
            <h2>{editIndex !== null ? 'Edit Property' : 'List Your Property'}</h2>
            <button className="seller-popup-close-btn" onClick={handleCloseAttempt} aria-label="Close">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Step Indicator */}
          {renderStepIndicator()}

          {/* Form Content */}
          <div className="seller-popup-body" ref={popupBodyRef}>
            {renderCurrentStep()}
          </div>

          {/* Footer */}
          <div className="seller-popup-footer">
            {currentStep > 1 && (
              <button type="button" className="seller-popup-back-btn" onClick={handleBack}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Back
              </button>
            )}

            <div className="seller-popup-footer-right">
              <button type="button" className="seller-popup-cancel-btn" onClick={handleCloseAttempt}>
                Cancel
              </button>

              {currentStep < 5 ? (
                <button
                  type="button"
                  className={`seller-popup-next-btn ${isCheckingImages || imageValidationStatus.some(img => img.status === 'rejected') ? 'disabled' : ''}`}
                  onClick={handleNext}
                  disabled={isCheckingImages || imageValidationStatus.some(img => img.status === 'rejected')}
                >
                  Next
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="seller-popup-submit-btn"
                  onClick={handleSubmit}
                  disabled={isSubmitting || uploadingImages || isDiscarded}
                >
                  {uploadingImages ? (
                    <>
                      <span className="seller-popup-spinner"></span>
                      Uploading Images...
                    </>
                  ) : isSubmitting ? (
                    <>
                      <span className="seller-popup-spinner"></span>
                      Publishing...
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      {editIndex !== null ? 'Update Property' : 'Publish Listing'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Selector Modal */}
      {showActionSelector && (
        <div
          className="camera-action-selector-overlay"
          onClick={(e) => {
            if (e.target.classList.contains('camera-action-selector-overlay')) {
              setShowActionSelector(false);
            }
          }}
        >
          <div className="camera-action-selector-modal">
            <h3>Choose Upload Method</h3>
            <div className="camera-action-buttons">
              <button
                type="button"
                className="camera-action-btn gallery-btn"
                onClick={() => handleActionSelect('gallery')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Upload from Gallery</span>
              </button>
              <button
                type="button"
                className="camera-action-btn camera-btn"
                onClick={() => handleActionSelect('camera')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span>Use Camera</span>
              </button>
            </div>
            <button
              type="button"
              className="camera-action-close-btn"
              onClick={() => setShowActionSelector(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      {showCameraModal && (
        <div className="camera-capture-overlay">
          <div className="camera-capture-modal">
            <div className="camera-capture-header">
              <h3>Take Photo</h3>
              <button
                type="button"
                className="camera-close-btn"
                onClick={stopCamera}
                aria-label="Close camera"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="camera-preview-container">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-preview-video"
              />
            </div>

            <div className="camera-controls">
              <button
                type="button"
                className="camera-flip-btn"
                onClick={flipCamera}
                aria-label="Flip camera"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M17 1l4 4-4 4M21 5H11M7 23l-4-4 4-4M3 19h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>

              <button
                type="button"
                className="camera-capture-btn"
                onClick={captureImage}
                aria-label="Capture photo"
              >
                <div className="camera-capture-circle">
                  <div className="camera-capture-inner"></div>
                </div>
              </button>

              <button
                type="button"
                className="camera-cancel-btn"
                onClick={stopCamera}
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div className="location-picker-modal-overlay" onClick={(e) => {
          if (e.target.classList.contains('location-picker-modal-overlay')) {
            setShowLocationPicker(false);
          }
        }}>
          <LocationPicker
            initialLocation={formData.latitude && formData.longitude ? {
              latitude: parseFloat(formData.latitude),
              longitude: parseFloat(formData.longitude),
              fullAddress: formData.location
            } : null}
            defaultCenter={formData.latitude && formData.longitude ? undefined : (mapCenterFromAddress ? [mapCenterFromAddress.lng, mapCenterFromAddress.lat] : undefined)}
            defaultZoom={formData.latitude && formData.longitude ? undefined : (mapCenterFromAddress ? 14 : undefined)}
            onLocationChange={handleLocationSelect}
            onClose={() => setShowLocationPicker(false)}
          />
        </div>
      )}
    </div>
  );
}