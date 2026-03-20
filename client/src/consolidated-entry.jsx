// Consolidated entry point that includes JSX initialization and React app
import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import './index.css';
import logger from './utils/logger';

// JSX System Initialization - Following bodymovin pattern
// This replaces the separate jsx-init.js file
(function() {
    'use strict';
    
    logger.jsx('Consolidated JSX initialization script loaded');
    
    var isRunning = false;
    var fileName = 'initializer.jsx';
    var jsxInitialized = false;
    
    // Create a promise for JSX loading following bodymovin pattern
    var jsxPromise = new Promise(function(resolve, reject) {
        
        function initJSX() {
            if (isRunning || jsxInitialized) {
                logger.jsx('JSX initialization already running or completed');
                return;
            }

            logger.jsx('Starting JSX initialization...');
            isRunning = true;
            
            // Check if CSInterface is available
            if (typeof CSInterface === 'undefined') {
                console.error('PAMA: CSInterface not available for JSX initialization');
                reject(new Error('CSInterface not available'));
                return;
            }
            
            try {
                var cs = new CSInterface();
                var extensionRoot = cs.getSystemPath("extension") || ".";
                var initializerPath = extensionRoot.replace(/\\/g, '/') + "/jsx/" + fileName;
                
                console.log('PAMA: Loading JSX initializer from:', initializerPath);
                
                // Load the JSX initializer synchronously like bodymovin
                cs.evalScript('$.evalFile("' + initializerPath + '");', function(result) {
                    console.log('PAMA: JSX evalScript result:', result);
                    
                    // Validate that the critical objects were created
                    cs.evalScript('typeof $.__bodymovin', function(bodymovinType) {
                        cs.evalScript('typeof $.__bodymovin.bm_lottieImporter', function(importerType) {
                            console.log('PAMA: $.__bodymovin type:', bodymovinType);
                            console.log('PAMA: $.__bodymovin.bm_lottieImporter type:', importerType);
                            
                            if (bodymovinType === 'object' && importerType === 'object') {
                                console.log('PAMA: ✓ JSX system validation passed');
                                
                                // Remove event listeners to prevent multiple initializations
                                window.removeEventListener('focus', initJSX);
                                window.removeEventListener('click', initJSX);
                                window.removeEventListener('mousedown', initJSX);
                                window.removeEventListener('keydown', initJSX);
                                
                                jsxInitialized = true;
                                isRunning = false;
                                
                                console.log('PAMA: JSX system initialized and validated successfully');
                                resolve();
                            } else {
                                console.error('PAMA: ✗ JSX system validation failed');
                                console.error('PAMA: Expected object types, got:', bodymovinType, importerType);
                                isRunning = false;
                                reject(new Error('JSX system validation failed'));
                            }
                        });
                    });
                });
                
            } catch (error) {
                console.error('PAMA: Error during JSX initialization:', error);
                isRunning = false;
                reject(error);
            }
        }
        
        // Attach to multiple events for reliable initialization (bodymovin pattern)
        window.addEventListener('focus', initJSX);
        window.addEventListener('click', initJSX);
        window.addEventListener('mousedown', initJSX);
        window.addEventListener('keydown', initJSX);
        
        // Also try to initialize immediately if DOM is ready
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(initJSX, 100);
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(initJSX, 100);
            });
        }
    });
    
    // Make the promise available globally for other scripts to wait on
    window.pamaJSXPromise = jsxPromise;
    
    // Also provide a simple check function
    window.isPamaJSXReady = function() {
        return jsxInitialized;
    };
    
    console.log('PAMA: JSX initialization promise created');
    
})();

