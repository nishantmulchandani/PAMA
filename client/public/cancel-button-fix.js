/**
 * PAMA Cancel Button Fix
 * Addresses issues with cancel button not working and loading state persisting after import completion
 */

(function() {
    'use strict';

    console.log('🔧 PAMA Cancel Button Fix: Loading...');

    let fixInterval;
    let completionCheckInterval;

    // Enhanced cancel function that works regardless of UI state
    function forceCancel() {
        console.log('🛑 FORCE CANCEL: Attempting comprehensive cancellation...');

        try {
            // 1. Set all possible cancellation flags
            window.PAMA_IMPORT_CANCELLED = true;
            window.BODYMOVIN_CANCELLED = true;

            // 2. Cancel bodymovin operations
            if (window.$__bodymovin?.bm_compsManager) {
                window.$__bodymovin.bm_compsManager.cancelled = true;
                if (typeof window.$__bodymovin.bm_compsManager.cancel === 'function') {
                    window.$__bodymovin.bm_compsManager.cancel();
                }
            }

            // 3. Cancel via BodymovinImporter
            if (window.BodymovinImporter?.cancel) {
                window.BodymovinImporter.cancel();
            }

            // 4. Cancel After Effects operations via CSInterface
            if (window.CSInterface) {
                window.CSInterface.evalScript('app.cancelTask()').catch(() => {
                    console.log('🛑 Could not cancel AE task via CSInterface');
                });
            }

            // 5. Trigger React state updates if possible
            const event = new CustomEvent('pama-force-cancel', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);

            console.log('✅ FORCE CANCEL: All cancellation methods attempted');
            
            // 6. Show user feedback
            showCancelFeedback();

        } catch (error) {
            console.error('❌ FORCE CANCEL: Error during cancellation:', error);
        }
    }

    // Show visual feedback that cancellation occurred
    function showCancelFeedback() {
        // Try to update any visible status elements
        const statusElements = document.querySelectorAll('.grok-subtitle, .grok-title, .status');
        statusElements.forEach(el => {
            if (el.textContent.includes('Animating') || el.textContent.includes('Importing') || el.textContent.includes('Loading')) {
                el.textContent = '🛑 Import cancelled';
                el.style.color = '#ff6b6b';
            }
        });

        // Hide progress bars
        const progressBars = document.querySelectorAll('.grok-progress-bar, .progress-bar');
        progressBars.forEach(bar => {
            bar.style.display = 'none';
        });
    }

    // Enhanced completion detection
    function detectCompletion() {
        // Check if import appears to be stuck or completed
        const animatingElements = document.querySelectorAll('[class*="importing"], [class*="loading"]');
        const hasAnimatingElements = animatingElements.length > 0;

        if (hasAnimatingElements) {
            // Check if After Effects has new compositions (indicates completion)
            if (window.CSInterface) {
                window.CSInterface.evalScript('app.project.numItems', (numItems) => {
                    const itemCount = parseInt(numItems) || 0;
                    if (itemCount > 0) {
                        console.log('✅ COMPLETION DETECTED: After Effects has', itemCount, 'items');
                        
                        // Trigger completion event
                        const event = new CustomEvent('pama-force-complete', {
                            detail: { itemCount, timestamp: Date.now() }
                        });
                        window.dispatchEvent(event);
                        
                        showCompletionFeedback();
                    }
                });
            }
        }
    }

    // Show completion feedback
    function showCompletionFeedback() {
        const statusElements = document.querySelectorAll('.grok-subtitle, .grok-title, .status');
        statusElements.forEach(el => {
            if (el.textContent.includes('Animating') || el.textContent.includes('Importing') || el.textContent.includes('Loading')) {
                el.textContent = '✅ Import completed successfully!';
                el.style.color = '#4caf50';
            }
        });

        // Hide progress bars
        const progressBars = document.querySelectorAll('.grok-progress-bar, .progress-bar');
        progressBars.forEach(bar => {
            bar.style.display = 'none';
        });
    }

    // Fix cancel buttons
    function fixCancelButtons() {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
            if (btn.textContent && (btn.textContent.includes('Cancel') || btn.textContent.includes('Force Stop'))) {
                // Remove existing listeners and add our enhanced cancel
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                
                newBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🛑 ENHANCED CANCEL: Button clicked');
                    forceCancel();
                }, true);

                // Make sure button is visible and enabled
                newBtn.style.display = 'block';
                newBtn.disabled = false;
                newBtn.style.opacity = '1';
                
                console.log('🔧 Enhanced cancel button fixed:', newBtn.textContent);
            }
        });
    }

    // Add emergency cancel button if none exists
    function addEmergencyCancelButton() {
        if (document.querySelector('.emergency-cancel-btn')) return;

        const emergencyBtn = document.createElement('button');
        emergencyBtn.className = 'emergency-cancel-btn';
        emergencyBtn.textContent = '🛑 Emergency Cancel';
        emergencyBtn.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #ff4444;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;

        emergencyBtn.addEventListener('click', forceCancel);
        document.body.appendChild(emergencyBtn);
        
        console.log('🆘 Emergency cancel button added');
    }

    // Listen for React events
    function setupEventListeners() {
        window.addEventListener('pama-force-cancel', () => {
            console.log('🛑 React cancel event received');
        });

        window.addEventListener('pama-force-complete', () => {
            console.log('✅ React completion event received');
        });
    }

    // Main fix function
    function runFixes() {
        try {
            fixCancelButtons();
            addEmergencyCancelButton();
            detectCompletion();
        } catch (error) {
            console.error('🔧 Fix error:', error);
        }
    }

    // Initialize
    function initialize() {
        console.log('🔧 PAMA Cancel Button Fix: Initializing...');
        
        setupEventListeners();
        runFixes();

        // Run fixes periodically to catch dynamically created elements
        if (fixInterval) clearInterval(fixInterval);
        fixInterval = setInterval(runFixes, 2000);

        // Run completion detection periodically
        if (completionCheckInterval) clearInterval(completionCheckInterval);
        completionCheckInterval = setInterval(detectCompletion, 5000);

        console.log('✅ PAMA Cancel Button Fix: Initialized');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Expose global function for manual use
    window.PAMA_FORCE_CANCEL = forceCancel;
    window.PAMA_DETECT_COMPLETION = detectCompletion;

})();
