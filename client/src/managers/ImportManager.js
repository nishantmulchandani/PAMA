/**
 * ImportManager - Global manager for animation import operations
 * Handles thread-agnostic import state and UI restoration
 * Based on industry-standard chat application patterns with persistent state
 */

class ImportManager {
  constructor() {
    this.activeImports = new Map(); // threadId -> importState
    this.listeners = new Set();
    this.completionCallbacks = new Map(); // threadId -> callback
    this.storageKey = 'pama_active_imports';

    // Start fresh - don't restore any previous import state
    // This ensures no import bars appear when PAMA restarts
    console.log('🎬 ImportManager: Starting fresh - no import state restoration');

    // Set up periodic state persistence (but only for truly active imports)
    this.setupStatePersistence();
  }

  // Singleton pattern
  static getInstance() {
    if (!ImportManager.instance) {
      ImportManager.instance = new ImportManager();
    }
    return ImportManager.instance;
  }

  /**
   * Start an import operation for a specific thread
   */
  startImport(threadId, searchQuery, onComplete) {
    try {
      // Check if there's already an active import for this thread
      const existingState = this.activeImports.get(threadId);
      if (existingState && existingState.status === 'active') {
        console.log('🎬 ImportManager: Import already active for thread', threadId);
        if (onComplete) {
          this.completionCallbacks.set(threadId, onComplete);
        }
        return;
      }

      const importState = {
        threadId,
        searchQuery,
        status: 'active',
        startTime: Date.now(),
        progress: 0,
        phase: 'searching',
        uiStarted: false,
        startedInCurrentSession: true, // Mark as started in this session
        persistentId: `import_${threadId}_${Date.now()}` // Unique ID for tracking
      };

      this.activeImports.set(threadId, importState);
      if (onComplete) {
        this.completionCallbacks.set(threadId, onComplete);
      }

      // Persist state immediately
      this.persistState();
      this.notifyListeners();
      console.log('🎬 ImportManager: Started import for thread', threadId, 'query:', searchQuery);
    } catch (error) {
      console.error('🎬 ImportManager: Error starting import:', error);
      // Dispatch error event
      window.dispatchEvent(new CustomEvent('systemMessage', {
        detail: { text: 'Error starting import: ' + error.message }
      }));
    }
  }

  /**
   * Complete an import operation
   */
  completeImport(threadId, result) {
    const importState = this.activeImports.get(threadId);
    if (!importState) return;

    // Call completion callback if exists
    const callback = this.completionCallbacks.get(threadId);
    if (callback) {
      try { callback(result); } catch (e) { console.warn('Import completion callback error:', e); }
      this.completionCallbacks.delete(threadId);
    }

    // Immediately remove the import state to hide progress bar
    // This ensures the progress bar disappears and won't be restored on restart
    this.activeImports.delete(threadId);
    this.persistState(); // Persist removal immediately
    this.notifyListeners();
    console.log('🎬 ImportManager: Completed and cleaned up import for thread', threadId);
  }

  /**
   * Update progress/phase for an active import
   */
  updateProgress(threadId, { progress, phase }) {
    const s = this.activeImports.get(threadId);
    if (!s) return;
    if (typeof progress === 'number') s.progress = progress;
    if (phase) s.phase = phase;

    // Persist state on progress updates
    this.persistState();
    this.notifyListeners();
  }

  /**
   * Cancel an import operation
   */
  cancelImport(threadId) {
    const importState = this.activeImports.get(threadId);
    if (!importState) return;

    importState.status = 'cancelled';
    this.completionCallbacks.delete(threadId);

    // Persist state immediately
    this.persistState();
    this.notifyListeners();
    console.log('🎬 ImportManager: Cancelled import for thread', threadId);

    // Clean up immediately for cancellation
    setTimeout(() => {
      this.activeImports.delete(threadId);
      this.persistState(); // Persist removal
      this.notifyListeners();
    }, 500);
  }

  /**
   * Get import state for a specific thread
   */
  getImportState(threadId) {
    return this.activeImports.get(threadId) || null;
  }

  /**
   * Check if a thread has an active import
   */
  hasActiveImport(threadId) {
    const state = this.activeImports.get(threadId);
    return state && state.status === 'active';
  }

  /**
   * Get UI state for ChatThread component
   */
  getUIState(threadId) {
    const importState = this.activeImports.get(threadId);
    if (!importState) {
      return { showProgress: false, searchQuery: null };
    }

    // Only show progress for imports that were started in this session
    // Don't show progress for any restored/persisted imports
    const shouldShowProgress = importState.status === 'active' &&
                              importState.startedInCurrentSession === true;

    return {
      showProgress: shouldShowProgress,
      searchQuery: importState.searchQuery,
      status: importState.status,
      progress: importState.progress,
      phase: importState.phase,
      uiStarted: importState.uiStarted
    };
  }

  /**
   * Mark that the UI has initiated the visible workflow so it won't restart on re-mount
   */
  markUiStarted(threadId) {
    const s = this.activeImports.get(threadId);
    if (s) {
      s.uiStarted = true;
      this.persistState();
      this.notifyListeners();
    }
  }

