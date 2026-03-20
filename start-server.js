/**
 * PAMA Server Launcher
 * This script starts the PAMA server for the CEP extension
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the directory where this script is located
const scriptDir = __dirname;

// Path to the server directory
const serverDir = path.join(scriptDir, 'server');

// Path to the server index.js file
const serverFile = path.join(serverDir, 'index.js');

// Check if the server file exists
if (!fs.existsSync(serverFile)) {
    console.error(`Server file not found: ${serverFile}`);
    process.exit(1);
}

// Create data directory if it doesn't exist
const dataDir = path.join(serverDir, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Created data directory: ${dataDir}`);
}

// Start the server
console.log('Starting PAMA server...');
const server = spawn('node', [serverFile], {
    cwd: serverDir,
    stdio: 'inherit'
});

// Handle server process events
server.on('error', (error) => {
    console.error('Failed to start server:', error);
});

server.on('exit', (code, signal) => {
    if (code) {
        console.log(`Server process exited with code ${code}`);
    } else if (signal) {
        console.log(`Server process killed with signal ${signal}`);
    } else {
        console.log('Server process exited');
    }
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('Stopping server...');
    server.kill('SIGINT');
    process.exit(0);
});

console.log('Server started. Press Ctrl+C to stop.');
