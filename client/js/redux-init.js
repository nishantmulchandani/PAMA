/**
 * Minimal Redux Store Initialization for Bodymovin Importer
 * This initializes the Redux store that the convert function expects
 */

(function() {
    'use strict';
    
    // Wait for the main bundle to load
    function initializeReduxStore() {
        try {
            // Check if Redux and required modules are available
            if (typeof __webpack_require__ === 'undefined') {
                console.error('Webpack not available');
                return false;
            }
            
            // Get Redux functions from the bundle
            const Redux = __webpack_require__(305); // createStore module
            const combineReducers = __webpack_require__(831); // combineReducers module
            const rootReducer = __webpack_require__(856); // root reducer module
            const storeDispatcher = __webpack_require__(90); // store dispatcher module
            
            // Create minimal store with the existing root reducer
            const store = Redux.createStore(rootReducer.default || rootReducer);
            
            // Set the dispatcher that the convert function expects
            storeDispatcher.setDispatcher(store.dispatch);
            
            console.log('Redux store initialized successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to initialize Redux store:', error);
            
            // Fallback: Create a mock dispatcher
            try {
                const storeDispatcher = __webpack_require__(90);
                storeDispatcher.setDispatcher(function(action) {
                    console.log('Mock dispatch:', action);
                });
                console.log('Mock dispatcher initialized as fallback');
                return true;
            } catch (fallbackError) {
                console.error('Failed to create mock dispatcher:', fallbackError);
                return false;
            }
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
        document.addEventListener('DOMContentLoaded', waitForBundle);
    } else {
        waitForBundle();
    }

})();
