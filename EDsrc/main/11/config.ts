// --- Google Drive Integration Configuration ---

// IMPORTANT: To enable the Google Drive automatic saving feature, you must create
// a project in the Google Cloud Console and generate credentials.

// Follow these steps:
// 1. Go to the Google Cloud Console: https://console.cloud.google.com/
// 2. Create a new project or select an existing one.
// 3. In the navigation menu, go to "APIs & Services" > "Enabled APIs & services".
// 4. Click "+ ENABLE APIS AND SERVICES", search for "Google Drive API", and enable it.
// 5. Go to "APIs & Services" > "Credentials".
// 6. Click "+ CREATE CREDENTIALS" and choose "API key". Copy the key and paste it below.
//    - It's recommended to restrict this key to your website's domain for security.
// 7. Click "+ CREATE CREDENTIALS" again and choose "OAuth client ID".
//    - Select "Web application" as the application type.
//    - Under "Authorized JavaScript origins", add the URL where you are running this app (e.g., http://localhost:3000).
//    - Copy the generated "Client ID" and paste it below.

// Replace "" with your actual Google Cloud Client ID
export const GOOGLE_CLIENT_ID = "";

// Replace "" with your actual Google Cloud API Key
export const GOOGLE_API_KEY = "";
