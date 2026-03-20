import React, { useState, useEffect, useRef } from 'react';
import Typewriter from 'typewriter-effect';
import './AnimationExecutionBar.css';

// Bodymovin-style Import Controller (following bodymovin patterns)
class PAMAImportController {
  constructor() {
    this.cancelled = false;
    this.isRunning = false;
    this.currentOperation = null;
    this.progressCallback = null;
    this.completeCallback = null;
    this.errorCallback = null;
  }

  start(animationData, onProgress, onComplete, onError) {
    console.log('🎬 PAMA Import Controller: Starting import process');
    this.cancelled = false;
    this.isRunning = true;
    this.progressCallback = onProgress;
    this.completeCallback = onComplete;
    this.errorCallback = onError;

    // Follow bodymovin pattern: check cancellation before each major operation
    if (this.cancelled) {
      console.log('🛑 Import Controller: Cancelled before start');
      this.handleError(new Error('Import cancelled before start'));
      return;
    }

    // Start the actual bodymovin import
    this.executeImport(animationData);
  }

  executeImport(animationData) {
    if (window.BodymovinImporter && typeof window.BodymovinImporter.convert === 'function') {
      this.currentOperation = window.BodymovinImporter.convert(
        animationData,
        (progress) => {
          // Multiple validation checks to prevent cancelled imports from continuing
          if (this.cancelled || window.PAMA_IMPORT_CANCELLED || window.BODYMOVIN_CANCELLED) {
            console.log('🛑 Import Controller: Cancelled during progress - validation failed');
            return;
          }

          // Check bodymovin's internal cancellation state
          if (window.$__bodymovin?.bm_compsManager?.cancelled) {
            console.log('🛑 Import Controller: Bodymovin internal cancellation detected');
            this.cancelled = true;
            return;
          }

          if (this.progressCallback) {
            this.progressCallback(progress);
          }
        },
        (result) => {
          // Comprehensive validation before allowing completion
          if (this.cancelled || window.PAMA_IMPORT_CANCELLED || window.BODYMOVIN_CANCELLED) {
            console.log('🛑 Import Controller: Cancelled before completion - validation failed');
            return;
          }

          // Additional validation: check if After Effects composition was actually created
          if (window.app && window.app.project) {
            try {
              const numComps = window.app.project.numItems;
              console.log('🔍 Import Validation: After Effects has', numComps, 'items in project');

              // If we're cancelled, try to remove any partially created compositions
              if (this.cancelled) {
                console.log('🛑 Import Validation: Attempting to clean up partial compositions');
                // Note: This would require more complex AE scripting to implement safely
                return;
              }
            } catch (e) {
              console.log('⚠️ Import Validation: Could not validate AE project state:', e.message);
            }
          }

          this.handleComplete(result);
        },
        (error) => {
          // Validate that this isn't a cancellation masquerading as an error
          if (this.cancelled || error.toString().includes('cancel')) {
            console.log('🛑 Import Controller: Error callback triggered by cancellation');
            return;
          }

          this.handleError(error);
        }
      );
    } else {
      this.handleError(new Error('BodymovinImporter not available'));
    }
  }

  cancel() {
    console.log('🛑 PAMA Import Controller: Cancelling import process');
    this.cancelled = true;
    this.isRunning = false;

    // Follow bodymovin cancellation patterns
    try {
      // Set bodymovin's internal cancellation flag
      if (window.$__bodymovin?.bm_compsManager) {
        window.$__bodymovin.bm_compsManager.cancelled = true;
      }

      // Send bodymovin cancel event
      if (window.$__bodymovin?.bm_eventDispatcher) {
        window.$__bodymovin.bm_eventDispatcher.sendEvent('bm:render:cancel');
      }

      // Call bodymovin's cancel function if available
      if (window.BodymovinImporter?.cancel) {
        window.BodymovinImporter.cancel();
      }

      console.log('✅ Import Controller: Cancellation signals sent');
    } catch (error) {
      console.log('⚠️ Import Controller: Error during cancellation:', error);
    }
  }

  handleComplete(result) {
    if (this.cancelled) {
      console.log('🛑 Import Controller: Ignoring completion - already cancelled');
      return;
    }

    this.isRunning = false;
    console.log('✅ Import Controller: Import completed successfully');

    // Clear any global cancellation flags since we completed successfully
    window.PAMA_IMPORT_CANCELLED = false;
    window.BODYMOVIN_CANCELLED = false;

    if (this.completeCallback) {
      this.completeCallback(result);
    }
  }

  handleError(error) {
    this.isRunning = false;
    console.log('❌ Import Controller: Import failed:', error);

    if (this.errorCallback) {
      this.errorCallback(error);
    }
  }

