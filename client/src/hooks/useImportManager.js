/**
 * React hook for ImportManager integration
 * Provides clean React interface to the global ImportManager
 */

import { useState, useEffect, useCallback } from 'react';
import ImportManager from '../managers/ImportManager';

export function useImportManager(threadId) {
  const [importState, setImportState] = useState(null);
  const [manager] = useState(() => ImportManager.getInstance());

  // Update local state when manager state changes
  useEffect(() => {
    const updateState = () => {
      try {
        const state = manager.getUIState(threadId);
        setImportState(state);
      } catch (error) {
        console.error('🎬 useImportManager: Error updating state:', error);
        setImportState({ showProgress: false, searchQuery: null });
      }
    };

    try {
      // Initial state
      updateState();

      // Subscribe to changes
      const unsubscribe = manager.subscribe(updateState);
      return unsubscribe;
    } catch (error) {
      console.error('🎬 useImportManager: Error setting up manager:', error);
      return () => {}; // Return empty cleanup function
    }
  }, [manager, threadId]);

  // Start import operation
  const startImport = useCallback((searchQuery, onComplete) => {
    try {
      manager.startImport(threadId, searchQuery, onComplete);
    } catch (error) {
      console.error('🎬 useImportManager: Error starting import:', error);
    }
  }, [manager, threadId]);

  // Complete import operation
  const completeImport = useCallback((result) => {
    manager.completeImport(threadId, result);
  }, [manager, threadId]);

  // Cancel import operation
  const cancelImport = useCallback(() => {
    manager.cancelImport(threadId);
  }, [manager, threadId]);

  // Check if import is active
  const hasActiveImport = useCallback(() => {
    return manager.hasActiveImport(threadId);
  }, [manager, threadId]);

  return {
    importState,
    startImport,
    completeImport,
    cancelImport,
    hasActiveImport,
    manager, // Expose manager for advanced operations
    // Convenience properties
    showProgress: importState?.showProgress || false,
    searchQuery: importState?.searchQuery || null,
    isActive: importState?.status === 'active'
  };
}

export default useImportManager;
