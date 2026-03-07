// src/components/AddPropertyPopup.jsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useProperty } from "./PropertyContext";
import { sellerPropertiesAPI } from "../../services/api.service";
import { API_BASE_URL, API_ENDPOINTS } from "../../config/api.config";
import { validateImageFile, validateFloors, validateCarpetArea, validateArea, validatePrice, validateDeposit, validateLatitude, validateLongitude, PLOT_LAND_AREA_MAX_SQFT } from "../../utils/validation";
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
  { value: "Flat", icon: "🏠", category: "residential", subCategory: "standard" },
  { value: "Villa", icon: "🏡", category: "residential", subCategory: "independent" },
  { value: "Independent House", icon: "🏘️", category: "residential", subCategory: "independent" },
  { value: "Row House", icon: "🏘️", category: "residential", subCategory: "standard" },
  { value: "Penthouse", icon: "🌆", category: "residential", subCategory: "luxury" },
  { value: "Studio Apartment", icon: "🛏️", category: "residential", subCategory: "studio" },
  { value: "Farm House", icon: "🌳", category: "residential", subCategory: "independent" },
  { value: "Plot / Land", icon: "📐", category: "land", subCategory: "plot" },
  { value: "Commercial Office", icon: "🏢", category: "commercial", subCategory: "office" },
  { value: "Commercial Shop", icon: "🏪", category: "commercial", subCategory: "shop" },
  { value: "PG / Hostel", icon: "🛏️", category: "pg", subCategory: "accommodation" }
];

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
    showFloor: false, // Often ground floor or single floor
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
    showFloor: false, // Usually ground floor
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
    "water_supply", "gas_pipeline", "wifi", "ac"
  ],
  // Farm House - similar to residential but may not have lift
  residential_farmhouse: [
    "parking", "security", "power_backup", "gym", "swimming_pool",
    "garden", "clubhouse", "playground", "cctv", "fire_safety",
    "water_supply", "gas_pipeline", "wifi", "ac"
  ],
  // Commercial Office
  commercial_office: [
    "power_backup_ups", "high_speed_internet", "centralized_ac", "lifts_high_speed",
    "fire_safety", "access_control", "parking", "visitor_parking", "security_staff",
    "reception_desk", "lobby_area", "conference_room", "washrooms", "pantry",
    "cctv", "security", "lift", "wifi", "ac"
  ],
  // Commercial Shop
  commercial_shop: [
    "power_supply_247", "power_backup", "customer_parking", "two_wheeler_parking",
    "wheelchair_accessible", "escalator_access", "display_window", "shutter_door",
    "washrooms", "mezzanine_floor", "high_speed_internet",
    "parking", "security", "cctv", "fire_safety", "wifi", "ac"
  ],
  // Plot/Land - minimal amenities
  land_plot: [
    "internal_roads", "led_lighting", "rainwater_harvesting", "underground_drainage",
    "stormwater_drainage", "water_line", "electricity_provision", "gated_entrance",
    "compound_wall", "security_cabin", "landscaped_garden", "playground",
    "jogging_track", "open_gym", "visitor_parking",
    "security", "water_supply", "cctv"
  ],
  // PG/Hostel
  pg_accommodation: [
    "parking", "security", "power_backup", "cctv",
    "fire_safety", "water_supply", "wifi", "ac", "intercom"
  ]
};

const FURNISHING_OPTIONS = ["Unfurnished", "Semi-Furnished", "Fully-Furnished"];
const FACING_OPTIONS = ["North", "South", "East", "West", "North-East", "North-West", "South-East", "South-West"];
const PROPERTY_STATUS_OPTIONS = ["New", "Resale"];
const RESALE_AGE_OPTIONS = ["Less than 1 Year", "1-5 Years", "5-10 Years", "10+ Years"];

