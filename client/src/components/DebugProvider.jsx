import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import './DebugStyles.css';

// Create Debug Context
const DebugContext = createContext({
  showDebugPanel: false,
  toggleDebugPanel: () => {},
  debugInfo: {},
  setDebugInfo: () => {}
});

// Hook to use debug context
export const useDebug = () => useContext(DebugContext);

// Debug Panel Component
const DebugPanel = ({ show, onClose, debugInfo }) => {
  if (!show) return null;

  return ReactDOM.createPortal(
    <div className="debug-panel-overlay">
      <div className="debug-panel-container">
        <div className="debug-panel-header">
          <h3>Debug Information</h3>
          <button className="debug-panel-close" onClick={onClose}>×</button>
        </div>
        <div className="debug-panel-content">
          <div className="debug-panel-item">
            <span className="debug-panel-label">CSInterface:</span>
            <span className={`debug-panel-value ${debugInfo.csInterfaceAvailable ? 'success' : 'error'}`}>
              {debugInfo.csInterfaceAvailable ? 'Available' : 'Not Available'}
            </span>
          </div>
          <div className="debug-panel-item">
            <span className="debug-panel-label">Scan Function:</span>
            <span className={`debug-panel-value ${debugInfo.scanFunctionAvailable ? 'success' : 'error'}`}>
              {debugInfo.scanFunctionAvailable ? 'Available' : 'Not Available'}
            </span>
          </div>
          <div className="debug-panel-item">
            <span className="debug-panel-label">Extension Path:</span>
            <span className="debug-panel-value">{debugInfo.extensionPath}</span>
          </div>
          <div className="debug-panel-item">
            <span className="debug-panel-label">Script Path:</span>
            <span className="debug-panel-value">{debugInfo.scriptPath}</span>
          </div>
          <button
            className="debug-panel-scan-button"
            onClick={() => {
              if (window.scanActualProject) {
                window.scanActualProject();
              } else if (window.CSInterface) {
                const cs = new window.CSInterface();
                const extensionRoot = cs.getSystemPath("extension") || ".";
                const scriptPath = extensionRoot + "/jsx/scanProject.jsx";
                cs.evalScript(`$.evalFile("${scriptPath}")`, function(result) {
                  console.log("Debug scan result:", result ? result.substring(0, 100) + "..." : "undefined");
                });
              }
            }}
          >
            Run Scan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Main Debug Provider Component
export const DebugProvider = ({ children }) => {
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugInfo, setDebugInfo] = useState({
    extensionPath: 'Not available',
    scriptPath: 'Not available',
    csInterfaceAvailable: false,
    scanFunctionAvailable: false
  });

  // Toggle debug panel and gather debug info
  const toggleDebugPanel = useCallback(() => {
    console.log("DebugProvider: toggleDebugPanel called, current state:", showDebugPanel);
    setShowDebugPanel(prevState => {
      const newState = !prevState;
      console.log("DebugProvider: Setting showDebugPanel to:", newState);

      if (newState) {
        console.log("DebugProvider: Gathering debug info...");
        gatherDebugInfo();
      }

      return newState;
    });
  }, []);

  // Gather debug information
  const gatherDebugInfo = () => {
    console.log("Gathering debug info...");

    // Check if CSInterface is available
    const csAvailable = typeof window.CSInterface !== 'undefined';
    let extensionPath = 'Not available';
    let scriptPath = 'Not available';

    if (csAvailable) {
      try {
        const cs = new window.CSInterface();
        extensionPath = cs.getSystemPath("extension") || "Unknown";
        scriptPath = extensionPath.replace(/\\/g, '/') + "/jsx/scanProject.jsx";

        // Check if scan function is available
        cs.evalScript("typeof PAMA_scanProject", (result) => {
          const scanFunctionAvailable = result === "function";

          setDebugInfo({
            extensionPath,
            scriptPath,
            csInterfaceAvailable: csAvailable,
            scanFunctionAvailable
          });
        });
      } catch (error) {
        console.error("Error gathering debug info:", error);

        setDebugInfo({
          extensionPath,
          scriptPath,
          csInterfaceAvailable: csAvailable,
          scanFunctionAvailable: false
        });
      }
    } else {
      setDebugInfo({
        extensionPath,
        scriptPath,
        csInterfaceAvailable: csAvailable,
        scanFunctionAvailable: false
      });
    }
  };

  // Set up keyboard shortcut (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggleDebugPanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleDebugPanel]);

  // Log component mounting for debugging
  useEffect(() => {
    console.log("DebugProvider mounted");

    // Create a global access point for debugging
    window.PAMA_DEBUG = {
      show: () => setShowDebugPanel(true),
      hide: () => setShowDebugPanel(false),
      toggle: toggleDebugPanel,
      getInfo: () => debugInfo
    };

    return () => {
      console.log("DebugProvider unmounted");
    };
  }, []);

  return (
    <DebugContext.Provider value={{ showDebugPanel, toggleDebugPanel, debugInfo, setDebugInfo }}>
      {children}
      <DebugPanel
        show={showDebugPanel}
        onClose={() => setShowDebugPanel(false)}
        debugInfo={debugInfo}
      />
    </DebugContext.Provider>
  );
};

export default DebugProvider;
