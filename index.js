// Simple initialization script for PAMA
document.addEventListener('DOMContentLoaded', function() {
  // Check if CSInterface is available
  if (typeof CSInterface !== 'undefined') {
    const csInterface = new CSInterface();
    console.log("After Effects version: " + csInterface.appVersion);

    try {
      // Start the server extension
      csInterface.requestOpenExtension("com.yourcompany.pama.server", "");
      console.log("PAMA server extension requested");
    } catch (e) {
      console.error("Error requesting server extension:", e);
    }
  } else {
    console.warn("CSInterface not found. Running in browser mode.");
  }

  // React app will handle the rest of the initialization through index.bundle.js
  console.log("PAMA: Initialization complete, React app should take over now");
});