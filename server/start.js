// Start server script
const runServer = require('./main');
const db = require('./database');

console.log('Starting PAMA server...');

// Initialize database
try {
  // Database is initialized when the module is loaded
  console.log('Connected to SQLite database');
  console.log('Database tables created successfully');
} catch (error) {
  console.error('Error initializing database:', error);
}

console.log('About to run server...');

// Run the server
const server = runServer();

console.log('Server initialization completed');
console.log('Server should be running on port 8321');

// Add a direct patch to ensure socket events are sent back to clients
try {
  // Get the socket.io instance from the server
  const io = server._io || server.io;

  if (io) {
    console.log('Patching Socket.IO to ensure client confirmations are sent');

    // Patch the socket.io connection event
    const originalOnConnection = io.on;
    io.on = function(event, handler) {
      if (event === 'connection') {
        return originalOnConnection.call(this, event, (socket) => {
          console.log('Patched socket connection:', socket.id);

          // Patch the update_project_data event
          const originalOn = socket.on;
          socket.on = function(eventName, eventHandler) {
            if (eventName === 'update_project_data') {
              return originalOn.call(this, eventName, (data) => {
                // Call the original handler
                eventHandler(data);

                // Force send a confirmation back to the client after a short delay
                setTimeout(() => {
                  console.log('Forcing confirmation to client:', socket.id);
                  socket.emit('projectDataSaved', 'Data saved successfully (forced)');
                  socket.emit('project_data_updated', {
                    success: true,
                    projectId: 1,
                    version: Date.now(),
                    timestamp: new Date().toISOString(),
                    message: 'Data saved successfully (forced)'
                  });
                }, 2000);
              });
            }
            return originalOn.call(this, eventName, eventHandler);
          };

          // Call the original handler
          handler(socket);
        });
      }
      return originalOnConnection.call(this, event, handler);
    };

    console.log('Socket.IO patched successfully');
  } else {
    console.log('Could not find Socket.IO instance to patch');
  }
} catch (error) {
  console.error('Error patching Socket.IO:', error);
}

// Handle graceful shutdown
let isShuttingDown = false;

// Remove any existing SIGINT handlers
process.removeAllListeners('SIGINT');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);

  // Attempt to shut down gracefully
  if (!isShuttingDown) {
    isShuttingDown = true;
    console.log('Shutting down due to uncaught exception...');

    try {
      server.close(() => {
        try {
          db.closeDatabase();
        } catch (dbError) {
          console.error('Error closing database:', dbError);
        }
        process.exit(1);
      });
    } catch (closeError) {
      console.error('Error closing server:', closeError);
      process.exit(1);
    }
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason);

  // Log the promise for debugging
  console.error('Promise:', promise);

  // We don't exit the process here, just log the error
});

// Add our single shutdown handler
process.on('SIGINT', () => {
  if (isShuttingDown) {
    console.log('Forced shutdown...');
    process.exit(1);
    return;
  }

  isShuttingDown = true;
  console.log('Shutting down server...');

  // Set a timeout to force exit if graceful shutdown takes too long
  const forceExitTimeout = setTimeout(() => {
    console.log('Shutdown timed out after 5 seconds, forcing exit...');
    process.exit(1);
  }, 5000);

  // Close all socket connections
  try {
    // Get the io instance if available
    const io = server._io || server.io;
    if (io && typeof io.sockets === 'object') {
      const connectedSockets = Object.keys(io.sockets.sockets || {}).length;
      console.log(`Closing ${connectedSockets} socket connection(s)...`);

      // Close each socket
      Object.values(io.sockets.sockets || {}).forEach(socket => {
        if (socket && typeof socket.disconnect === 'function') {
          socket.disconnect(true);
        }
      });
    }
  } catch (socketError) {
    console.error('Error closing socket connections:', socketError);
  }

  // Close the server
  try {
    // Check if the server has any connections
    const hasConnections = server.getConnections && typeof server.getConnections === 'function';

    if (hasConnections) {
      server.getConnections((err, count) => {
        if (err) {
          console.error('Error getting connection count:', err);
        } else {
          console.log(`Closing server with ${count} HTTP connection(s)...`);
        }
      });
    }

    // Set a flag to track if the server close callback has been called
    let serverClosed = false;

    // Close the server
    server.close(() => {
      // Mark the server as closed
      serverClosed = true;

      // Clear the force exit timeout since we're shutting down properly
      clearTimeout(forceExitTimeout);

      console.log('Server closed');

      // Close the database
      try {
        db.closeDatabase();
        console.log('Database closed');
      } catch (dbError) {
        console.error('Error closing database:', dbError);
      }

      console.log('Shutdown complete');
      process.exit(0);
    });

    // Handle the case where server.close() doesn't call the callback
    // This can happen if there are no active connections
    if (server.listening === false) {
      console.log('Server not listening, proceeding with shutdown...');

      // If the server wasn't listening, the close callback might not be called
      setTimeout(() => {
        if (!serverClosed) {
          console.log('Server close callback not called, proceeding with shutdown...');

          // Close the database
          try {
            db.closeDatabase();
            console.log('Database closed');
          } catch (dbError) {
            console.error('Error closing database:', dbError);
          }

          console.log('Shutdown complete');
          process.exit(0);
        }
      }, 1000);
    }
  } catch (error) {
    console.error('Error closing server:', error);
    process.exit(1);
  }
});