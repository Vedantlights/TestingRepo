<?php
/**
 * Welcome Email HTML Template
 * Generates HTML email content for welcome emails
 */

/**
 * Generate welcome email HTML template
 * 
 * @param string $userName User's full name
 * @param string $userEmail User's email address
 * @return string HTML email content
 */
function generateWelcomeEmailTemplate($userName, $userEmail) {
    $greeting = htmlspecialchars($userName);
    $websiteUrl = defined('BASE_URL') ? BASE_URL : 'https://testapi.360coordinates.com';
    $currentYear = date('Y');
    
    $html = '
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to India Propertys</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <!-- Main Container -->
                <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Welcome to India Propertys! 🏡</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="margin: 0 0 20px; color: #333333; font-size: 24px;">Hi ' . $greeting . ',</h2>
                            
                            <p style="margin: 0 0 20px; color: #666666; font-size: 16px; line-height: 1.6;">
                                Welcome to India Propertys! We\'re thrilled to have you join our community of property seekers and sellers.
                            </p>
                            
                            <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                                Your account has been successfully created. You can now explore thousands of properties, save your favorites, and connect with sellers directly.
                            </p>
                            
                            <!-- Features List -->
                            <table role="presentation" style="width: 100%; margin: 30px 0; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 15px; background-color: #f8f9fa; border-left: 4px solid #667eea; margin-bottom: 10px;">
                                        <p style="margin: 0; color: #333333; font-size: 15px; font-weight: bold;">✨ Browse Properties</p>
                                        <p style="margin: 5px 0 0; color: #666666; font-size: 14px;">Explore residential and commercial properties across India</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 15px; background-color: #f8f9fa; border-left: 4px solid #764ba2; margin-top: 10px;">
                                        <p style="margin: 0; color: #333333; font-size: 15px; font-weight: bold;">❤️ Save Favorites</p>
                                        <p style="margin: 5px 0 0; color: #666666; font-size: 14px;">Save your favorite properties for easy access later</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 15px; background-color: #f8f9fa; border-left: 4px solid #667eea; margin-top: 10px;">
                                        <p style="margin: 0; color: #333333; font-size: 15px; font-weight: bold;">📞 Direct Contact</p>
                                        <p style="margin: 5px 0 0; color: #666666; font-size: 14px;">Connect directly with property owners and agents</p>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 40px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="' . htmlspecialchars($websiteUrl) . '" style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Start Exploring Properties</a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 30px 0 20px; color: #666666; font-size: 14px; line-height: 1.6;">
                                If you have any questions or need assistance, feel free to reach out to our support team. We\'re here to help you find your dream property!
                            </p>
                            
                            <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6;">
                                Best regards,<br>
                                <strong style="color: #333333;">The India Propertys Team</strong>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0 0 10px; color: #666666; font-size: 14px;">
                                <strong>India Propertys</strong><br>
                                Your trusted property search platform
                            </p>
                            <p style="margin: 10px 0; color: #999999; font-size: 12px;">
                                © ' . $currentYear . ' India Propertys. All rights reserved.
                            </p>
                            <p style="margin: 10px 0 0; color: #999999; font-size: 12px;">
                                This email was sent to ' . htmlspecialchars($userEmail) . '
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>';
    
    return $html;
}

/**
 * Generate plain text version of welcome email
 * 
 * @param string $userName User's full name
 * @param string $userEmail User's email address
 * @return string Plain text email content
 */
function generateWelcomeEmailPlainText($userName, $userEmail) {
    $websiteUrl = defined('BASE_URL') ? BASE_URL : 'https://testapi.360coordinates.com';
    $currentYear = date('Y');
    
    // Sanitize user input for plain text (remove newlines and excessive whitespace)
    $sanitizedName = trim(preg_replace('/[\r\n]+/', ' ', $userName));
    $sanitizedEmail = trim($userEmail);
    
    $text = "Welcome to India Propertys!\n\n";
    $text .= "Hi " . $sanitizedName . ",\n\n";
    $text .= "Welcome to India Propertys! We're thrilled to have you join our community of property seekers and sellers.\n\n";
    $text .= "Your account has been successfully created. You can now explore thousands of properties, save your favorites, and connect with sellers directly.\n\n";
    $text .= "Features:\n";
    $text .= "• Browse Properties - Explore residential and commercial properties across India\n";
    $text .= "• Save Favorites - Save your favorite properties for easy access later\n";
    $text .= "• Direct Contact - Connect directly with property owners and agents\n\n";
    $text .= "Start exploring: " . $websiteUrl . "\n\n";
    $text .= "If you have any questions or need assistance, feel free to reach out to our support team.\n\n";
    $text .= "Best regards,\n";
    $text .= "The India Propertys Team\n\n";
    $text .= "---\n";
    $text .= "© " . $currentYear . " India Propertys. All rights reserved.\n";
    $text .= "This email was sent to " . $sanitizedEmail . "\n";
    
    return $text;
}

