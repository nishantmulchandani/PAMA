import React, { useEffect } from 'react';
import { useDebug } from './DebugProvider';
import './DebugButton.css';

function DebugButton() {
  const { toggleDebugPanel } = useDebug();

  // Log when the component mounts to verify it's working
  useEffect(() => {
    console.log("DebugButton component mounted");
    console.log("toggleDebugPanel function available:", !!toggleDebugPanel);
  }, [toggleDebugPanel]);

  const handleClick = (e) => {
    // Stop event propagation to prevent any parent handlers from interfering
    e.stopPropagation();
    e.preventDefault();

    console.log("Debug button clicked");

    try {
      // First try using the React context
      if (toggleDebugPanel) {
        console.log("Calling toggleDebugPanel from context");
        toggleDebugPanel();
      } else {
        console.log("toggleDebugPanel not available in context, trying global function");
        // Fallback to global function if context isn't working
        if (window.PAMA_DEBUG && typeof window.PAMA_DEBUG.toggle === 'function') {
          console.log("Calling global PAMA_DEBUG.toggle");
          window.PAMA_DEBUG.toggle();
        } else {
          console.error("No debug toggle function available");
          alert("Debug functionality not available");
        }
      }
    } catch (error) {
      console.error("Error in debug button click handler:", error);
    }

    // Return false to prevent default behavior
    return false;
  };

  // Function to directly call the global debug toggle
  const directToggleDebug = () => {
    console.log("Direct toggle debug called");
    if (window.PAMA_DEBUG && typeof window.PAMA_DEBUG.toggle === 'function') {
      window.PAMA_DEBUG.toggle();
    }
  };

  // Log when the component is mounted
  useEffect(() => {
    console.log("DebugButton: Component mounted and ready");
  }, []);

  return (
    <div
      className="debug-button-wrapper"
      onClick={directToggleDebug}
      style={{
        display: 'inline-flex',
        visibility: 'visible',
        opacity: 1,
        position: 'relative',
        marginRight: '12px',
        flexShrink: 0,
        minWidth: '50px',
        minHeight: '24px'
      }}
    >
      <button
        onClick={handleClick}
        className="debug-button"
        data-testid="debug-button"
        type="button"
        style={{
          backgroundColor: '#f43f5e',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '2px 6px',
          fontSize: '0.7rem',
          cursor: 'pointer',
          zIndex: 9999,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '24px',
          width: '50px',
          fontWeight: 'bold',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
        }}
      >
        DEBUG
      </button>
    </div>
  );
}

export default DebugButton;
