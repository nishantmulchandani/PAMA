import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import './index.css';

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
  console.log('React: DOMContentLoaded event fired');

  // Function to initialize React
  const initReact = function() {
    console.log('React: Initializing React application');

    // Check if root element exists
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      console.error('React: Root element not found!');

      // Create root element if it doesn't exist
      const newRoot = document.createElement('div');
      newRoot.id = 'root';
      newRoot.className = 'app-container';
      document.body.appendChild(newRoot);
      console.log('React: Created new root element');

      // Render to the new root using the older ReactDOM.render method
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