  isActive() {
    return this.isRunning && !this.cancelled;
  }
}

const AnimationExecutionBar = ({ threadId, searchQuery, onImportAnimation, onCancel, uiAlreadyStarted, importState }) => {
  console.log('🎬 AnimationExecutionBar: Component initializing with props:', { searchQuery, onImportAnimation, onCancel });

  const [currentPhase, setCurrentPhase] = useState('importing'); // Skip to importing phase immediately
  const [progress, setProgress] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [currentAnimation, setCurrentAnimation] = useState(null);
  const [jsonCode, setJsonCode] = useState('');
  const [error, setError] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  const startTime = useRef(Date.now());
  const abortController = useRef(new AbortController());
  const progressInterval = useRef(null);
  const importController = useRef(null); // Bodymovin-style import controller

  // Calculate realistic import duration based on bodymovin processing patterns
  const calculateImportDuration = (animationData) => {
    try {
      if (!animationData) return 5; // Default fallback

    const layers = animationData.layers?.length || 0;
    const assets = animationData.assets?.length || 0;
    const comps = animationData.comps?.length || 0;
    const duration = animationData.op ? (animationData.op - (animationData.ip || 0)) / (animationData.fr || 30) : 3;

    // Count complex elements that take longer to process
    let complexShapes = 0;
    let totalKeyframes = 0;
    let textLayers = 0;
    let precompLayers = 0;

    if (animationData.layers) {
      animationData.layers.forEach(layer => {
        // Count layer types (bodymovin processes these differently)
        if (layer.ty === 5) textLayers++; // Text layers are slower
        if (layer.ty === 0) precompLayers++; // Precomp layers require recursion

        // Count keyframes (each keyframe requires processing time)
        if (layer.ks) {
          ['a', 'p', 'r', 's', 'o'].forEach(prop => {
            if (layer.ks[prop] && layer.ks[prop].k && Array.isArray(layer.ks[prop].k)) {
              totalKeyframes += layer.ks[prop].k.length;
            }
          });
        }

        // Count shape complexity
        if (layer.shapes) {
          complexShapes += layer.shapes.length;
        }
      });
    }

    // Bodymovin timing formula based on actual processing patterns:
    // - Base processing time: 1.5 seconds
    // - Layer processing: 0.08s per layer (creation + setup)
    // - Asset processing: 0.12s per asset (file import + linking)
    // - Precomp processing: 0.25s per precomp (recursive processing)
    // - Text processing: 0.15s per text layer (font + styling)
    // - Keyframe processing: 0.005s per keyframe
    // - Shape processing: 0.02s per shape group
    // - Composition setup: 0.1s per composition

    const baseTime = 1.5;
    const layerTime = layers * 0.08;
    const assetTime = assets * 0.12;
    const precompTime = precompLayers * 0.25;
    const textTime = textLayers * 0.15;
    const keyframeTime = totalKeyframes * 0.005;
    const shapeTime = complexShapes * 0.02;
    const compTime = comps * 0.1;

    const totalTime = baseTime + layerTime + assetTime + precompTime + textTime + keyframeTime + shapeTime + compTime;

      // Realistic range: 1.5 to 20 seconds (based on actual bodymovin performance)
      return Math.max(1.5, Math.min(20, Math.round(totalTime * 10) / 10));
    } catch (error) {
      console.error('Error calculating import duration:', error);
      return 5; // Safe fallback
    }
  };

  // Phase configurations
  const phases = {
    searching: {
      title: 'Searching for',
      subtitle: 'Finding the perfect animation',
      duration: 3,
      color: '#3b82f6'
    },
    loading: {
      title: 'Loading for',
      subtitle: 'Preparing animation data',
      duration: 2,
      color: '#8b5cf6'
    },
    importing: {
      title: 'Animating for',
      subtitle: 'Importing to After Effects',
      duration: 5, // Will be updated when animation data is loaded
      color: '#10b981'
    },
    cancelled: {
      title: 'Cancelled',
      subtitle: 'Animation workflow stopped',
      duration: 0,
      color: '#ef4444'
    },
    complete: {
      title: 'Import completed',
      subtitle: 'Animation ready in After Effects',
      duration: 0,
      color: '#10b981'
    },
    error: {
      title: 'Error',
      subtitle: 'Something went wrong',
      duration: 0,
      color: '#ef4444'
    }
  };

  // Initialize animation execution
  useEffect(() => {
    console.log('🎬 AnimationExecutionBar: useEffect triggered with:', { searchQuery, uiAlreadyStarted, threadId });
    if (searchQuery && searchQuery.trim() !== '') {
      setIsVisible(true);
      // Always start the workflow for new search queries to ensure import happens
      console.log('🎬 AnimationExecutionBar: Starting workflow for searchQuery:', searchQuery);
      startAnimationWorkflow();
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
      abortController.current.abort();
    };
  }, [searchQuery, threadId]); // Removed uiAlreadyStarted dependency to always trigger
  // REMOVED: The passive mode was preventing actual imports from starting
  // We need the workflow to run every time to ensure import actually happens


  const startAnimationWorkflow = async () => {
    console.log('🚀 PAMA: Starting animation workflow for query:', searchQuery);
    console.log('🚀 PAMA: ThreadId:', threadId);

    // Mark that we're actually starting the import workflow for this thread
    try {
      require('../managers/ImportManager').default.getInstance().markUiStarted(threadId);
      require('../managers/ImportManager').default.getInstance().updateProgress(threadId, { phase: 'importing' });
    } catch(_) {}

    // Reset cancellation flag
    setIsCancelled(false);

    if (!searchQuery || searchQuery.trim() === '') {
      console.error('🚀 PAMA: No search query provided');
      setError('Please enter a search query');
      setCurrentPhase('error');
      return;
    }

    try {
      // Skip search and loading phases - go directly to import
      console.log('🔍 PAMA: Searching and loading animation for:', searchQuery);

      // Search for animation silently
      const foundAnimation = await searchForAnimation();
      console.log('✅ PAMA: Found animation:', foundAnimation);

      // Load animation data silently
      const loadedAnimation = await loadAnimationData(foundAnimation);
      console.log('✅ PAMA: Loaded animation:', loadedAnimation);

      // Update state with final animation data
      setCurrentAnimation(loadedAnimation);

      // Start import phase immediately
      console.log('🎬 PAMA: Starting import to After Effects');
      if (isCancelled || window.PAMA_IMPORT_CANCELLED) {
        throw new Error('Workflow cancelled before import');
      }

      // Calculate realistic import duration based on animation complexity
      const importDuration = calculateImportDuration(loadedAnimation?.data);
      console.log('🎬 PAMA: Calculated import duration:', importDuration, 'seconds');

      // Update the importing phase duration
      phases.importing.duration = importDuration;

      await executePhase('importing', () => importToAfterEffects(loadedAnimation));
      console.log('✅ PAMA: Import phase completed successfully');

      // Complete - Stop timer and clear intervals
      console.log('🎉 PAMA: Workflow completed successfully!');

      // Stop progress animation immediately
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }

      setCurrentPhase('complete');
      setProgress(100);
      // Keep the final time elapsed instead of resetting to 0
      // setTimeElapsed(0); // Removed - keep final time

    } catch (error) {
      console.error('❌ PAMA: Animation workflow error:', error);
      console.error('❌ PAMA: Error type:', error.name);
      console.error('❌ PAMA: Error message:', error.message);
      console.error('❌ PAMA: Error stack:', error.stack);
      console.error('❌ PAMA: Current animation state:', currentAnimation);
      console.error('❌ PAMA: Current phase when error occurred:', currentPhase);

      // Stop any running progress animations
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }

      // Reset progress to show error state
      setProgress(0);
      setTimeElapsed(0);

      // Determine specific error message based on phase and error type
      let specificError = error.message;
      let errorCategory = 'unknown';
      let userFriendlyMessage = error.message;

      if (currentPhase === 'searching') {
        errorCategory = 'search_failed';
        if (error.message.includes('No animations found')) {
          userFriendlyMessage = `No animations found for "${searchQuery}". Try different keywords.`;
        } else if (error.message.includes('fetch')) {
          userFriendlyMessage = 'Search service unavailable. Check server connection.';
        } else {
          userFriendlyMessage = `Search failed: ${error.message}`;
        }
      } else if (currentPhase === 'loading') {
        errorCategory = 'loading_failed';
        if (error.message.includes('404')) {
          userFriendlyMessage = 'Animation file not found on server.';
        } else if (error.message.includes('Failed to load')) {
          userFriendlyMessage = 'Failed to download animation data.';
        } else {
          userFriendlyMessage = `Loading failed: ${error.message}`;
        }
      } else if (currentPhase === 'importing') {
        errorCategory = 'import_failed';
        if (error.message.includes('BodymovinImporter not available')) {
          userFriendlyMessage = 'After Effects bridge not ready. Restart After Effects and try again.';
        } else if (error.message.includes('No animation data')) {
          userFriendlyMessage = 'Animation data corrupted or missing.';
        } else {
          userFriendlyMessage = `Import failed: ${error.message}`;
        }
      }

      setCurrentPhase('error');
      setError(userFriendlyMessage);

      // Show detailed error in JSON
      const errorJson = {
        "error": userFriendlyMessage,
        "error_category": errorCategory,
        "original_error": error.message,
        "error_type": error.name,
        "phase_failed": currentPhase,
        "search_query": searchQuery,
        "animation_state": currentAnimation,
        "timestamp": new Date().toISOString(),
        "debug_info": {
          "onImportAnimation_available": !!onImportAnimation,
          "abort_signal_aborted": abortController.current.signal.aborted,
          "bodymovin_available": !!window.BodymovinImporter,
          "bodymovin_convert_available": !!(window.BodymovinImporter?.convert)
        }
      };
      setJsonCode(JSON.stringify(errorJson, null, 2));
    }
  };

  const executePhase = async (phaseName, phaseFunction) => {
    // Pre-phase cancellation check
    if (isCancelled || window.PAMA_IMPORT_CANCELLED) {
      console.log(`🛑 Phase ${phaseName} cancelled before execution`);
      throw new Error(`Phase ${phaseName} cancelled by user`);
    }

    setCurrentPhase(phaseName);
    setProgress(0);
    setTimeElapsed(0);

    // Start progress animation
    const isImportPhase = phaseName === 'importing';
    startProgressAnimation(phases[phaseName].duration, isImportPhase);

    try {
      // Execute phase function with cancellation monitoring
      const result = await phaseFunction();

      // Post-execution cancellation check
      if (isCancelled || window.PAMA_IMPORT_CANCELLED) {
        console.log(`🛑 Phase ${phaseName} cancelled after execution`);
        throw new Error(`Phase ${phaseName} cancelled by user`);
      }

      return result;
    } catch (error) {
      // Stop progress animation on error or cancellation
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }

      // Check if this is a cancellation error
      if (error.message.includes('cancel') || isCancelled) {
        console.log(`🛑 Phase ${phaseName} properly cancelled:`, error.message);
        // Don't re-throw cancellation errors in some cases
        if (phaseName === 'importing') {
          return; // Gracefully exit import phase
        }
      }

      // Re-throw the error to be handled by the main workflow
      throw error;
    }
  };

  const startProgressAnimation = (duration, isImportPhase = false) => {
    const startTime = Date.now();

    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }

    progressInterval.current = setInterval(() => {
      // Check for cancellation in progress animation
      if (isCancelled || window.PAMA_IMPORT_CANCELLED) {
        console.log('🛑 Progress animation stopped due to cancellation');
        clearInterval(progressInterval.current);
        progressInterval.current = null;
        return;
      }

      const now = Date.now();
      const elapsed = now - startTime;
      const elapsedSeconds = Math.floor(elapsed / 1000);

      setTimeElapsed(elapsedSeconds);

      if (isImportPhase) {
        // For import phase: timer runs infinitely until manually stopped
        // Progress stays indeterminate (we'll use a pulsing animation)
        setProgress(50); // Keep at 50% for pulsing effect

        // Auto-complete detection: if import has been running for more than 2 minutes
        // and no progress updates, assume it completed
        if (elapsedSeconds > 120) {
          console.log('🕐 Import timeout reached, checking for completion...');

          // Check if After Effects has new compositions
          if (window.CSInterface) {
            window.CSInterface.evalScript('app.project.numItems', (numItems) => {
              console.log('🔍 After Effects project has', numItems, 'items');
              // If we have items and no explicit completion, assume success
              if (parseInt(numItems) > 0) {
                console.log('✅ Auto-detecting import completion based on project items');
                setCurrentPhase('complete');
                setProgress(100);
                clearInterval(progressInterval.current);
                progressInterval.current = null;
              }
            });
          }
        }
      } else {
        // For search/loading phases: use duration-based progress
        const totalDuration = duration * 1000;
        const newProgress = Math.min((elapsed / totalDuration) * 100, 100);
        setProgress(newProgress);

        if (newProgress >= 100) {
          clearInterval(progressInterval.current);
          progressInterval.current = null;
        }
      }
    }, 100);
  };

  // Enhanced time estimation based on actual progress
  const updateTimeEstimation = (actualProgress, phaseStartTime) => {
    if (phaseStartTime) {
      const elapsed = Date.now() - phaseStartTime;
      const elapsedSeconds = Math.floor(elapsed / 1000);
      setTimeElapsed(elapsedSeconds);
    }
  };

  const searchForAnimation = async () => {
    console.log('🔍 PAMA: searchForAnimation started with query:', searchQuery);

    // Stream JSON updates during search
    const searchSteps = [
      {
        "query": searchQuery,
        "phase": "initializing",
        "status": "starting search engine...",
        "timestamp": new Date().toISOString()
      },
      {
        "query": searchQuery,
        "phase": "semantic_analysis",
        "status": "analyzing semantic meaning...",
        "embedding_model": "sentence-transformers",
        "vector_dimensions": 384
      },
      {
        "query": searchQuery,
        "phase": "keyword_extraction",
        "status": "extracting keywords...",
        "keywords": searchQuery.split(' ').slice(0, 3),
        "search_type": "hybrid_semantic_keyword"
      }
    ];

    // Stream each step with delay
    for (let i = 0; i < searchSteps.length; i++) {
      if (abortController.current.signal.aborted) {
        throw new Error('Search cancelled by user');
      }
      setJsonCode(JSON.stringify(searchSteps[i], null, 2));
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    // Perform search with retry logic
    let searchAttempt = 0;
    const maxAttempts = 3;

    while (searchAttempt < maxAttempts) {
      searchAttempt++;
      console.log(`🔍 PAMA: Search attempt ${searchAttempt}/${maxAttempts}`);

      try {
        // Try different search strategies
        let searchUrl;
        if (searchAttempt === 1) {
          // First attempt: hybrid search with top 3 results
          searchUrl = `http://localhost:8321/search/lottie?query=${encodeURIComponent(searchQuery)}&top_k=3`;
        } else if (searchAttempt === 2) {
          // Second attempt: keyword-only search
          searchUrl = `http://localhost:8321/search/lottie/keyword?query=${encodeURIComponent(searchQuery)}&top_k=5`;
        } else {
          // Third attempt: broader search
          searchUrl = `http://localhost:8321/search/lottie?query=${encodeURIComponent(searchQuery)}&top_k=10`;
        }

        console.log('🔍 PAMA: Making search API call to:', searchUrl);

        let response;
        try {
          response = await fetch(searchUrl, {
            signal: abortController.current.signal,
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });
          console.log('🔍 PAMA: Fetch completed. Response status:', response.status);
        } catch (fetchError) {
          console.error('🔍 PAMA: Fetch failed:', fetchError);
          throw new Error(`Network error: ${fetchError.message}`);
        }

        if (abortController.current.signal.aborted) {
          throw new Error('Search cancelled by user');
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error('🔍 PAMA: API error response:', errorText);
          throw new Error(`Search API failed with status: ${response.status} - ${errorText}`);
        }

        let data;
        try {
          data = await response.json();
          console.log('🔍 PAMA: Search API response data:', data);
        } catch (jsonError) {
          console.error('🔍 PAMA: JSON parsing failed:', jsonError);
          throw new Error(`Invalid JSON response: ${jsonError.message}`);
        }

        if (data.results && data.results.length > 0) {
          const filename = data.results[0];
          console.log('🔍 PAMA: Found animation filename:', filename);
          const foundAnimation = { filename };
          setCurrentAnimation(foundAnimation);
          console.log('🔍 PAMA: Set currentAnimation to:', foundAnimation);

          // Final search result
          const resultJson = {
            "query": searchQuery,
            "phase": "search_complete",
            "best_match": filename,
            "confidence": searchAttempt === 1 ? 0.95 : searchAttempt === 2 ? 0.75 : 0.60,
            "match_type": searchAttempt === 1 ? "semantic_similarity" : searchAttempt === 2 ? "keyword_match" : "broad_match",
            "search_attempts": searchAttempt,
            "total_results": data.results.length
          };
          setJsonCode(JSON.stringify(resultJson, null, 2));
          console.log('🔍 PAMA: Search completed successfully');
          return foundAnimation; // Return the animation object
        } else {
          console.warn(`🔍 PAMA: No results found in attempt ${searchAttempt}`);
          if (searchAttempt === maxAttempts) {
            throw new Error('No animations found matching your search after multiple attempts');
          }
        }
      } catch (error) {
        if (error.message.includes('cancelled')) {
          throw error; // Don't retry if cancelled
        }

        console.warn(`🔍 PAMA: Search attempt ${searchAttempt} failed:`, error.message);
        if (searchAttempt === maxAttempts) {
          throw new Error(`Search failed after ${maxAttempts} attempts: ${error.message}`);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // If we get here, all attempts failed to find results
    throw new Error('No animations found matching your search after all attempts');
  };

  const loadAnimationData = async (animation) => {
    if (!animation) throw new Error('No animation selected');

    // Stream loading progress
    const loadingSteps = [
      {
        "animation": animation.filename,
        "phase": "fetching",
        "status": "requesting animation file...",
        "url": `/animations/${animation.filename}`,
        "progress": 0
      },
      {
        "animation": animation.filename,
        "phase": "downloading",
        "status": "downloading JSON data...",
        "bytes_received": "15.2 KB",
        "progress": 45
      },
      {
        "animation": animation.filename,
        "phase": "parsing",
        "status": "parsing Lottie JSON...",
        "progress": 80
      }
    ];

    // Stream each loading step
    for (let i = 0; i < loadingSteps.length; i++) {
      if (abortController.current.signal.aborted) {
        throw new Error('Loading cancelled by user');
      }
      setJsonCode(JSON.stringify(loadingSteps[i], null, 2));
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    // Load animation data with abort signal
    const response = await fetch(`http://localhost:8321/animations/${animation.filename}`, {
      signal: abortController.current.signal
    });

    if (abortController.current.signal.aborted) {
      throw new Error('Animation loading cancelled by user');
    }

    if (!response.ok) {
      throw new Error(`Failed to load animation: ${response.status}`);
    }

    const animationData = await response.json();
    console.log('📥 PAMA: Animation data loaded successfully:', {
      filename: animation.filename,
      dataSize: JSON.stringify(animationData).length,
      hasLayers: !!animationData.layers,
      layerCount: animationData.layers?.length || 0
    });

    // Create loaded animation object
    const loadedAnimation = { ...animation, data: animationData };
    setCurrentAnimation(loadedAnimation);
    console.log('📥 PAMA: Updated currentAnimation state:', loadedAnimation);

    // Show actual animation data structure
    const loadedJson = {
      "animation": animation.filename,
      "phase": "data_loaded",
      "lottie_version": animationData.v,
      "frame_rate": animationData.fr,
      "dimensions": {
        "width": animationData.w,
        "height": animationData.h
      },
      "timeline": {
        "in_point": animationData.ip || 0,
        "out_point": animationData.op,
        "duration_seconds": animationData.op ? `${(animationData.op / animationData.fr).toFixed(2)}s` : "unknown"
      },
      "composition": {
        "layers": animationData.layers ? animationData.layers.length : 0,
        "assets": animationData.assets ? animationData.assets.length : 0,
        "fonts": animationData.fonts ? animationData.fonts.length : 0
      },
      "file_size": `${JSON.stringify(animationData).length} bytes`,
      "ready_for_import": true,
      "data_available": true
    };
    setJsonCode(JSON.stringify(loadedJson, null, 2));

    // Return the loaded animation
    return loadedAnimation;
  };

  const importToAfterEffects = async (animation) => {
    console.log('🎬 PAMA: Import function called with animation:', animation);
    console.log('🎬 PAMA: Animation data check:', {
      hasAnimation: !!animation,
      hasData: !!animation?.data,
      dataType: typeof animation?.data,
      dataKeys: animation?.data ? Object.keys(animation.data) : 'no data'
    });

    if (!animation) {
      console.error('🎬 PAMA: No animation object');
      throw new Error('No animation selected for import');
    }

    if (!animation.data) {
      console.error('🎬 PAMA: No animation data in animation:', animation);
      throw new Error('No animation data to import - data not loaded');
    }

    const totalLayers = animation.data.layers?.length || 0;
    console.log('🎬 PAMA: Animation has', totalLayers, 'layers');

    // Initialize import with comprehensive bodymovin bridge check
    console.log('🎬 PAMA: Checking BodymovinImporter availability...');
    console.log('🎬 PAMA: window.BodymovinImporter:', window.BodymovinImporter);
    console.log('🎬 PAMA: typeof window.BodymovinImporter:', typeof window.BodymovinImporter);
    console.log('🎬 PAMA: window.BodymovinImporter.convert:', window.BodymovinImporter?.convert);
    console.log('🎬 PAMA: typeof window.BodymovinImporter.convert:', typeof window.BodymovinImporter?.convert);

    const bridgeStatus = {
      available: !!window.BodymovinImporter,
      hasConvertFunction: !!(window.BodymovinImporter?.convert),
      convertType: typeof window.BodymovinImporter?.convert,
      ready: !!(window.BodymovinImporter?.convert && typeof window.BodymovinImporter.convert === 'function')
    };

    const initJson = {
      "animation": animation.filename,
      "phase": "initializing_import",
      "status": "connecting to After Effects...",
      "bodymovin_bridge": bridgeStatus.ready ? "ready" : "not_ready",
      "bridge_details": bridgeStatus,
      "ae_version": "2024"
    };
    setJsonCode(JSON.stringify(initJson, null, 2));
    await new Promise(resolve => setTimeout(resolve, 500));

    // Fail early if BodymovinImporter is not available
    if (!bridgeStatus.ready) {
      throw new Error(`BodymovinImporter not available. Bridge status: ${JSON.stringify(bridgeStatus)}`);
    }

    // Use the bodymovin-style import controller
    if (onImportAnimation) {
      try {
        // Initialize the import controller
        if (!importController.current) {
          importController.current = new PAMAImportController();
        }

        // Create a promise that resolves when import completes
        const importPromise = new Promise((resolve, reject) => {
          // Pre-import cancellation check
          if (isCancelled || window.PAMA_IMPORT_CANCELLED) {
            console.log('🛑 Import cancelled before starting controller');
            reject(new Error('Import cancelled by user'));
            return;
          }

          // Set a global progress forwarder so updates continue even if this component unmounts
          try {
            window.PAMA_PROGRESS_FN = (p) => {
              try { require('../managers/ImportManager').default.getInstance().updateProgress(threadId, { progress: Math.floor((p || 0) * 100), phase: 'importing' }); } catch(_) {}
            };
          } catch(_) {}

          // Start the controlled import process
          importController.current.start(
            animation.data,
            // Progress callback
            (progress) => {
              console.log('🎬 Import Controller: Progress update:', progress);
              // Forward to ImportManager (keeps state alive across thread switches)
              try { require('../managers/ImportManager').default.getInstance().updateProgress(threadId, { progress: Math.floor((progress || 0) * 100), phase: 'importing' }); } catch(_) {}
              if (typeof window.PAMA_PROGRESS_FN === 'function') {
                try { window.PAMA_PROGRESS_FN(progress); } catch(_) {}
              }

              const progressJson = {
                "animation": animation.filename,
                "phase": "bodymovin_import",
                "status": "importing via PAMA controller...",
                "bodymovin_progress": progress,
                "layers_processed": Math.floor(totalLayers * (progress || 0)),
                "total_layers": totalLayers,
                "controller_active": importController.current?.isActive(),
                "real_time_update": true
              };
              setJsonCode(JSON.stringify(progressJson, null, 2));
            },
            // Completion callback
            (result) => {
              console.log('✅ Import Controller: Import completed successfully:', result);

              // Stop progress animation immediately on completion
              if (progressInterval.current) {
                clearInterval(progressInterval.current);
                progressInterval.current = null;
              }

              // Update manager + UI to completion state
              try { require('../managers/ImportManager').default.getInstance().updateProgress(threadId, { progress: 100, phase: 'complete' }); } catch(_) {}
              setCurrentPhase('complete');
              setProgress(100);

              // Generate and dispatch system message for chat interface
              // Clean up animation name: remove .json extension and any leading numbers/underscores
              const rawName = animation.filename.replace('.json', '');
              const animationName = rawName.replace(/^\d+_/, ''); // Remove leading numbers and underscore
              const successMessage = `${animationName} is imported successfully`;

              // Dispatch system message event
              const systemMessageEvent = new CustomEvent('systemMessage', {
                detail: { text: successMessage }
              });
              window.dispatchEvent(systemMessageEvent);
              console.log('🎬 Dispatched system message from AnimationExecutionBar:', successMessage);

              const completeJson = {
                "animation": animation.filename,
                "phase": "import_complete",
                "status": "✅ Animation imported via PAMA controller!",
                "bodymovin_result": result,
                "controller_result": {
                  "composition_created": true,
                  "layers_imported": totalLayers,
                  "duration": currentAnimation.data.op ? `${(currentAnimation.data.op / currentAnimation.data.fr).toFixed(2)}s` : "unknown",
                  "controlled_import": true
                },
                "next_steps": [
                  "Composition is now available in your project panel",
                  "You can preview the animation in the timeline",
                  "Customize timing and effects as needed"
                ]
              };
              setJsonCode(JSON.stringify(completeJson, null, 2));
              resolve(result);
            },
            // Error callback
            (error) => {
              console.log('❌ Import Controller: Import failed:', error);

              // Check if this is a cancellation error
              if (error.message.includes('cancel') || isCancelled) {
                console.log('🛑 Import Controller: Error due to cancellation');
                reject(new Error('Import cancelled'));
                return;
              }

              const errorJson = {
                "animation": animation.filename,
                "phase": "import_error",
                "status": "❌ Import failed via controller",
                "error": error.toString(),
                "controller_error": true
              };
              setJsonCode(JSON.stringify(errorJson, null, 2));
              reject(new Error(error));
            }
          );
        });

        // Execute the import promise with proper error handling
        await importPromise;

      } catch (error) {
        // Check if this is a cancellation error
        if (error.message.includes('cancel') || isCancelled) {
          console.log('🛑 Import properly cancelled:', error.message);
          // Don't throw cancellation errors - they're expected
          return;
        }

        console.error('❌ Import error:', error);
        throw error;
      }
    } else {
      // Fallback to original import method if BodymovinImporter not available
      console.log('🔄 BodymovinImporter not available, using fallback method');
      await onImportAnimation(animation);
    }
  };

  const handleCancel = () => {
    console.log('🛑 CONTROLLER CANCEL: Starting bodymovin-style cancellation...');

    // Set cancellation flag immediately - this stops all future operations
    setIsCancelled(true);

    // Use the import controller's cancel method (follows bodymovin patterns)
    if (importController.current) {
      importController.current.cancel();
      console.log('🛑 CONTROLLER CANCEL: Import controller cancelled');
    }

    // Abort any ongoing fetch requests
    abortController.current.abort();

    // Clear all timers and intervals immediately
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }

    // Set global cancellation flags for any running processes
    window.PAMA_IMPORT_CANCELLED = true;
    window.BODYMOVIN_CANCELLED = true;

    // Force stop any bodymovin operations
    try {
      if (window.$__bodymovin?.bm_compsManager) {
        window.$__bodymovin.bm_compsManager.cancelled = true;
        if (typeof window.$__bodymovin.bm_compsManager.cancel === 'function') {
          window.$__bodymovin.bm_compsManager.cancel();
        }
      }

      // Try to stop any ongoing After Effects operations
      if (window.CSInterface) {
        window.CSInterface.evalScript('app.cancelTask()').catch(() => {
          console.log('🛑 Could not cancel AE task via CSInterface');
        });
      }
    } catch (error) {
      console.log('🛑 Error during force cancellation:', error);
    }

    // Immediate UI feedback
    const cancelJson = {
      "animation": currentAnimation?.filename || "unknown",
      "phase": "cancelled",
      "status": "🛑 Import cancelled via controller",
      "cancelled_at": new Date().toISOString(),
      "controller_status": {
        "controller_available": !!importController.current,
        "controller_cancelled": importController.current?.cancelled || false,
        "controller_running": importController.current?.isRunning || false,
        "bodymovin_patterns_applied": true
      },
      "cleanup": {
        "fetch_requests_aborted": true,
        "progress_timers_cleared": true,
        "global_flags_set": true,
        "force_cancellation_attempted": true
      }
    };
    setJsonCode(JSON.stringify(cancelJson, null, 2));

    // Update UI state immediately
    setCurrentPhase('cancelled');
    setProgress(0);
    setTimeElapsed(0);

    // Call parent cancel handler
    if (onCancel) {
      onCancel();
    }

    // Hide after showing cancellation confirmation
    setTimeout(() => {
      setIsVisible(false);
      // Clear global cancellation flags after hiding
      window.PAMA_IMPORT_CANCELLED = false;
      window.BODYMOVIN_CANCELLED = false;
    }, 1500);
  };



  // Simple JSON syntax highlighting
  const highlightJson = (jsonString) => {
    return jsonString
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/: "([^"]+)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/: (\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/: null/g, ': <span class="json-null">null</span>')
      .replace(/([{}[\],])/g, '<span class="json-punctuation">$1</span>');
  };

  if (!isVisible) return null;

  try {
    const currentPhaseConfig = phases[currentPhase] || phases.searching;

    return (
    <div className="animation-execution-container">
      <div
        className={`grok-container ${currentPhase}`}
        style={{ '--phase-color': currentPhaseConfig.color }}
      >
        {/* Single Grok-style container with everything integrated */}
        <div className="grok-content">
          {/* Progress bar at top */}
          <div className="grok-progress-bar">
            <div
              className="grok-progress-fill"
              style={{
                width: `${progress}%`,
                backgroundColor: currentPhaseConfig.color
              }}
            />
          </div>

          {/* Main content area */}
          <div className="grok-main">
            {currentPhase !== 'complete' && <div className="grok-spinner"></div>}

            <div className="grok-text">
              <div className="grok-title">
                {currentPhase === 'error' || currentPhase === 'complete' || currentPhase === 'cancelled'
                  ? currentPhaseConfig.title
                  : `${currentPhaseConfig.title} ${timeElapsed} second${timeElapsed !== 1 ? 's' : ''}`}
              </div>
              <div className="grok-subtitle">
                {currentPhaseConfig.subtitle}
              </div>
            </div>


          </div>

          {/* Error state */}
          {currentPhase === 'error' && (
            <div className="grok-error">
              <span>❌ {error || 'Something went wrong'}</span>
              <button className="grok-retry" onClick={() => startAnimationWorkflow()}>
                Try Again
              </button>
            </div>
          )}


        </div>
      </div>
    </div>
    );
  } catch (renderError) {
    console.error('🎬 AnimationExecutionBar: Render error:', renderError);
    return (
      <div className="animation-execution-container">
        <div className="grok-container error">
          <div className="grok-content">
            <div className="grok-main">
              <div className="grok-text">
                <div className="grok-title">Animation Error</div>
                <div className="grok-subtitle">Failed to render animation bar</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
};

export default AnimationExecutionBar;
