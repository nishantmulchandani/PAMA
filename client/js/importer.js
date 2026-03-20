/**
 * Bodymovin Importer - Simple UI for importing Lottie JSON to After Effects
 * Uses the bridge function from main.50407a1f.js to handle the actual import
 */

(function() {
    'use strict';
    
    let csInterface;
    let preCharged = false;
    let selectedFile = null;
    let lottieData = null;
    let currentChargeId = null; // hold id for manual import
    
    // DOM elements
    let selectFileBtn, importBtn, fileInfo, status;
    
    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        initializeUI();
        initializeCSInterface();
        waitForBridge();
    });
    
    function initializeUI() {
        selectFileBtn = document.getElementById('selectFileBtn');
        importBtn = document.getElementById('importBtn');
        fileInfo = document.getElementById('fileInfo');
        status = document.getElementById('status');
        
        selectFileBtn.addEventListener('click', selectJSONFile);
        importBtn.addEventListener('click', importToAfterEffects);
        
        updateStatus('Ready to import Lottie JSON files', 'info');
    }
    
    function initializeCSInterface() {
        if (typeof CSInterface !== 'undefined') {
            csInterface = new CSInterface();
            updateStatus('CEP interface ready', 'success');
        } else {
            updateStatus('CEP interface not available', 'error');
        }
    }
    
    function waitForBridge() {
        // Wait for both the bridge function and Redux store to be available
        let bridgeReady = false;
        let reduxReady = false;

        function checkReady() {
            if (bridgeReady && reduxReady) {
                updateStatus('Bodymovin importer ready', 'success');
            }
        }

        // Check for bridge function
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max

        function checkBridge() {
            attempts++;

            if (window.BodymovinImporter && typeof window.BodymovinImporter.convert === 'function') {
                bridgeReady = true;
                updateStatus('Bridge function ready...', 'info');
                checkReady();
                return;
            }

            if (attempts >= maxAttempts) {
                updateStatus('âŒ Bodymovin bridge not available. Check console for errors.', 'error');
                console.error('BodymovinImporter.convert function not found after', maxAttempts, 'attempts');
                return;
            }

            setTimeout(checkBridge, 100);
        }

        // Listen for Redux ready event
        window.addEventListener('redux-ready', function() {
            reduxReady = true;
            updateStatus('Redux store ready...', 'info');
            checkReady();
        });

        checkBridge();
    }
    
    function selectJSONFile() {
        if (!csInterface) {
            updateStatus('CEP interface not available', 'error');
            return;
        }
        
        updateStatus('Opening file dialog...', 'info');
        
        // Use CEP file dialog
        try {
            const result = window.cep.fs.showOpenDialogEx(false, false, 'Select Lottie JSON file', '', ['json']);
            
            if (result && result.data && result.data.length > 0) {
                const filePath = result.data[0];
                loadJSONFile(filePath);
            } else {
                updateStatus('No file selected', 'info');
            }
        } catch (error) {
            console.error('File dialog error:', error);
            updateStatus('Error opening file dialog: ' + error.message, 'error');
        }
    }
    
    function loadJSONFile(filePath) {
        updateStatus('Loading JSON file...', 'info');
        
        try {
            const readResult = window.cep.fs.readFile(filePath);
            
            if (readResult.err === 0) {
                try {
                    lottieData = JSON.parse(readResult.data);
                    selectedFile = filePath;
                    
                    // Validate basic Lottie structure
                    if (validateLottieData(lottieData)) {
                        const fileName = filePath.split(/[\\\/]/).pop();
                        fileInfo.innerHTML = `<strong>Selected:</strong> ${fileName}<br>
                                            <strong>Name:</strong> ${lottieData.nm || 'Untitled'}<br>
                                            <strong>Size:</strong> ${lottieData.w}x${lottieData.h}<br>
                                            <strong>Duration:</strong> ${Math.round((lottieData.op - lottieData.ip) / lottieData.fr * 100) / 100}s`;
                        
                        importBtn.disabled = false;
                        updateStatus('JSON file loaded successfully', 'success');
                    } else {
                        updateStatus('Invalid Lottie JSON format', 'error');
                        resetSelection();
                    }
                } catch (parseError) {
                    console.error('JSON parse error:', parseError);
                    updateStatus('Invalid JSON file: ' + parseError.message, 'error');
                    resetSelection();
                }
            } else {
                updateStatus('Error reading file: ' + readResult.err, 'error');
                resetSelection();
            }
        } catch (error) {
            console.error('File read error:', error);
            updateStatus('Error reading file: ' + error.message, 'error');
            resetSelection();
        }
    }
    
    function validateLottieData(data) {
        // Basic validation for Lottie JSON structure
        return data && 
               typeof data.v === 'string' &&  // version
               typeof data.fr === 'number' &&  // frame rate
               typeof data.ip === 'number' &&  // in point
               typeof data.op === 'number' &&  // out point
               typeof data.w === 'number' &&   // width
               typeof data.h === 'number' &&   // height
               Array.isArray(data.layers);     // layers array
    }
    
    function importToAfterEffects() {
        if (!lottieData || !window.BodymovinImporter) {
            updateStatus('No data to import or bridge not available', 'error');
            return;
        }

        const COST = 100;

        const proceed = () => {
            updateStatus('Importing to After Effects...', 'info');
            importBtn.disabled = true;
            try {
                // Call the bridge function from main.50407a1f.js
                window.BodymovinImporter.convert(
                    lottieData,
                    onImportUpdate,
                    onImportComplete,
                    onImportError
                );
            } catch (error) {
                console.error('Import error:', error);
                updateStatus('Import failed: ' + error.message, 'error');
                importBtn.disabled = false;
            }
        };

        // Credits pre-check (100 credits per import unless membership active)
        // In strict mode, do not proceed unless credits service is present and allows import
        if (!window.PAMMAAuth || typeof window.PAMMAAuth.checkCreditsStatus !== 'function') {
            if (window.PAMA_STRICT_CREDITS) {
                updateStatus('Credits service unavailable. Please open PAMMA Manager and sign in.', 'error');
                return;
            }
            proceed();
            return;
        }

        if (window.PAMMAAuth && typeof window.PAMMAAuth.checkCreditsStatus === 'function') {
            window.PAMMAAuth.checkCreditsStatus()
                .then(async () => {
                    const c = (window.PAMMAAuth.credits || {});
                    const allowed = !!c.membershipActive || ((c.creditsAvailable || 0) >= COST);
                    if (!allowed) {
                        updateStatus('Your credits are depleted. Please top up to continue.', 'error');
                        try { window.PAMMAAuth.login(); } catch (e) {}
                        return;
                    }
                    if (c.membershipActive) {
                        proceed();
                        return;
                    }
                    try {
                        updateStatus('Authorizing credit hold...', 'info');
                        const assetHash = computeAssetHash(lottieData);
                        const idemKey = 'pama-manual-' + assetHash;
                        if (typeof window.PAMMAAuth.authorizeCredits !== 'function') {
                            throw new Error('Manager missing authorizeCredits capability');
                        }
                        const auth = await window.PAMMAAuth.authorizeCredits(COST, 'lottie_import_manual', assetHash, idemKey);
                        if (!auth || !auth.success || !auth.chargeId) {
                            updateStatus('Unable to authorize credits. Please try again.', 'error');
                            return;
                        }
                        currentChargeId = auth.chargeId;
                        proceed();
                    } catch (err) {
                        console.error('Authorization failed:', err);
                        const msg = (err && err.message) ? err.message : 'Authorization failed';
                        updateStatus(msg, 'error');
                    }
                })
                .catch(() => {
                    if (window.PAMA_STRICT_CREDITS) {
                        updateStatus('Credits service unavailable. Please open PAMMA Manager and sign in.', 'error');
                        return;
                    }
                    proceed();
                });
        } else {
            proceed();
        }
    }
    
    function onImportUpdate(progress) {
        // Update progress if needed
        console.log('Import progress:', progress);
    }
    
    function onImportComplete() {
        updateStatus('âœ… Import completed successfully!', 'success');
        importBtn.disabled = false;
        try {
            if (currentChargeId && window.PAMMAAuth && typeof window.PAMMAAuth.cancelCredits === 'function') {
                window.PAMMAAuth.cancelCredits(currentChargeId).catch(() => {});
            }
        } catch (_) {}
        currentChargeId = null;
        try {
            if (currentChargeId && window.PAMMAAuth && typeof window.PAMMAAuth.commitCredits === 'function') {
                window.PAMMAAuth.commitCredits(currentChargeId).catch(() => {});
            }
        } catch (_) {}
        currentChargeId = null;
        
        // Optional: Reset for next import
        setTimeout(function() {
            if (confirm('Import completed! Would you like to import another file?')) {
                resetSelection();
            }
        }, 2000);
    }
    
    function onImportError(error) {
        console.error('Import failed:', error);
        updateStatus('âŒ Import failed: ' + (error.message || error), 'error');
        importBtn.disabled = false;
    }
    
    function resetSelection() {
        selectedFile = null;
        lottieData = null;
        fileInfo.innerHTML = 'No file selected';
        importBtn.disabled = true;
    }
    
    function updateStatus(message, type) {
        status.innerHTML = message;
        status.className = 'status ' + (type || 'info');
        console.log('[Bodymovin Importer]', message);
        // No implicit credit consume/refund here; managed via hold commit/cancel
    }

    // PAMA Integration - Poll for animation imports
    let pamaPollingInterval;

    function startPAMAPolling() {
        if (pamaPollingInterval) return;
        // Do not start polling unless explicitly enabled by the React app
        if (!window.PAMA_ENABLE_QUEUE_POLLING) {
            console.log('PAMA import polling is disabled (PAMA_ENABLE_QUEUE_POLLING=false)');
            return;
        }

        console.log('Starting PAMA import polling...');

        pamaPollingInterval = setInterval(checkPAMAImportQueue, 2000);
    }

    function stopPAMAPolling() {
        if (pamaPollingInterval) {
            clearInterval(pamaPollingInterval);
            pamaPollingInterval = null;
            console.log('PAMA import polling stopped');
        }
    }

    function checkPAMAImportQueue() {
        fetch('http://localhost:8321/import-queue')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.imports && data.imports.length > 0) {
                    console.log('PAMA import requests found:', data.imports.length);

                    // Process each import request
                    data.imports.forEach(importRequest => {
                        if (importRequest.type === 'LOTTIE_IMPORT') {
                            processPAMAImport(importRequest);
                        }
                    });
                }
            })
            .catch(error => {
                console.error('PAMA queue check failed:', error);
            });
    }

    function processPAMAImport(importRequest) {
        console.log('Processing PAMA import:', importRequest.filename);

        // Set the lottie data
        lottieData = importRequest.animationData || importRequest.jsonData;

        // Prefer entitled URL if present (server-validated content)
        var entitledUrl = null;
        try {
            if (importRequest.entitledUrl) {
                entitledUrl = importRequest.entitledUrl;
            } else if (importRequest.entitlement && importRequest.filename) {
                entitledUrl = 'http://localhost:8321/entitled/animation?file='
                    + encodeURIComponent(importRequest.filename)
                    + '&token=' + encodeURIComponent(importRequest.entitlement);
            }
        } catch (e) { /* ignore */ }

        // Client-side credit gate for queued imports
        try {
            const COST = 100;
            if (window.PAMMAAuth) {
                const c = (window.PAMMAAuth.credits || {});
                const allowed = !!c.membershipActive || ((c.creditsAvailable || 0) >= COST);
                if (!allowed) {
                    updateStatus('Your credits are depleted. Please top up to continue.', 'error');
                    try {
                        fetch('http://localhost:8321/import-complete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                timestamp: importRequest.timestamp,
                                success: false,
                                error: 'insufficient_credits'
                            })
                        }).catch(() => {});
                    } catch (_) {}
                    return;
                }
            } else if (window.PAMA_STRICT_CREDITS) {
                updateStatus('Credits service unavailable. Please open PAMMA Manager and sign in.', 'error');
                try {
                    fetch('http://localhost:8321/import-complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            timestamp: importRequest.timestamp,
                            success: false,
                            error: 'credits_service_unavailable'
                        })
                    }).catch(() => {});
                } catch (_) {}
                return;
            }
        } catch (_) {}

        // Require server-side hold for queued imports
        if (!importRequest.chargeId) {
            updateStatus('Cannot import item: missing server hold (chargeId).', 'error');
            try {
                fetch('http://localhost:8321/import-complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        timestamp: importRequest.timestamp,
                        success: false,
                        error: 'missing_chargeId'
                    })
                }).catch(() => {});
            } catch (_) {}
            return;
        }

        // If entitled URL is provided, fetch server-validated JSON first, then import
        if (entitledUrl) {
            updateStatus(`Downloading ${importRequest.filename}...`, 'info');
            fetch(entitledUrl)
                .then(function(resp) { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.json(); })
                .then(function(json) {
                    lottieData = json;
                    // Proceed with import using fetched data
                    if (window.BodymovinImporter && window.BodymovinImporter.convert) {
                        window.BodymovinImporter.convert(
                            lottieData,
                            function onUpdate(progress) {
                                console.log('PAMA import progress:', progress);
                            },
                            function onComplete() {
                                console.log('PAMA import completed successfully');
                                const rawName = importRequest.filename.replace('.json', '');
                                const animationName = rawName.replace(/^\d+_/, '');
                                const successMessage = `${animationName} is imported successfully`;
                                updateStatus(`ï¿½o. ${successMessage}!`, 'success');
                                // Strict: do not locally consume credits here; server must have provided a hold
                                if (!importRequest.chargeId) {
                                    console.error('Missing chargeId for entitled import; refusing to locally charge.');
                                }
                                const systemMessageEvent = new CustomEvent('systemMessage', { detail: { text: successMessage } });
                                window.dispatchEvent(systemMessageEvent);
                                console.log('dYZï¿½ Dispatched system message:', successMessage);
                                fetch('http://localhost:8321/import-complete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        timestamp: importRequest.timestamp,
                                        success: true,
                                        compositionName: lottieData.nm || 'PAMA_Animation',
                                        animationName: animationName,
                                        chargeId: importRequest.chargeId || null
                                    })
                                }).catch(console.error);
                            },
                            function onError(error) {
                                console.error('PAMA import failed:', error);
                                updateStatus(`ï¿½?O Import failed: ${error}`, 'error');
                                fetch('http://localhost:8321/import-complete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        timestamp: importRequest.timestamp,
                                        success: false,
                                        error: error.toString(),
                                        chargeId: importRequest.chargeId || null
                                    })
                                }).catch(console.error);
                            }
                        );
                    } else {
                        console.error('BodymovinImporter not available');
                        updateStatus('ï¿½?O Import system not available', 'error');
                    }
                })
                .catch(function(err) {
                    console.warn('Entitled fetch failed:', err.message);
                    // Fallback: proceed with existing data
                    if (window.BodymovinImporter && window.BodymovinImporter.convert) {
                        window.BodymovinImporter.convert(
                            lottieData,
                            function onUpdate(progress) {
                                console.log('PAMA import progress:', progress);
                            },
                            function onComplete() {
                                console.log('PAMA import completed successfully');
                                const rawName = importRequest.filename.replace('.json', '');
                                const animationName = rawName.replace(/^\d+_/, '');
                                const successMessage = `${animationName} is imported successfully`;
                                updateStatus(`ï¿½o. ${successMessage}!`, 'success');
                                try {
                                    if (!importRequest.chargeId) { console.error('Missing chargeId for queued import; not consuming locally.'); }
                                } catch (_) {}
                                const systemMessageEvent = new CustomEvent('systemMessage', { detail: { text: successMessage } });
                                window.dispatchEvent(systemMessageEvent);
                                console.log('dYZï¿½ Dispatched system message:', successMessage);
                                fetch('http://localhost:8321/import-complete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        timestamp: importRequest.timestamp,
                                        success: true,
                                        compositionName: lottieData.nm || 'PAMA_Animation',
                                        animationName: animationName,
                                        chargeId: importRequest.chargeId || null
                                    })
                                }).catch(console.error);
                            },
                            function onError(error) {
                                console.error('PAMA import failed:', error);
                                updateStatus(`ï¿½?O Import failed: ${error}`, 'error');
                                fetch('http://localhost:8321/import-complete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        timestamp: importRequest.timestamp,
                                        success: false,
                                        error: error.toString(),
                                        chargeId: importRequest.chargeId || null
                                    })
                                }).catch(console.error);
                            }
                        );
                    } else {
                        console.error('BodymovinImporter not available');
                        updateStatus('ï¿½?O Import system not available', 'error');
                    }
                });
            return; // avoid running the fallback path below
        }

        // Update UI to show import in progress
        updateStatus(`Importing ${importRequest.filename} from PAMA...`, 'info');

        // Use the existing BodymovinImporter system
        if (window.BodymovinImporter && window.BodymovinImporter.convert) {
            window.BodymovinImporter.convert(
                lottieData,
                function onUpdate(progress) {
                    console.log('PAMA import progress:', progress);
                },
                function onComplete() {
                    console.log('PAMA import completed successfully');
                    // Clean up animation name: remove .json extension and any leading numbers/underscores
                    const rawName = importRequest.filename.replace('.json', '');
                    const animationName = rawName.replace(/^\d+_/, ''); // Remove leading numbers and underscore
                    const successMessage = `${animationName} is imported successfully`;

                    updateStatus(`âœ… ${successMessage}!`, 'success');

                    // Strict: never locally consume on queued imports; require server-side hold
                    if (!importRequest.chargeId) {
                        console.error('Missing chargeId for queued import; not consuming locally.');
                    }

                    // Dispatch system message for chat interface
                    const systemMessageEvent = new CustomEvent('systemMessage', {
                        detail: { text: successMessage }
                    });
                    window.dispatchEvent(systemMessageEvent);
                    console.log('ðŸŽ¬ Dispatched system message:', successMessage);

                    // Notify server of completion
                    fetch('http://localhost:8321/import-complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            timestamp: importRequest.timestamp,
                            success: true,
                            compositionName: lottieData.nm || 'PAMA_Animation',
                            animationName: animationName,
                            chargeId: importRequest.chargeId || null
                        })
                    }).catch(console.error);
                },
                function onError(error) {
                    console.error('PAMA import failed:', error);
                    updateStatus(`âŒ Import failed: ${error}`, 'error');

                    // Notify server of failure
                    fetch('http://localhost:8321/import-complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            timestamp: importRequest.timestamp,
                            success: false,
                            error: error.toString(),
                            chargeId: importRequest.chargeId || null
                        })
                    }).catch(console.error);
                }
            );
        } else {
            console.error('BodymovinImporter not available');
            updateStatus('âŒ Import system not available', 'error');
        }
    }

    // Start PAMA polling when page loads
    document.addEventListener('DOMContentLoaded', function() {
        // Wait a bit for everything to initialize
        setTimeout(startPAMAPolling, 3000);
    });

    // Stop polling when page unloads
    window.addEventListener('beforeunload', () => {
        stopPAMAPolling();
        try {
            if (currentChargeId && window.PAMMAAuth && typeof window.PAMMAAuth.cancelCredits === 'function') {
                window.PAMMAAuth.cancelCredits(currentChargeId).catch(() => {});
            }
        } catch (_) {}
    });

    // Helper: deterministic asset hash (non-crypto)
    function computeAssetHash(jsonObj) {
        try {
            const json = JSON.stringify(jsonObj);
            let hash = 5381;
            for (let i = 0; i < json.length; i++) {
                hash = ((hash << 5) + hash) + json.charCodeAt(i);
                hash = hash >>> 0;
            }
            return hash.toString(16);
        } catch (e) {
            return String(Date.now());
        }
    }

})();