  /**
   * Check if there's an ongoing background process for this thread
   * This is called when switching to a thread to detect ongoing imports
   */
  checkForOngoingProcess(threadId) {
    const state = this.activeImports.get(threadId);
    if (state && state.status === 'active') {
      console.log('🎬 ImportManager: Found ongoing import for thread', threadId, 'phase:', state.phase);
      return true;
    }
    return false;
  }

  /**
   * Force refresh state from persistent storage
   * Useful when reconnecting or switching threads
   */
  refreshFromStorage() {
    this.restorePersistedState();
    this.notifyListeners();
  }

  /**
   * Check server for active imports and sync with local state
   * DISABLED: This was causing imports to restart when PAMA reopened
   */
  async syncWithServer(threadId) {
    console.log('🎬 ImportManager: Server sync disabled to prevent import restart');
    // DISABLED: Don't sync with server to prevent unwanted import restoration
    // try {
    //   const response = await fetch(`http://localhost:8321/active-imports/${threadId}`);
    //   if (response.ok) {
    //     const data = await response.json();
    //     if (data.active) {
    //       // Server has an active import that we don't know about
    //       const localState = this.activeImports.get(threadId);
    //       if (!localState || localState.status !== 'active') {
    //         console.log('🎬 ImportManager: Found server-side active import for thread', threadId);
    //
    //         // Create local state to match server
    //         const importState = {
    //           threadId,
    //           searchQuery: data.query || 'Animation import',
    //           status: 'active',
    //           startTime: data.startTime,
    //           progress: Math.min(90, Math.floor(data.duration / 1000) * 5), // Estimate progress
    //           phase: 'importing',
    //           uiStarted: true, // Mark as started since it's ongoing
    //           persistentId: `import_${threadId}_${data.startTime}`
    //         };
    //
    //         this.activeImports.set(threadId, importState);
    //         this.persistState();
    //         this.notifyListeners();
    //
    //         console.log('🎬 ImportManager: Synced with server import state');
    //       }
    //     }
    //   }
    // } catch (e) {
    //   console.warn('Failed to sync with server:', e);
    // }
  }

  /**
   * Subscribe to import state changes
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state changes
   */
  notifyListeners() {
    this.listeners.forEach(listener => {
      try { listener(); } catch (e) { console.warn('ImportManager listener error:', e); }
    });
  }

  /**
   * Get all active imports (for debugging)
   */
  getAllActiveImports() {
    return Array.from(this.activeImports.entries()).map(([threadId, state]) => ({
      threadId,
      ...state
    }));
  }

  /**
   * Clean up completed/cancelled imports older than specified time
   */
  cleanup(maxAge = 5 * 60 * 1000) { // 5 minutes default
    const now = Date.now();
    let hasChanges = false;
    for (const [threadId, state] of this.activeImports.entries()) {
      if (state.status !== 'active' && (now - (state.completedAt || state.startTime)) > maxAge) {
        this.activeImports.delete(threadId);
        hasChanges = true;
      }
    }
    if (hasChanges) {
      this.persistState();
    }
    this.notifyListeners();
  }

  /**
   * Persist current state to localStorage
   */
  persistState() {
    try {
      const stateToSave = {};
      for (const [threadId, state] of this.activeImports.entries()) {
        // Only persist truly active imports, not completed ones
        // This prevents completed imports from being restored when PAMA restarts
        if (state.status === 'active' && !state.completedAt) {
          stateToSave[threadId] = {
            ...state,
            // Don't persist callbacks - they'll be re-registered
            callback: undefined
          };
        }
      }
      localStorage.setItem(this.storageKey, JSON.stringify(stateToSave));
      console.log('🎬 ImportManager: Persisted state for', Object.keys(stateToSave).length, 'active imports');
    } catch (e) {
      console.warn('Failed to persist ImportManager state:', e);
    }
  }

  /**
   * Restore state from localStorage
   */
  restorePersistedState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return;

      const stateData = JSON.parse(saved);
      const now = Date.now();

      for (const [threadId, state] of Object.entries(stateData)) {
        // ONLY restore truly active imports that are not completed
        // This prevents any completed imports from being restored on restart
        if (state.status === 'active' && !state.completedAt) {
          // Check if import is stale (older than 10 minutes)
          if (now - state.startTime > 10 * 60 * 1000) {
            console.log('🎬 ImportManager: Stale import detected for thread', threadId, 'skipping restoration');
            continue; // Skip stale imports
          }

          this.activeImports.set(threadId, state);
          console.log('🎬 ImportManager: Restored active import state for thread', threadId);
        } else {
          console.log('🎬 ImportManager: Skipping restoration of completed/cancelled import for thread', threadId);
        }
      }
    } catch (e) {
      console.warn('Failed to restore ImportManager state:', e);
      // Clear corrupted data
      localStorage.removeItem(this.storageKey);
    }
  }

  /**
   * Set up periodic state persistence and cleanup
   */
  setupStatePersistence() {
    // Persist state every 5 seconds
    setInterval(() => {
      this.persistState();
    }, 5000);

    // Clean up old imports every minute
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }
}

export default ImportManager;
