// PAMA Server for After Effects Extension
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const config = require('./config');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Utility function to mask API key for logging/display
function maskApiKey(apiKey) {
  if (!apiKey) return null;
  return apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
}

// Middleware to check for API key
const checkApiKey = (req, res, next) => {
  const apiKey = config.getApiKey();
  if (!apiKey) {
    return res.status(500).json({
      status: 'error',
      message: 'API key not configured. Please create a klusterapi.txt file with your API key.',
      searchPaths: config.getSearchPaths()
    });
  }
  // Store the API key on the request object for route handlers
  req.apiKey = apiKey;
  next();
};

// Status endpoint
app.get('/status', (req, res) => {
  const apiKey = config.getApiKey();
  res.json({
    status: 'running',
    apiKeyConfigured: !!apiKey
  });
});

// Test API key endpoint
app.get('/test-api-key', checkApiKey, (req, res) => {
  res.json({
    status: 'success',
    message: 'API key is configured correctly',
    maskedKey: maskApiKey(req.apiKey)
  });
});

// Query endpoint - this will be expanded to actually call the Kluster API
app.post('/query', checkApiKey, (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({
      status: 'error',
      message: 'Query is required'
    });
  }
  
  // For now, just return a mock response
  // This will be updated to call the actual Kluster API
  res.json({
    status: 'success',
    query,
    result: `Simulated response for: ${query}`,
    apiKeyUsed: maskApiKey(req.apiKey)
  });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  const apiKey = config.getApiKey();
  console.log(`API key ${apiKey ? 'loaded successfully' : 'not found'}`);
  if (!apiKey) {
    console.log('Please create a klusterapi.txt file with your API key in one of these locations:');
    config.getSearchPaths().forEach(path => console.log(`- ${path}`));
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
}); 