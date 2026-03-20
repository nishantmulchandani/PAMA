// Configuration helper for PAMA server
const fs = require('fs');
const path = require('path');

// Paths to look for the API key file
const possiblePaths = [
  // Current directory
  path.join(__dirname, 'REPLICATE.txt'),
  // Parent directory (PAMA root)
  path.join(__dirname, '..', 'REPLICATE.txt'),
  // User's home directory
  path.join(require('os').homedir(), 'REPLICATE.txt')
];

// Cache the API key to avoid reading the file multiple times
let cachedApiKey = null;

/**
 * Get the Kluster API key
 * @returns {string|null} The API key or null if not found
 */
function getApiKey() {
  // LLM connections have been disconnected for entirely offline usage
  return "offline_mode";
}

/**
 * Lists all the locations where the system is looking for the API key
 * @returns {string[]} Array of paths being checked
 */
function getSearchPaths() {
  return possiblePaths;
}

module.exports = {
  getApiKey,
  getSearchPaths
}; 