export default function AddPropertyPopup({ onClose, editIndex = null, initialData = null }) {
  const { addProperty, updateProperty, properties } = useProperty();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [showEditNoticeModal, setShowEditNoticeModal] = useState(false);
  const [isPublished, setIsPublished] = useState(false); // Track if publishing is completed
  const [showCloseWarning, setShowCloseWarning] = useState(false); // Show warning modal when trying to close on final step
  const [isDiscarded, setIsDiscarded] = useState(false); // Track if user discarded the form
  const [errors, setErrors] = useState({});
  const [stepError, setStepError] = useState(null); // Step-level error message
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [mapCenterFromAddress, setMapCenterFromAddress] = useState(null); // Center map when user enters address
  const [imageFiles, setImageFiles] = useState([]); // Store actual File objects
  const [imageValidationStatus, setImageValidationStatus] = useState([]); // Track validation status for each image
  const [isCheckingImages, setIsCheckingImages] = useState(false);
  const [stateAutoFilled, setStateAutoFilled] = useState(false); // Track if state was auto-filled from map
  const [showActionSelector, setShowActionSelector] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraFacingMode, setCameraFacingMode] = useState('environment'); // 'environment' (rear) or 'user' (front)
  // separate refs for images, video, brochure
  const imagesRef = useRef();
  const videoRef = useRef();
  const brochureRef = useRef();
  const cameraVideoRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const popupBodyRef = useRef(null);
  const popupContainerRef = useRef(null);

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

  const [formData, setFormData] = useState(() => {
    const base = initialData || {
      title: "", status: "sale", propertyType: "",
      location: "", latitude: "", longitude: "", state: "", additionalAddress: "",
      bedrooms: "", bathrooms: "", balconies: "", area: "", carpetArea: "",
      floor: "", totalFloors: "", facing: "", age: "", furnishing: "",
      seats: "", pricePerSeat: "",
      amenities: [], description: "",
      images: [], video: null, brochure: null,
      price: "", priceNegotiable: false, maintenanceCharges: "", depositAmount: "", availableForBachelors: false
    };
    if (!initialData) return { ...base, propertyStatus: "", age: "" };
    const age = initialData.age || "";
    const propertyStatus = age === "New Construction" ? "New" : (age ? "Resale" : "");
    const derivedAge = age === "New Construction" ? "" : age;
    return { ...base, propertyStatus, age: derivedAge };
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
      propertyStatus: "",
      age: "",
      furnishing: "",
      seats: "",
      pricePerSeat: "",
      amenities: [],
      description: "",
      images: [],
      video: null,
      brochure: null,
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

  // Close on escape (only when success modal is not open)
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

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // Revoke all blob URLs when component unmounts
      if (formData.images) {
        formData.images.forEach(img => {
          if (typeof img === 'string' && img.startsWith('blob:')) {
            URL.revokeObjectURL(img);
          }
        });
      }
    };
  }, []);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };

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
          if (value === 'Farm House') {
            availableAmenityIds = PROPERTY_TYPE_AMENITIES.residential_farmhouse;
          } else if (value === 'Plot / Land') {
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

  // Get property type configuration
  const getPropertyTypeConfig = () => {
    if (!formData.propertyType) return PROPERTY_TYPE_FIELDS.residential_standard; // default

    const propertyType = PROPERTY_TYPES.find(pt => pt.value === formData.propertyType);
    if (!propertyType) return PROPERTY_TYPE_FIELDS.residential_standard;

    // Special case for Farm House
    if (formData.propertyType === 'Farm House') {
      return PROPERTY_TYPE_FIELDS.residential_farmhouse;
    }

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
        const isPlotLandArea = formData.propertyType === 'Plot / Land';
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
        if (fieldConfig.showFloor) {
          step2Fields.push('floor', 'totalFloors');
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
    if (errors.location || errors.state || errors.mapLocation) {
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
            console.log(`[Image ${index + 1}] ✅ Auto-approved for Agent (moderation_status: ${moderationStatus || 'N/A'})`);
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
  const handleImageUploadZoneClick = () => {
    setShowActionSelector(true);
  };

  // Handle action selection
  const handleActionSelect = (action) => {
    setShowActionSelector(false);
    if (action === 'gallery') {
      imagesRef.current?.click();
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
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play();
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
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
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

      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play();
      }
    } catch (error) {
      console.error('Error flipping camera:', error);
      alert('Failed to switch camera. Please try again.');
    }
  };

  // Capture image from camera
  const captureImage = () => {
    if (!cameraVideoRef.current || !cameraCanvasRef.current) return;

    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
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

  // ---------- NEW: Video Handlers ----------
  const handleVideoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // validate type
    const allowed = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/ogg"];
    if (!allowed.includes(file.type)) {
      setErrors(prev => ({ ...prev, video: "Unsupported video format" }));
      return;
    }

    // validate size (<= 50MB)
    if (file.size > 50 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, video: "Video must be <= 50MB" }));
      return;
    }

    const url = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, video: { file, url, name: file.name, size: file.size } }));
    setErrors(prev => ({ ...prev, video: null }));
  };

  const removeVideo = () => {
    // revoke object URL to free memory
    if (formData.video?.url) URL.revokeObjectURL(formData.video.url);
    setFormData(prev => ({ ...prev, video: null }));
  };

  // ---------- NEW: Brochure (PDF) Handlers ----------
  const handleBrochureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // validate type
    if (file.type !== "application/pdf") {
      setErrors(prev => ({ ...prev, brochure: "Only PDF files are allowed" }));
      return;
    }

    // validate size (<= 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, brochure: "PDF must be <= 10MB" }));
      return;
    }

    const url = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, brochure: { file, url, name: file.name, size: file.size } }));
    setErrors(prev => ({ ...prev, brochure: null }));
  };

  const removeBrochure = () => {
    if (formData.brochure?.url) URL.revokeObjectURL(formData.brochure.url);
    setFormData(prev => ({ ...prev, brochure: null }));
  };

  const validateStep = (step) => {
    const newErrors = {};
    let stepErrorMessage = null;
    const fieldConfig = getPropertyTypeConfig();

    switch (step) {
      case 1:
        if (!formData.title?.trim()) {
          newErrors.title = "Property name is required";
        }
        if (!formData.status) {
          newErrors.status = "Sell / Rent / PG-Hostel not selected";
        }
        if (!formData.propertyType) {
          newErrors.propertyType = "Property type not selected";
        }
        if (Object.keys(newErrors).length > 0) {
          stepErrorMessage = "Please complete all required fields before proceeding";
        }
        break;
      case 2:
        if (!formData.location?.trim()) {
          newErrors.location = "Location is required";
        }
        // Map location required - user must manually pin on map
        if (!formData.latitude?.trim() || !formData.longitude?.trim()) {
          newErrors.mapLocation = "Select exact location on map (click on map or drag marker)";
        } else {
          const latValidation = validateLatitude(formData.latitude);
          if (!latValidation.valid) newErrors.latitude = latValidation.message;
          const lngValidation = validateLongitude(formData.longitude);
          if (!lngValidation.valid) newErrors.longitude = lngValidation.message;
        }
        if (!formData.area) {
          newErrors.area = "Area / Carpet area missing";
        } else {
          const isPlotLand = formData.propertyType === 'Plot / Land';
          const areaMax = isPlotLand ? PLOT_LAND_AREA_MAX_SQFT : undefined;
          const areaValidation = validateArea(formData.area, 100, areaMax);
          if (!areaValidation.valid) {
            newErrors.area = areaValidation.message;
          }
        }

        // Validate carpet area vs built-up area
        if (formData.carpetArea && formData.area) {
          const carpetValidation = validateCarpetArea(formData.carpetArea, formData.area);
          if (!carpetValidation.valid) {
            newErrors.carpetArea = carpetValidation.message;
          }
        }

        // Validate floor number vs total floors
        if (formData.floor && formData.totalFloors) {
          const floorValidation = validateFloors(formData.floor, formData.totalFloors);
          if (!floorValidation.valid) {
            newErrors.floor = floorValidation.message;
          }
        }

        // Dynamic validation based on property type
        if (fieldConfig.bedroomsRequired && !formData.bedrooms) {
          newErrors.bedrooms = "Bedroom / Bathroom not selected";
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

        if (fieldConfig.showFloor && !formData.floor) {
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

        if (fieldConfig.showAge) {
          if (!formData.propertyStatus?.trim()) {
            newErrors.propertyStatus = "Property status is required";
          } else if (formData.propertyStatus === "Resale" && !formData.age?.trim()) {
            newErrors.age = "Property age is required for resale";
          }
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
        // require at least 3 images (compulsory)
        // Use imageValidationStatus.length as source of truth (it tracks actual uploaded images)
        // Fallback to formData.images.length for cases where validation status hasn't been initialized yet
        const uploadedImageCount = Math.max(
          imageValidationStatus.length,
          formData.images?.length || 0
        );

        if (uploadedImageCount === 0) {
          newErrors.images = "Upload at least 3 property images";
          stepErrorMessage = "Upload at least 3 property images";
        } else if (uploadedImageCount < 3) {
          newErrors.images = `Upload at least 3 property images (${uploadedImageCount}/3 uploaded)`;
          stepErrorMessage = `Upload at least 3 property images (${uploadedImageCount}/3 uploaded)`;
        } else {
          // Check if any images are still being validated
          if (isCheckingImages) {
            newErrors.images = "Please wait for all images to be validated";
            stepErrorMessage = "Please wait for all images to be validated before proceeding";
          }
          // Check if any images were rejected
          const rejectedCount = imageValidationStatus.filter(img => img.status === 'rejected').length;
          if (rejectedCount > 0) {
            newErrors.images = `Please remove ${rejectedCount} rejected image(s) before proceeding`;
            stepErrorMessage = `Please remove ${rejectedCount} rejected image(s) before proceeding`;
          }
          // Check if at least 3 images are approved
          const approvedCount = imageValidationStatus.filter(img => img.status === 'approved').length;
          if (approvedCount < 3 && imageValidationStatus.length > 0 && !isCheckingImages) {
            newErrors.images = `At least 3 images must be approved (${approvedCount}/${uploadedImageCount} approved)`;
            stepErrorMessage = `At least 3 images must be approved (${approvedCount}/${uploadedImageCount} approved)`;
          }
        }
        // optional: if you want to require brochure/video, uncomment below
        // if (!formData.video) newErrors.video = "Please upload a video";
        // if (!formData.brochure) newErrors.brochure = "Please upload brochure";
        break;
      case 5:
        if (!formData.price) {
          newErrors.price = "Price / Rent / Budget missing";
          stepErrorMessage = "Price / Rent / Budget missing";
        } else {
          // Validate price value
          const priceValidation = validatePrice(formData.price, formData.status);
          if (!priceValidation.valid) {
            newErrors.price = priceValidation.message;
            stepErrorMessage = priceValidation.message;
          }
        }

        // Validate price per seat for coworking
        if (fieldConfig.showPricePerSeat && !formData.pricePerSeat) {
          newErrors.pricePerSeat = "Price per seat is required";
          if (!stepErrorMessage) stepErrorMessage = "Price per seat is required";
        }

        // Validate deposit for rent properties
        if (formData.status === 'rent' && formData.depositAmount && formData.price) {
          const depositValidation = validateDeposit(formData.depositAmount, formData.price);
          if (!depositValidation.valid) {
            newErrors.depositAmount = depositValidation.message;
            if (!stepErrorMessage) {
              stepErrorMessage = depositValidation.message;
            }
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

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setStepError(null); // Clear step error on successful validation
      setCurrentStep(prev => Math.min(prev + 1, 5));
    } else {
      // Scroll to first error field
      setTimeout(() => {
        if (popupBodyRef.current) {
          const firstErrorField = popupBodyRef.current.querySelector('.error, .error-text');
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
  const handleStepClick = (stepId) => {
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

  // Scroll to top when step changes
  useEffect(() => {
    if (popupBodyRef.current) {
      popupBodyRef.current.scrollTop = 0;
    }
    // Clear step error when step changes
    setStepError(null);
  }, [currentStep]);

  const handleSubmit = async () => {
    // CRITICAL: Block all publishing if form was discarded
    if (isDiscarded) {
      console.log('Publishing blocked: Form was discarded');
      return;
    }

    if (!validateStep(currentStep)) return;

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

      // Use validated images from imageValidationStatus
      // For editing: Get approved image URLs (images already validated and uploaded on selection)
      if (editIndex !== null) {
        // Get approved image URLs from validation status
        const approvedImageUrls = imageValidationStatus
          .filter(img => img.status === 'approved' && img.imageUrl)
          .map(img => img.imageUrl);

        // Also include existing URLs (not blob URLs)
        const existingUrls = (formData.images || []).filter(img =>
          typeof img === 'string' && !img.startsWith('blob:')
        );

        // Combine approved new images with existing URLs (do not mutate formData)
        uploadedImageUrls = [...existingUrls, ...approvedImageUrls];
      }

      setUploadingImages(false);

      // For new properties: Create property first, then upload images
      if (editIndex === null) {
        // Create property with empty images array first to get property ID
        const ageForApi = formData.propertyStatus === "New" ? "New Construction" : (formData.propertyStatus === "Resale" ? (formData.age || "") : "");
        const propertyDataWithoutImages = { ...formData, age: ageForApi, images: [] };
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

        // Images are already validated on selection (in validate_only mode)
        // Now upload them again with property ID to save to database
        const approvedImages = imageValidationStatus.filter(img => img.status === 'approved');

        if (approvedImages.length > 0) {
          setUploadingImages(true);
          try {
            // Upload each approved image with property ID
            const uploadPromises = approvedImages.map(async (imgObj, index) => {
              try {
                const response = await sellerPropertiesAPI.uploadImage(imgObj.file, propertyId);

                if (response.success && response.data && response.data.url) {
                  return {
                    success: true,
                    url: response.data.url || response.data.image_url,
                    index
                  };
                } else {
                  return { success: false, index, error: response.message || 'Upload failed' };
                }
              } catch (error) {
                console.error(`Image ${index + 1} upload error:`, error);
                return {
                  success: false,
                  index,
                  error: error.message || 'Upload failed'
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
            setShowEditNoticeModal(true);
            return;
          } catch (uploadError) {
            console.error('Image upload error:', uploadError);
            // Property was created successfully, show success modal even if images failed
            setUploadingImages(false);
            setIsSubmitting(false);
            setShowEditNoticeModal(true);
            return;
          }
        } else {
          // No approved images
          setUploadingImages(false);
          setIsSubmitting(false);
          setShowEditNoticeModal(true);
          return;
        }
      } else {
        // Editing existing property (build payload immutably; do not mutate formData)
        const propertyId = properties[editIndex]?.id;
        if (propertyId) {
          const ageForApi = formData.propertyStatus === "New" ? "New Construction" : (formData.propertyStatus === "Resale" ? (formData.age || "") : "");
          let updatePayload = { ...formData, age: ageForApi, images: uploadedImageUrls };

          // Upload video if a new video file was selected
          if (formData.video && formData.video.file) {
            try {
              console.log('Uploading video for property ID:', propertyId);
              const videoResponse = await sellerPropertiesAPI.uploadVideo(formData.video.file, propertyId);
              if (videoResponse.success && videoResponse.data?.url) {
                updatePayload = { ...updatePayload, videoUrl: videoResponse.data.url };
                console.log('Video uploaded successfully:', videoResponse.data.url);
              }
            } catch (videoError) {
              console.error('Video upload error:', videoError);
              // Continue with property update even if video upload fails
            }
          }

          await updateProperty(propertyId, updatePayload);
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
      // Show detailed error message (use error.message when present, else status-based message)
      const errorMessage = error.message || (
        error.status === 401
          ? 'Authentication required. Please log in to add properties.'
          : error.status === 403
            ? 'Access denied. Please check your permissions.'
            : 'Failed to save property. Please check your connection and try again.'
      );
      alert(errorMessage);
      console.error('Property save error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="step-indicator">
      {STEPS.map((step, idx) => {
        const isCompleted = isStepCompleted(step.id);
        // Allow clicking on completed steps (to go back) or current step
        const isClickable = isCompleted || step.id === currentStep;

        return (
          <div
            key={step.id}
            className={`step-item ${currentStep === step.id ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isClickable ? 'clickable' : ''}`}
          >
            <div
              className="step-circle"
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
            <span className="step-title">{step.title}</span>
            {idx < STEPS.length - 1 && <div className="step-line" />}
          </div>
        );
      })}
    </div>
  );

  const renderStep1 = () => (
    <div className="step-content">
      <h3 className="step-heading">Basic Information</h3>
      <p className="step-subheading">Let's start with the basic details of your property</p>
      {stepError && <span className="error-text agent-popup-step-error">{stepError}</span>}

      <div className="form-group">
        <label>Property Title <span className="required">*</span></label>
        <input
          type="text"
          name="title"
          placeholder="e.g., Spacious 3BHK Apartment with Sea View"
          value={formData.title}
          onChange={(e) => handleChange('title', e.target.value)}
          className={errors.title ? 'error' : ''}
        />
        {errors.title && <span className="error-text error-message">{errors.title}</span>}
      </div>

      <div className="form-group" data-field="status">
        <label>I want to</label>
        <div className={`toggle-buttons ${errors.status ? 'error' : ''}`}>
          <button
            type="button"
            className={`toggle-btn ${formData.status === 'sale' ? 'active' : ''}`}
            onClick={() => handleChange('status', 'sale')}
          >
            <span className="toggle-icon">🏷️</span>
            Sell
          </button>
          <button
            type="button"
            className={`toggle-btn ${formData.status === 'rent' ? 'active' : ''}`}
            onClick={() => handleChange('status', 'rent')}
          >
            <span className="toggle-icon">🔑</span>
            Rent / Lease
          </button>
        </div>
        {errors.status && <span className="error-text error-message">{errors.status}</span>}
      </div>

      <div className="form-group" data-field="propertyType">
        <label>Property Type <span className="required">*</span></label>
        <div className={`property-type-grid ${errors.propertyType ? 'error' : ''}`}>
          {PROPERTY_TYPES.map(type => (
            <button
              key={type.value}
              type="button"
              className={`property-type-btn ${formData.propertyType === type.value ? 'active' : ''}`}
              onClick={() => handleChange('propertyType', type.value)}
            >
              <span className="type-icon">{type.icon}</span>
              <span className="type-label">{type.value}</span>
            </button>
          ))}
        </div>
        {errors.propertyType && <span className="error-text error-message">{errors.propertyType}</span>}
      </div>

      {/* Available for Bachelors - Show for specific property types when status is rent */}
      {formData.status === 'rent' &&
        ['Apartment', 'Flat', 'Independent House', 'Penthouse', 'Villa', 'Farm House', 'Studio Apartment'].includes(formData.propertyType) && (
          <div className="form-group">
            <label>Available for Bachelors</label>
            <div className="toggle-buttons">
              <button
                type="button"
                className={`toggle-btn ${formData.availableForBachelors ? 'active' : ''}`}
                onClick={() => handleChange('availableForBachelors', true)}
              >
                <span className="toggle-icon">✓</span>
                Yes
              </button>
              <button
                type="button"
                className={`toggle-btn ${!formData.availableForBachelors ? 'active' : ''}`}
                onClick={() => handleChange('availableForBachelors', false)}
              >
                <span className="toggle-icon">✗</span>
                No
              </button>
            </div>
          </div>
        )}
    </div>
  );

  const renderStep2 = () => {
    const fieldConfig = getPropertyTypeConfig();

    return (
      <div className="step-content">
        <h3 className="step-heading">Property Details</h3>
        <p className="step-subheading">Tell us more about your property specifications</p>
        {stepError && <span className="error-text agent-popup-step-error">{stepError}</span>}

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
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" />
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
          <div className="form-group" data-field="state">
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

          <div className="form-group">
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
              <div className="form-group" data-field="bedrooms">
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
                        onClick={() => handleChange('bedrooms', num)}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                )}
                {errors.bedrooms && <span className="error-text error-message">{errors.bedrooms}</span>}
              </div>
            )}

            {fieldConfig.showBathrooms && (
              <div className="form-group" data-field="bathrooms">
                <label>Bathrooms {fieldConfig.bathroomsRequired && <span className="required">*</span>}</label>
                <div className={`number-selector ${errors.bathrooms ? 'error' : ''}`}>
                  {(fieldConfig.bathroomsRequired ? ['1', '2', '3', '4', '4+'] : ['0', '1', '2', '3', '4', '4+']).map(num => (
                    <button
                      key={num}
                      type="button"
                      className={`num-btn ${formData.bathrooms === num ? 'active' : ''}`}
                      onClick={() => handleChange('bathrooms', num)}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                {errors.bathrooms && <span className="error-text error-message">{errors.bathrooms}</span>}
              </div>
            )}

            {fieldConfig.showBalconies && (
              <div className="form-group" data-field="balconies">
                <label>Balconies <span className="required">*</span></label>
                <div className={`number-selector ${errors.balconies ? 'error' : ''}`}>
                  {['0', '1', '2', '3', '3+'].map(num => (
                    <button
                      key={num}
                      type="button"
                      className={`num-btn ${formData.balconies === num ? 'active' : ''}`}
                      onClick={() => handleChange('balconies', num)}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                {errors.balconies && <span className="error-text error-message">{errors.balconies}</span>}
              </div>
            )}
          </div>
        )}

        <div className="form-row two-cols">
          <div className="form-group" data-field="area">
            <label>
              {formData.propertyType === 'Plot / Land' ? 'Plot Area' : 'Built-up Area'}
              <span className="required">*</span>
            </label>
            <div className="input-with-suffix">
              <input
                type="number"
                name="area"
                placeholder={formData.propertyType === 'Plot / Land' ? 'Enter plot area' : 'Enter area'}
                value={formData.area}
                onChange={(e) => handleChange('area', e.target.value)}
                className={errors.area ? 'error' : ''}
              />
              <span className="suffix">sq.ft</span>
            </div>
            {errors.area && <span className="error-text">{errors.area}</span>}
          </div>

          {fieldConfig.showCarpetArea && (
            <div className="form-group" data-field="carpetArea">
              <label>Carpet Area</label>
              <div className="input-with-suffix">
                <input
                  type="number"
                  name="carpetArea"
                  placeholder="Enter area"
                  value={formData.carpetArea}
                  onChange={(e) => handleChange('carpetArea', e.target.value)}
                  className={errors.carpetArea ? 'error' : ''}
                />
                <span className="suffix">sq.ft</span>
              </div>
              {errors.carpetArea && <span className="error-text">{errors.carpetArea}</span>}
            </div>
          )}
        </div>

        {(fieldConfig.showFloor || fieldConfig.showTotalFloors) && (
          <div className="form-row two-cols">
            {fieldConfig.showFloor && (
              <div className="form-group" data-field="floor">
                <label>Floor Number <span className="required">*</span></label>
                <input
                  type="number"
                  name="floor"
                  min={0}
                  step={1}
                  placeholder="e.g., 5"
                  value={formData.floor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d+$/.test(v)) handleChange('floor', v);
                  }}
                  className={errors.floor ? 'error' : ''}
                />
                {errors.floor && <span className="error-text">{errors.floor}</span>}
              </div>
            )}

            {fieldConfig.showTotalFloors && (
              <div className="form-group" data-field="totalFloors">
                <label>Total Floors <span className="required">*</span></label>
                <input
                  type="number"
                  placeholder="Total floors in building"
                  value={formData.totalFloors}
                  onChange={(e) => handleChange('totalFloors', e.target.value)}
                />
                {errors.totalFloors && <span className="error-text">{errors.totalFloors}</span>}
              </div>
            )}
          </div>
        )}

        {fieldConfig.showSeats && (
          <div className="form-row two-cols">
            <div className="form-group" data-field="seats">
              <label>Number of Seats <span className="required">*</span></label>
              <input
                type="number"
                placeholder="e.g., 10"
                value={formData.seats}
                onChange={(e) => handleChange('seats', e.target.value)}
                className={errors.seats ? 'error' : ''}
              />
              {errors.seats && <span className="error-text">{errors.seats}</span>}
            </div>
          </div>
        )}

        {(fieldConfig.showFacing || fieldConfig.showAge || fieldConfig.showFurnishing) && (
          <div className="form-row three-cols">
            {fieldConfig.showFacing && (
              <div className="form-group" data-field="facing">
                <label>Facing <span className="required">*</span></label>
                <select
                  name="facing"
                  value={formData.facing}
                  onChange={(e) => handleChange('facing', e.target.value)}
                  className={errors.facing ? 'error' : ''}
                >
                  <option value="">Select</option>
                  {FACING_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {errors.facing && <span className="error-text">{errors.facing}</span>}
              </div>
            )}

            {fieldConfig.showAge && (
              <>
                <div className="form-group" data-field="propertyStatus">
                  <label>Property Status <span className="required">*</span></label>
                  <select
                    value={formData.propertyStatus || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleChange('propertyStatus', val);
                      if (val === 'New') handleChange('age', '');
                    }}
                  >
                    <option value="">Select</option>
                    {PROPERTY_STATUS_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {errors.propertyStatus && <span className="error-text">{errors.propertyStatus}</span>}
                </div>
                {formData.propertyStatus === 'Resale' && (
                  <div className="form-group" data-field="age">
                    <label>Property Age <span className="required">*</span></label>
                    <select
                      value={formData.age}
                      onChange={(e) => handleChange('age', e.target.value)}
                    >
                      <option value="">Select</option>
                      {RESALE_AGE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {errors.age && <span className="error-text">{errors.age}</span>}
                  </div>
                )}
              </>
            )}

            {fieldConfig.showFurnishing && (
              <div className="form-group">
                <label>Furnishing {fieldConfig.showFurnishing && <span className="required">*</span>}</label>
                <select
                  value={formData.furnishing}
                  onChange={(e) => handleChange('furnishing', e.target.value)}
                  className={errors.furnishing ? 'error' : ''}
                >
                  <option value="">Select</option>
                  {FURNISHING_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {errors.furnishing && <span className="error-text">{errors.furnishing}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Get available amenities based on property type
  const getAvailableAmenities = () => {
    if (!formData.propertyType) return AMENITIES;

    const propertyType = PROPERTY_TYPES.find(pt => pt.value === formData.propertyType);
    if (!propertyType) return AMENITIES;

    // Special case for Farm House
    if (formData.propertyType === 'Farm House') {
      const amenityIds = PROPERTY_TYPE_AMENITIES.residential_farmhouse;
      return AMENITIES.filter(a => amenityIds.includes(a.id));
    }

    // Special case for Plot/Land
    if (formData.propertyType === 'Plot / Land') {
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
      <div className="step-content">
        <h3 className="step-heading">Amenities & Description</h3>
        <p className="step-subheading">Select the amenities available and describe your property</p>
        {stepError && <span className="error-text agent-popup-step-error">{stepError}</span>}

        <div className="form-group" data-field="amenities">
          <label>Select Amenities <span className="required">*</span></label>
          <div className={`amenities-grid ${errors.amenities ? 'error' : ''}`}>
            {availableAmenities.map(amenity => (
              <button
                key={amenity.id}
                type="button"
                className={`amenity-btn ${formData.amenities.includes(amenity.id) ? 'active' : ''}`}
                onClick={() => toggleAmenity(amenity.id)}
              >
                <span className="amenity-icon">{amenity.icon}</span>
                <span className="amenity-label">{amenity.label}</span>
                {formData.amenities.includes(amenity.id) && (
                  <span className="check-icon">✓</span>
                )}
              </button>
            ))}
          </div>
          {errors.amenities && <span className="error-text error-message">{errors.amenities}</span>}
        </div>

        <div className="form-group" data-field="description">
          <label>Property Description <span className="required">*</span></label>
          <textarea
            name="description"
            placeholder="Describe your property in detail (minimum 100 characters required). Mention unique features, nearby landmarks, connectivity, etc. Note: Mobile numbers and email addresses are not allowed."
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={5}
            className={errors.description ? 'error' : ''}
          />
          <span className="char-count">
            Characters: {(formData.description || '').length}/1000 (min: 100)
          </span>
          {errors.description && <span className="error-text">{errors.description}</span>}
        </div>
      </div>
    );
  };

  const renderStep4 = () => (
    <div className="step-content">
      <h3 className="step-heading">Upload Photos, Video & Brochure</h3>
      <p className="step-subheading">Add up to 10 high-quality photos, optional video and brochure</p>
      {stepError && <span className="error-text agent-popup-step-error">{stepError}</span>}

      {/* ===== TOP: Image / Video / Brochure upload boxes (no scroll needed to reach) ===== */}
      <div className="media-upload-row">
        {/* Images */}
        <div
          className={`upload-zone media-upload ${errors.images ? 'error' : ''}`}
          onClick={handleImageUploadZoneClick}
          role="button"
          tabIndex={0}
          aria-label="Upload Images"
        >
          <input
            ref={imagesRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <canvas ref={cameraCanvasRef} style={{ display: 'none' }} />
          <div className="upload-content">
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h4>Upload Photos</h4>
            <p>JPG, PNG, WEBP — Max 5MB each</p>
          </div>
        </div>

        {/* Video */}
        <div
          className={`upload-zone media-upload ${errors.video ? 'error' : ''}`}
          onClick={() => videoRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload Video"
        >
          <input
            ref={videoRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg"
            onChange={handleVideoUpload}
            style={{ display: 'none' }}
          />
          <div className="upload-content">
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M23 7v10a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h18a2 2 0 012 2zM10 8l6 4-6 4V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h4>Upload Video (Optional)</h4>
            <p>MP4, WEBM, MOV — Max 50MB</p>
            {errors.video && <span className="error-text small">{errors.video}</span>}
          </div>
        </div>

        {/* Brochure */}
        <div
          className={`upload-zone media-upload ${errors.brochure ? 'error' : ''}`}
          onClick={() => brochureRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload Brochure"
        >
          <input
            ref={brochureRef}
            type="file"
            accept="application/pdf"
            onChange={handleBrochureUpload}
            style={{ display: 'none' }}
          />
          <div className="upload-content">
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h4>Upload Brochure (PDF)</h4>
            <p>PDF — Max 10MB</p>
            {errors.brochure && <span className="error-text small">{errors.brochure}</span>}
          </div>
        </div>
      </div>

      {/* ===== previews: Video and Brochure appear BEFORE images preview grid so user sees them without scrolling ===== */}
      <div className="media-preview-row">
        {formData.video && (
          <div className="video-preview-card preview-item media-card">
            <video controls src={formData.video.url} className="video-player" />
            <div className="media-card-footer">
              <div className="media-info">
                <strong>{formData.video.name}</strong>
                <span className="media-size">{Math.round(formData.video.size / 1024 / 1024 * 100) / 100} MB</span>
              </div>
              <div className="media-actions">
                <button type="button" className="remove-btn small" onClick={removeVideo} aria-label="Remove video">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {formData.brochure && (
          <div className="brochure-preview-card preview-item media-card">
            <div className="brochure-card">
              <div className="pdf-icon">📄</div>
              <div className="brochure-info">
                <strong className="brochure-name">{formData.brochure.name}</strong>
                <span className="media-size">{Math.round(formData.brochure.size / 1024)} KB</span>
              </div>
              <div className="media-actions">
                <button type="button" className="remove-btn small" onClick={removeBrochure} aria-label="Remove brochure">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Images preview grid with validation status */}
      {errors.images && <span className="error-text center">{errors.images}</span>}

      {formData.images?.length > 0 && (
        <div className="image-preview-section">
          <div className="preview-header">
            <span>Uploaded Photos ({formData.images.length}/10)</span>
            <div>
              <button
                type="button"
                className="add-more-btn"
                onClick={() => imagesRef.current?.click()}
                disabled={isCheckingImages}
              >
                + Add More
              </button>
            </div>
          </div>
          <div className="image-preview-grid">
            {formData.images.map((src, idx) => {
              const validationStatus = imageValidationStatus[idx] || { status: 'pending', errorMessage: '' };

              return (
                <div key={idx} className={`preview-item image-validation-item ${validationStatus.status}`}>
                  <img src={src} alt={`Preview ${idx + 1}`} />
                  {idx === 0 && <span className="cover-badge">Cover</span>}

                  {/* Validation Overlays */}
                  {validationStatus.status === 'checking' && (
                    <div className="validation-overlay checking-overlay">
                      <div className="overlay-content">
                        <div className="spinner"></div>
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

  const renderStep5 = () => {
    const fieldConfig = getPropertyTypeConfig();
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

    return (
      <div className="step-content">
        <h3 className="step-heading">Pricing Details</h3>
        <p className="step-subheading">Set the right price for your property</p>
        {stepError && <span className="error-text agent-popup-step-error">{stepError}</span>}

        <div className="form-group" data-field="price">
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
          {errors.price && <span className="error-text">{errors.price}</span>}
        </div>

        {fieldConfig.showPricePerSeat && (
          <div className="form-group" data-field="pricePerSeat">
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
            {errors.pricePerSeat && <span className="error-text">{errors.pricePerSeat}</span>}
          </div>
        )}

        <div className="form-group">
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
            <div className="form-group" data-field="depositAmount">
              <label>Security Deposit</label>
              <div className="price-input-wrapper">
                <span className="currency">₹</span>
                <input
                  type="number"
                  name="depositAmount"
                  placeholder="Enter deposit amount"
                  value={formData.depositAmount}
                  onChange={(e) => handleChange('depositAmount', e.target.value)}
                  className={errors.depositAmount ? 'error' : ''}
                />
              </div>
              {formData.depositAmount && (
                <span className="price-words">
                  {formatPriceInWords(formData.depositAmount)}
                </span>
              )}
              {errors.depositAmount && <span className="error-text">{errors.depositAmount}</span>}
            </div>

            <div className="form-group">
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
          <div className="form-group">
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

        <div className="listing-summary">
          <h4>Listing Summary</h4>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">Property</span>
              <span className="summary-value">{formData.title || '-'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Type</span>
              <span className="summary-value">{formData.propertyType || '-'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Location</span>
              <span className="summary-value">{formData.location || '-'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Configuration</span>
              <span className="summary-value">
                {formData.bedrooms ? `${formData.bedrooms} BHK` : '-'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Area</span>
              <span className="summary-value">
                {formData.area ? `${formData.area} sq.ft` : '-'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Photos</span>
              <span className="summary-value">
                {formData.images?.length || 0} uploaded
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Video</span>
              <span className="summary-value">{formData.video ? formData.video.name : '—'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Brochure</span>
              <span className="summary-value">{formData.brochure ? formData.brochure.name : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    );
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
    <>
      {/* Property Upload Success Modal - Render outside popup-overlay */}
      <PropertyUploadSuccessModal
        isOpen={showEditNoticeModal}
        redirectPath="/agent-dashboard/properties"
        onClose={() => {
          setShowEditNoticeModal(false);
          onClose();
        }}
      />

      {/* Close Warning Modal - Show when trying to close on final step without publishing */}
      {showCloseWarning && (
        <div className="popup-overlay" style={{ zIndex: 10000 }}>
          <div className="popup-container" style={{ maxWidth: '500px' }}>
            <div className="popup-header">
              <h2>Publishing Not Completed</h2>
              <button
                className="close-btn"
                onClick={() => setShowCloseWarning(false)}
                aria-label="Close"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="popup-body" style={{ padding: '2rem' }}>
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
            <div className="popup-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setShowCloseWarning(false)}
              >
                Continue Editing
              </button>

            </div>
          </div>
        </div>
      )}

      {/* Main Popup Overlay - Only show if edit notice not shown and close warning not shown */}
      {!showEditNoticeModal && !showCloseWarning && (
        <div className="popup-overlay">
          <div className="popup-container" ref={popupContainerRef} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="popup-header">
              <h2>{editIndex !== null ? 'Edit Property' : 'List Your Property'}</h2>
              <button className="close-btn" onClick={handleCloseAttempt} aria-label="Close">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Step Indicator */}
            {renderStepIndicator()}

            {/* Form Content */}
            <div className="popup-body" ref={popupBodyRef}>
              {renderCurrentStep()}
            </div>

            {/* Footer */}
            <div className="popup-footer">
              {currentStep > 1 && (
                <button type="button" className="back-btn" onClick={handleBack}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Back
                </button>
              )}

              <div className="footer-right">
                <button type="button" className="cancel-btn" onClick={handleCloseAttempt}>
                  Cancel
                </button>

                {currentStep < 5 ? (
                  <button type="button" className="next-btn" onClick={handleNext}>
                    Next
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="submit-btn"
                    onClick={handleSubmit}
                    disabled={isSubmitting || isDiscarded}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="spinner"></span>
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
                ref={cameraVideoRef}
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
    </>
  );
}
