import React from 'react';
import { Link } from 'react-router-dom';
import SocialIcons from '../../components/SocialIcons';
import '../styles/Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  // Scroll to top when footer link is clicked
  const handleLinkClick = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <footer className="footer">
      {/* Decorative Top Wave */}
      <div className="footer-wave">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"></path>
        </svg>
      </div>

      <div className="footer-container">
        {/* Main Footer Content */}
        <div className="footer-main">
          {/* About Section with Logo */}
          <div className="footer-column footer-about">
            <div className="footer-logo">
              <img src="/logoswhites.png" alt="India Propertys" className="footer-logo-image" />
            </div>
            <p className="footer-description">
              Vedant Infoedge India LLP is a trusted real estate platform dedicated to helping buyers, sellers, and renters connect seamlessly. We provide verified property listings, transparent pricing, and expert support to make real estate transactions simpler, safer, and faster. Whether you're searching for your dream home or the perfect commercial space, we are here to guide you every step of the way.
            </p>
          </div>

          {/* Quick Links */}
          <div className="footer-column">
            <h3 className="footer-heading">
              <span>Quick Links</span>
            </h3>
            <ul className="footer-links">
              <li>
                <Link to="/about" onClick={handleLinkClick}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                  </svg>
                  <span>About Us</span>
                </Link>
              </li>
              <li>
                <Link to="/contact" onClick={handleLinkClick}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                  </svg>
                  <span>Contact</span>
                </Link>
              </li>
              <li>
                <Link to="/privacy-policy" onClick={handleLinkClick}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                  </svg>
                  <span>Privacy Policy</span>
                </Link>
              </li>
              <li>
                <Link to="/terms-conditions" onClick={handleLinkClick}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                  </svg>
                  <span>Terms & Conditions</span>
                </Link>
              </li>
              <li>
                <Link to="/admin/login" className="admin-link" onClick={handleLinkClick}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                  </svg>
                  <span>For Admin Only</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="footer-column">
            <h3 className="footer-heading">
              <span>Contact Info</span>
            </h3>
            <ul className="footer-contact">
              <li>
                <a href="mailto:info@360coordinates.com" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div className="contact-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                    </svg>
                  </div>
                  <div className="contact-text">
                    <span className="contact-label">Email</span>
                    <span className="contact-value">info@360coordinates.com</span>
                  </div>
                </a>
              </li>
              <li>
                <a href="https://maps.app.goo.gl/n2mTUvTRjHs8pXyZ8" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div className="contact-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                  </div>
                  <div className="contact-text">
                    <span className="contact-label">Address</span>
                    <span className="contact-value">Pune , Maharashtra, India</span>
                  </div>
                </a>
              </li>
            </ul>

            {/* Social Media - Official brand icons */}
            <div className="footer-social">
              <SocialIcons linkClassName="social-link" />
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            <p className="footer-copyright">
              © {currentYear} <span className="copyright-brand">Vedant Infoedge India LLP</span>. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;