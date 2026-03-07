// SellerContactPage.jsx – contact form uses same backend sendmail as Contact.jsx
import React, { useState, useRef, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { API_BASE_URL, API_ENDPOINTS } from "../../config/api.config";
import "../styles/SellerContactPage.css";

export default function SellerContactPage() {
  const formRef = useRef(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [errors, setErrors] = useState({});

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: "" }));
    if (errors.submit) setErrors(prev => ({ ...prev, submit: "" }));
  }, [errors]);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone) => {
    const cleaned = (phone || "").replace(/\D/g, "");
    return cleaned.length >= 10 && /^[\+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/.test(phone || "");
  };

  const handleSubmit = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    const trimmedName = formData.name?.trim();
    const trimmedEmail = formData.email?.trim();
    const trimmedPhone = formData.phone?.trim();
    const trimmedMessage = formData.message?.trim();

    const newErrors = {};
    if (!trimmedName || trimmedName.length < 2) newErrors.name = "Name must be at least 2 characters";
    if (!trimmedEmail) newErrors.email = "Email is required";
    else if (!validateEmail(trimmedEmail)) newErrors.email = "Please enter a valid email address";
    if (!trimmedPhone) newErrors.phone = "Phone number is required";
    else if (!validatePhone(trimmedPhone)) newErrors.phone = "Please enter a valid phone number";
    if (!trimmedMessage || trimmedMessage.length < 10) newErrors.message = "Message must be at least 10 characters";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      window.scrollTo({ top: scrollPosition, behavior: "auto" });
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    fetch(API_BASE_URL + API_ENDPOINTS.CONTACT_SENDMAIL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        message: trimmedMessage,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Failed to send message. Please try again later.");
        return data;
      })
      .then(() => {
        setIsSubmitting(false);
        setSubmitted(true);
        setFormData({ name: "", email: "", phone: "", message: "" });
        requestAnimationFrame(() => window.scrollTo({ top: scrollPosition, behavior: "auto" }));
        setTimeout(() => setSubmitted(false), 2500);
      })
      .catch((error) => {
        setIsSubmitting(false);
        setErrors({ submit: error.message || "Failed to send message. Please try again later." });
        console.error("SellerContact sendmail error:", error);
        window.scrollTo({ top: 0, behavior: "auto" });
      });
  };

  return (
    <div className="seller-contact-main">
      <div className="seller-contact-container">

        {/* HEADER */}
        <div className="seller-contact-header">
          <h1 className="seller-contact-title">
            Get In Touch
          </h1>
          <p className="seller-header-text">
            Contact us for a free quote or emergency service
          </p>
        </div>

        {/* TWO COLUMN LAYOUT */}
        <div className="seller-contact-two-column">
          
          {/* LEFT COLUMN - CONTACT INFORMATION */}
          <div className="seller-contact-info-card">
            <h2 className="seller-contact-info-title">Contact Information</h2>
            
            <div className="seller-contact-info-item">
              <div className="seller-contact-info-label">Phone</div>
              <a href="tel:+917057714677" className="seller-contact-info-link">
                +917057714677
              </a>
            </div>

            <div className="seller-contact-info-item">
              <div className="seller-contact-info-label">Email</div>
              <a href="mailto:info@360coordinates.com" className="seller-contact-info-link">
                info@360coordinates.com
              </a>
            </div>

            <div className="seller-contact-info-item">
              <div className="seller-contact-info-label">Address</div>
              <a 
                href="https://www.google.com/maps/search/?api=1&query=Office+No.21+%26+22,+3rd+Floor,+S%2FNo.+56,+Aston+Plaza,+Ambegaon+Bk.,+Pune,+Maharashtra+411046"
                target="_blank"
                rel="noopener noreferrer"
                className="seller-contact-info-address"
              >
                Office No.21 & 22, 3rd Floor, S/No. 56<br />
                Aston Plaza, Ambegaon Bk.<br />
                Pune, Maharashtra– 411046
              </a>
            </div>
          </div>

          {/* RIGHT COLUMN - CONTACT FORM */}
          <div className="seller-form-card">
            <h2 className="seller-form-title">Send Us a Message</h2>

            {submitted && (
              <div className="seller-success-box">
                Message sent successfully!
              </div>
            )}
            {(errors.submit || Object.keys(errors).some((k) => k !== "submit" && errors[k])) && (
              <div className="seller-contact-error" style={{ color: "#c00", marginBottom: "12px", fontSize: "14px" }}>
                {errors.submit || Object.values(errors).find(Boolean)}
              </div>
            )}

            <form 
              ref={formRef}
              className="seller-form-inputs"
              onSubmit={handleSubmit}
              onKeyDown={(e) => {
                // Prevent Enter key from submitting form and causing scroll jump (except in textarea)
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                  e.preventDefault();
                }
              }}
            >
              
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Your Name"
              />

              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Your Email"
              />

              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Phone Number"
              />

              <textarea
                name="message"
                rows="4"
                value={formData.message}
                onChange={handleChange}
                placeholder="Message"
              ></textarea>

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send Message"}
              </button>

            </form>
          </div>

        </div>

        {/* FAQ Section */}
        <div className="seller-faq-section">
          <h2 className="seller-faq-title">Frequently Asked Questions</h2>
          <div className="seller-faq-list">
            {[
              {
                question: "How do I list a property?",
                answer: "To list your property, log in to your seller dashboard and click on 'My Properties'. Then click the 'Add Property' button and fill in all the required details including property type, location, price, and images. Once submitted, your property will be reviewed and published."
              },
              {
                question: "How can I contact the property owner?",
                answer: "You can contact property owners directly through our chat feature. Simply click on the 'Chat' button on any property listing page, or use the ChatUs page in your dashboard. Property owners will receive your message and can respond to your inquiries."
              },
              {
                question: "Is my data secure?",
                answer: "Yes, we take data security seriously. All your personal information, including contact details and property data, is encrypted and stored securely. We follow industry-standard security practices and never share your information with third parties without your consent."
              },
              {
                question: "How do I edit my profile?",
                answer: "To edit your profile, go to your dashboard and click on 'Profile' in the navigation menu. From there, you can update your personal information, contact details, profile picture, and other settings. Remember to save your changes before leaving the page."
              },
              {
                question: "How can I get support?",
                answer: "You can get support by filling out the contact form on this page, or by emailing us directly at info@360coordinates.com. Our support team typically responds within 24 hours. You can also call us at +917057714677 during business hours."
              }
            ].map((faq, index) => (
              <div key={index} className={`seller-faq-item ${openFaqIndex === index ? 'open' : ''}`}>
                <button
                  className="seller-faq-question"
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                >
                  <span>{faq.question}</span>
                  <ChevronDown 
                    size={20} 
                    className={`seller-faq-icon ${openFaqIndex === index ? 'open' : ''}`}
                  />
                </button>
                {openFaqIndex === index && (
                  <div className="seller-faq-answer">
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

