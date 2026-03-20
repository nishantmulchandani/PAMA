import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';

// A simple component to verify React is working
function MinimalApp() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div style={{
      padding: '20px',
      maxWidth: '800px',
      margin: '0 auto',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ color: '#4CAF50' }}>React is Working!</h1>
      <p>This is a minimal React application to verify that React is working properly.</p>
      
      <div style={{
        backgroundColor: '#4CAF50',
        color: 'white',
        padding: '20px',
        borderRadius: '5px',
        marginTop: '20px'
      }}>
        <h2>Test Counter</h2>
        <p>Count: {count}</p>
        <button 
          onClick={() => setCount(count + 1)}
          style={{
            backgroundColor: 'white',
            color: '#4CAF50',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Increment
        </button>
      </div>
    </div>
  );
}

// Use the older ReactDOM.render method which is more compatible
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM content loaded, initializing React');
  
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('Root element not found!');
    
    // Create root element if it doesn't exist
    const newRoot = document.createElement('div');
    newRoot.id = 'root';
    document.body.appendChild(newRoot);
    console.log('Created new root element');
    
    // Render to the new root
    ReactDOM.render(<MinimalApp />, newRoot);
  } else {
    console.log('Root element found, rendering React app');
    ReactDOM.render(<MinimalApp />, rootElement);
  }
});