// Redux Store Initialization - Consolidated from redux-init.js
(function() {
    'use strict';
    
    console.log('PAMA: Redux initialization script loaded');
    
    let reduxInitialized = false;
    
    function initializeReduxStore() {
        if (reduxInitialized) {
            console.log('PAMA: Redux store already initialized');
            return true;
        }
        
        try {
            console.log('PAMA: Attempting to initialize Redux store...');
            
            if (typeof __webpack_require__ === 'undefined') {
                console.log('PAMA: __webpack_require__ not available yet');
                return false;
            }
            
            // Get Redux functions from the bundle
            const Redux = __webpack_require__(305); // createStore module
            const rootReducer = __webpack_require__(856); // root reducer module
            const storeDispatcher = __webpack_require__(90); // store dispatcher module
            
            if (!Redux || !rootReducer || !storeDispatcher) {
                console.log('PAMA: Redux modules not ready yet');
                return false;
            }
            
            console.log('PAMA: Creating Redux store...');
            const store = Redux.createStore(rootReducer);
            
            // Make store available globally
            window.pamaStore = store;
            
            // Initialize the store dispatcher
            if (storeDispatcher.initializeStore) {
                storeDispatcher.initializeStore(store);
                console.log('PAMA: Store dispatcher initialized');
            }
            
            reduxInitialized = true;
            console.log('PAMA: Redux store initialized successfully');
            return true;
            
        } catch (error) {
            console.error('PAMA: Error initializing Redux store:', error);
            return false;
        }
    }
    
    // Wait for JSX system to be ready (now handled by jsx-init.js)
    function waitForJSXSystem() {
        console.log('PAMA: Waiting for JSX system to be ready...');
        
        if (window.pamaJSXPromise) {
            window.pamaJSXPromise.then(function() {
                console.log('PAMA: JSX system is ready');
            }).catch(function(error) {
                console.error('PAMA: JSX system failed to initialize:', error);
            });
        } else {
            console.warn('PAMA: JSX initialization promise not found');
        }
    }
    
    // Try to initialize when bundle is ready
    function waitForBundle() {
        let attempts = 0;
        const maxAttempts = 50;
        
        function checkAndInit() {
            attempts++;
            
            if (typeof __webpack_require__ !== 'undefined') {
                const success = initializeReduxStore();
                if (success) {
                    // Dispatch a custom event to notify that Redux is ready
                    window.dispatchEvent(new CustomEvent('redux-ready'));
                    return;
                }
            }
            
            if (attempts >= maxAttempts) {
                console.error('Failed to initialize Redux store after', maxAttempts, 'attempts');
                // Still dispatch the event so the app doesn't hang
                window.dispatchEvent(new CustomEvent('redux-ready'));
                return;
            }
            
            setTimeout(checkAndInit, 100);
        }
        
        checkAndInit();
    }
    
    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            waitForBundle();
            // Wait for JSX system (now handled by jsx-init.js)
            waitForJSXSystem();
        });
    } else {
        waitForBundle();
        // Wait for JSX system (now handled by jsx-init.js)
        waitForJSXSystem();
    }

})();

// React Application Initialization
document.addEventListener('DOMContentLoaded', function() {
  console.log('React: DOMContentLoaded event fired');

  // Function to initialize React
  const initReact = function() {
    console.log('React: Initializing React application');

    // Find the root element
    const rootElement = document.getElementById('root');
    
    if (!rootElement) {
      console.error('React: Root element not found, creating it');
      
      // Create the root element if it doesn't exist
      const newRoot = document.createElement('div');
      newRoot.id = 'root';
      document.body.appendChild(newRoot);
      
      // Render to the new root
      try {
        ReactDOM.render(<App />, newRoot);
        console.log('React: Rendered App component to new root');
      } catch (error) {
        console.error('React: Error rendering App component:', error);
      }
    } else {
      console.log('React: Root element found, rendering App');

      // Render to the existing root using the older ReactDOM.render method
      try {
        ReactDOM.render(<App />, rootElement);
        console.log('React: Rendered App component to existing root');
      } catch (error) {
        console.error('React: Error rendering App component:', error);
      }
    }
  };

  // Check if CSInterface is available
  if (typeof CSInterface !== 'undefined') {
    console.log('React: CSInterface is available');
    // Wait a short time to ensure CSInterface is fully initialized
    setTimeout(initReact, 100);
  } else {
    console.log('React: CSInterface not available, proceeding anyway');
    // Initialize React even without CSInterface
    initReact();
  }
});
