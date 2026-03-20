const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { setupMemoryDB } = require('./memory');
const { runAgent } = require('./agent');
const db = require('./database');
const search = require('./search');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ====================================================================
// SECURE CREDIT SYSTEM - SINGLE SOURCE OF TRUTH
// PAMA Server is the authoritative credit system - no external dependencies
// ====================================================================

const { SecureCreditSystem } = require('./secure-credits');
const secureCredits = new SecureCreditSystem();
const ANIMATION_GENERATION_COST = 100; // Credits required per animation generation

// Secure credit functions - no external API calls needed
async function getCredits(authToken) {
  const userId = secureCredits.extractUserIdFromToken(authToken);
  if (!userId) throw new Error('Invalid auth token');
  return await secureCredits.getCredits(userId);
}

async function authorizeCredits(cost, authToken, animationHash = null) {
  const userId = secureCredits.extractUserIdFromToken(authToken);
  if (!userId) throw new Error('Invalid auth token');
  return await secureCredits.authorizeCredits(userId, cost, animationHash);
}

async function commitCredits(authId, authToken, animationHash = null, idempotencyKey = null) {
  const userId = secureCredits.extractUserIdFromToken(authToken);
  if (!userId) throw new Error('Invalid auth token');
  return await secureCredits.commitCredits(userId, authId, animationHash, idempotencyKey);
}

async function cancelCredits(authId, authToken, reason = 'pama-server-cancel') {
  const userId = secureCredits.extractUserIdFromToken(authToken);
  if (!userId) throw new Error('Invalid auth token');
  return await secureCredits.cancelCredits(userId, authId, reason);
}

// Helper for UUID generation
function cryptoSafeUuid() {
  // not cryptographically strong but ok for dev; prod should use uuid.v4()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Extract auth token from request or socket data
function extractAuthToken(req, socketData = null) {
  // Check for explicit authToken in socket data first
  if (socketData && socketData.authToken) {
    return socketData.authToken;
  }
  
  // Check HTTP Authorization header
  if (req.headers && req.headers.authorization) {
    const h = req.headers.authorization;
    if (h.startsWith('Bearer ')) return h.slice(7);
  }
  
  // For socket.io, check handshake auth
  if (req.handshake && req.handshake.auth && req.handshake.auth.token) {
    return req.handshake.auth.token;
  }
  
  // SECURITY: No fallback for credit operations - require proper auth
  return null;
}

/**
 * Main server function that initializes the Express app and Socket.io
 */
module.exports = function runServer() {
  console.log('Starting PAMA server...');

  // Create Express app
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: '*' })); // Enable CORS for all origins in development

  // ========================================
  // SECURE CREDIT API ENDPOINTS
  // These are the authoritative credit endpoints
  // ========================================

  // Get user credits - SECURE
  app.get('/credits', async (req, res) => {
    try {
      const authToken = extractAuthToken(req);
      if (!authToken) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const credits = await getCredits(authToken);
      res.json(credits);
    } catch (error) {
      console.error('Error fetching credits:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get transaction history - SECURE
  app.get('/credits/history', async (req, res) => {
    try {
      const authToken = extractAuthToken(req);
      if (!authToken) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const userId = secureCredits.extractUserIdFromToken(authToken);
      const history = await secureCredits.getTransactionHistory(userId, 50);
      res.json({ success: true, transactions: history });
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Grant credits - SECURE (would need admin authentication in production)
  app.post('/credits/admin/grant', async (req, res) => {
    try {
      const { userId, amount, reason } = req.body;
      if (!userId || !amount) {
        return res.status(400).json({ error: 'userId and amount required' });
      }
      
      const result = await secureCredits.grantCredits(userId, amount, reason);
      res.json(result);
    } catch (error) {
      console.error('Error granting credits:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add a database viewer endpoint
  app.get('/db-viewer', (req, res) => {
    try {
      const projects = db.getAllProjects();
      const result = {
        projects: projects.map(project => {
          const history = db.getProjectHistory(project.name);
          const latestData = db.getProjectData(project.name);

          return {
            id: project.id,
            name: project.name,
            created_at: project.created_at,
            updated_at: project.updated_at,
            versions: history.length,
            latestVersion: latestData ? latestData.version : null,
            summary: latestData && latestData.data ? latestData.data.summary : null,
            itemCount: latestData && latestData.data && latestData.data.items ? latestData.data.items.length : 0,
            compCount: latestData && latestData.data && latestData.data.comps ? latestData.data.comps.length : 0
          };
        })
      };

      // Return HTML page with database info
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>PAMA Database Viewer</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            .project { border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
            .project h2 { margin-top: 0; }
            .summary { background: #f5f5f5; padding: 10px; border-radius: 5px; }
            .versions { color: #666; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>PAMA Database Viewer</h1>
          <p>Found ${result.projects.length} projects in the database.</p>

          ${result.projects.map(project => `
            <div class="project">
              <h2>${project.name}</h2>
              <p><strong>ID:</strong> ${project.id}</p>
              <p><strong>Created:</strong> ${project.created_at}</p>
              <p><strong>Updated:</strong> ${project.updated_at}</p>
              <p class="versions"><strong>Versions:</strong> ${project.versions} (Latest: ${project.latestVersion || 'None'})</p>

              ${project.summary ? `
                <div class="summary">
                  <h3>Summary</h3>
                  <table>
                    <tr>
                      <th>Total Items</th>
                      <th>Compositions</th>
                      <th>Videos</th>
                      <th>Images</th>
                      <th>Audio</th>
                      <th>Folders</th>
                    </tr>
                    <tr>
                      <td>${project.summary.totalItems || 0}</td>
                      <td>${project.summary.compositions || 0}</td>
                      <td>${project.summary.videos || 0}</td>
                      <td>${project.summary.images || 0}</td>
                      <td>${project.summary.audio || 0}</td>
                      <td>${project.summary.folders || 0}</td>
                    </tr>
                  </table>
                </div>
              ` : '<p>No summary data available</p>'}

              <p><strong>Item Count:</strong> ${project.itemCount}</p>
              <p><strong>Composition Count:</strong> ${project.compCount}</p>

              <p><a href="/project-detail/${project.id}">View Full Project Details</a></p>
            </div>
          `).join('')}
        </body>
        </html>
      `;

      res.send(html);
    } catch (error) {
      res.status(500).send(`Error retrieving database info: ${error.message}`);
    }
  });

  // Add a project detail endpoint
  app.get('/project-detail/:id', (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).send('Invalid project ID');
      }

      // Get project by ID
      const project = db.getAllProjects().find(p => p.id === projectId);
      if (!project) {
        return res.status(404).send('Project not found');
      }

      // Get project data
      const projectData = db.getProjectData(project.name);
      if (!projectData) {
        return res.status(404).send('Project data not found');
      }

      // Return HTML page with project details
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>PAMA Project Detail: ${project.name}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1, h2, h3 { color: #333; }
            .section { border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
            .item { background: #f5f5f5; padding: 10px; margin-bottom: 10px; border-radius: 5px; }
            pre { background: #f9f9f9; padding: 10px; overflow: auto; }
            .back-link { margin-bottom: 20px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <div class="back-link">
            <a href="/db-viewer">← Back to Database Viewer</a>
          </div>

          <h1>Project: ${project.name}</h1>
          <p><strong>ID:</strong> ${project.id}</p>
          <p><strong>Created:</strong> ${project.created_at}</p>
          <p><strong>Updated:</strong> ${project.updated_at}</p>
          <p><strong>Version:</strong> ${projectData.version}</p>

          <div class="section">
            <h2>Summary</h2>
            ${projectData.data.summary ? `
              <table>
                <tr>
                  <th>Total Items</th>
                  <th>Compositions</th>
                  <th>Videos</th>
                  <th>Images</th>
                  <th>Audio</th>
                  <th>Folders</th>
                </tr>
                <tr>
                  <td>${projectData.data.summary.totalItems || 0}</td>
                  <td>${projectData.data.summary.compositions || 0}</td>
                  <td>${projectData.data.summary.videos || 0}</td>
                  <td>${projectData.data.summary.images || 0}</td>
                  <td>${projectData.data.summary.audio || 0}</td>
                  <td>${projectData.data.summary.folders || 0}</td>
                </tr>
              </table>
            ` : '<p>No summary data available</p>'}
          </div>

          ${projectData.data.comps && projectData.data.comps.length > 0 ? `
            <div class="section">
              <h2>Compositions (${projectData.data.comps.length})</h2>
              ${projectData.data.comps.map(comp => `
                <div class="item">
                  <h3>${comp.name}</h3>
                  <p><strong>Duration:</strong> ${comp.duration}s</p>
                  <p><strong>Frame Rate:</strong> ${comp.frameRate}fps</p>
                  <p><strong>Dimensions:</strong> ${comp.width}x${comp.height}</p>
                  <p><strong>Layers:</strong> ${comp.layers ? comp.layers.length : 0}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${projectData.data.items && projectData.data.items.length > 0 ? `
            <div class="section">
              <h2>Items (${projectData.data.items.length})</h2>
              <table>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Index</th>
                </tr>
                ${projectData.data.items.map(item => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.type}</td>
                    <td>${item.index}</td>
                  </tr>
                `).join('')}
              </table>
            </div>
          ` : ''}

          <div class="section">
            <h2>Raw Data</h2>
            <pre>${JSON.stringify(projectData.data, null, 2)}</pre>
          </div>
        </body>
        </html>
      `;

      res.send(html);
    } catch (error) {
      res.status(500).send(`Error retrieving project details: ${error.message}`);
    }
  });

  // Initialize HTTP server
  const server = http.createServer(app);

  // Initialize Socket.io with more specific CORS settings
  const io = new Server(server, {
    cors: {
      origin: '*', // Allow connections from panel
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    },
    transports: ['websocket', 'polling'] // Support both WebSocket and polling
  });

  // Initialize local memory database
  try {
    setupMemoryDB();
    console.log('Memory database initialized');
  } catch (error) {
    console.error('Error initializing memory database:', error);
  }

  // Store the current project data
  let currentProjectData = {
    comps: [],
    footage: [],
    items: [],
    summary: {
      totalItems: 0,
      compositions: 0,
      videos: 0,
      images: 0,
      audio: 0,
      folders: 0,
      psd: 0,
      illustratorFiles: 0
    }
  };

  // REST endpoint: get project structure
  app.get('/project', async (req, res) => {
    try {
      // Return the most recent project data
      res.json(currentProjectData);
    } catch (error) {
      console.error('Error in /project endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Animation search endpoint
  app.get('/search/lottie', async (req, res) => {
    const { query, top_k = 5 } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'No search query provided' });
    }

    try {
        const results = await search.findBestAnimation(query, parseInt(top_k));
        res.json({
            query,
            results,
            count: results.length,
            search_type: 'hybrid'
        });
    } catch (error) {
        console.error('Error searching Lottie animations:', error);
        // Fallback to keyword-only search if hybrid search fails
        try {
            const fallbackResults = await search.keywordOnlySearch(query, parseInt(top_k));
            res.json({
                query,
                results: fallbackResults,
                count: fallbackResults.length,
                search_type: 'keyword_fallback',
                warning: 'Hybrid search unavailable, using keyword search'
            });
        } catch (fallbackError) {
            console.error('Fallback search also failed:', fallbackError);
            res.status(500).json({ error: 'Failed to search Lottie animations' });
        }
    }
  });

  // Smart animation workflow endpoint - User query → Single result → LLM modify → Auto-import
  // WITH CREDIT ENFORCEMENT
  app.post('/smart-animation-workflow', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'No query provided' });
    }

    // Extract auth token for credit operations
    const authToken = extractAuthToken(req);
    let holdId;

    try {
        console.log('Smart workflow started for query:', query);
        console.log('Using auth token:', authToken ? authToken.substring(0, 10) + '...' : 'none');

        // Step 1: Authorize credits BEFORE doing any work
        try {
            console.log(`Authorizing ${ANIMATION_GENERATION_COST} credits for animation generation...`);
            const authResult = await authorizeCredits(ANIMATION_GENERATION_COST, authToken, query);
            holdId = authResult.authId; // Use authId from secure system
            console.log('Credits authorized successfully, authId:', holdId);
        } catch (creditError) {
            console.error('Credit authorization failed:', creditError.message);
            return res.status(402).json({
                error: 'Insufficient credits for animation generation',
                details: creditError.message,
                required: ANIMATION_GENERATION_COST
            });
        }

        // Step 2: Search and get single best result
        const searchResults = await search.findBestAnimation(query, 1); // Only get 1 result
        if (!searchResults || searchResults.length === 0) {
            // Cancel credits if no animation found
            if (holdId) {
                try {
                    await cancelCredits(holdId, authToken, 'no-animation-found');
                    console.log('Credits canceled - no animation found');
                } catch (cancelError) {
                    console.error('Failed to cancel credits:', cancelError.message);
                }
            }
            return res.status(404).json({
                error: 'No matching animation found',
                query: query
            });
        }

        const bestAnimation = searchResults[0];
        console.log('Best animation found:', bestAnimation);

        // Step 3: Load the animation JSON data
        const animationPath = path.join(__dirname, 'lottie_library', 'animations', bestAnimation);
        if (!fs.existsSync(animationPath)) {
            // Cancel credits if animation file not found
            if (holdId) {
                try {
                    await cancelCredits(holdId, authToken, 'animation-file-not-found');
                    console.log('Credits canceled - animation file not found');
                } catch (cancelError) {
                    console.error('Failed to cancel credits:', cancelError.message);
                }
            }
            return res.status(404).json({
                error: 'Animation file not found',
                filename: bestAnimation
            });
        }

        const animationData = JSON.parse(fs.readFileSync(animationPath, 'utf8'));

        // Step 4: Use LLM to modify if needed (simplified from agent.js)
        const { runAgent } = require('./agent');
        const llmResponse = await runAgent(query, [{
            filename: bestAnimation,
            jsonData: animationData,
            description: `Animation: ${bestAnimation}`
        }]);

        // Step 5: Commit credits on successful generation
        if (holdId) {
            try {
                const idempotencyKey = cryptoSafeUuid();
                const commitResult = await commitCredits(holdId, authToken, bestAnimation, idempotencyKey);
                console.log('Credits committed successfully:', commitResult);
            } catch (commitError) {
                console.error('Failed to commit credits:', commitError.message);
                // Continue anyway since the animation was generated successfully
            }
        }

        // Step 6: Return the result for auto-import
        res.json({
            success: true,
            query: query,
            animation: {
                name: bestAnimation.replace('.json', ''),
                filename: bestAnimation,
                data: animationData,
                llmResponse: llmResponse,
                readyForImport: true
            },
            workflow: 'smart-single-result',
            creditsDeducted: ANIMATION_GENERATION_COST
        });

    } catch (error) {
        console.error('Smart workflow error:', error);
        
        // Cancel credits if there was an error
        if (holdId) {
            try {
                await cancelCredits(holdId, authToken, 'workflow-error');
                console.log('Credits canceled due to workflow error');
            } catch (cancelError) {
                console.error('Failed to cancel credits after error:', cancelError.message);
            }
        }
        
        res.status(500).json({
            error: 'Smart workflow failed',
            details: error.message
        });
    }
  });

  // Animation file endpoint
  app.get('/animations/:filename', async (req, res) => {
    const { filename } = req.params;
    const animationPath = path.join(__dirname, 'lottie_library', 'animations', filename);

    try {
        if (!fs.existsSync(animationPath)) {
            return res.status(404).json({ error: 'Animation not found' });
        }

        const animationData = JSON.parse(fs.readFileSync(animationPath, 'utf8'));
        res.json(animationData);
    } catch (error) {
        console.error('Error loading animation:', error);
        res.status(500).json({ error: 'Failed to load animation' });
    }
  });

  // REST endpoint: update project data
  app.post('/update-project', async (req, res) => {
    try {
      const { projectData } = req.body;

      if (!projectData) {
        return res.status(400).json({ error: 'No project data provided' });
      }

      // Update the current project data
      currentProjectData = projectData;

      console.log('Project data updated via HTTP endpoint');

      // Check if we have the new format with summary
      if (currentProjectData.summary) {
        console.log('Project data updated (new format): ',
          `${currentProjectData.summary.totalItems} total items, ` +
          `${currentProjectData.summary.compositions} compositions, ` +
          `${currentProjectData.summary.videos} videos, ` +
          `${currentProjectData.summary.images} images, ` +
          `${currentProjectData.summary.audio} audio files, ` +
          `${currentProjectData.summary.folders} folders`);
      } else {
        // Traditional format
        console.log('Project data updated (traditional format): ',
          `${currentProjectData.comps?.length || 0} compositions, ` +
          `${currentProjectData.footage?.length || 0} footage items`);
      }

      res.json({ success: true, message: 'Project data updated' });
    } catch (error) {
      console.error('Error in /update-project endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // REST endpoint: handle user command
  app.post('/command', async (req, res) => {
    try {
      const userPrompt = req.body.prompt;
      console.log('Received command:', userPrompt);

      if (!userPrompt) {
        return res.status(400).json({ error: 'No prompt provided' });
      }

      // Get the current project name (default to 'AEProject' if not specified)
      const projectName = req.body.projectName || 'AEProject';

      // Get ExtendScript mode from request body
      const extendScriptMode = req.body.extendScriptMode || false;
      console.log('ExtendScript mode from request:', extendScriptMode);

      // Run the agent (planner-executor-critic) loop with the project name and options
      const result = await runAgent(userPrompt, {}, projectName, { extendScriptMode });
      res.json({ status: 'success', response: result.response });
    } catch (error) {
      console.error('Error in /command endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle user commands via socket
    socket.on('user_command', async (data) => {
      try {
        const { prompt, projectName, extendScriptMode, authToken } = data;
        console.log('=== RECEIVED SOCKET COMMAND ===');
        console.log('Prompt:', prompt);
        console.log('ExtendScript mode:', extendScriptMode);
        console.log('Has auth token:', !!authToken);
        console.log('Data:', JSON.stringify(data));

        // Use the provided project name or default to 'AEProject'
        const currentProjectName = projectName || 'AEProject';
        console.log('Using project name for context:', currentProjectName);

        // Start the agent loop, with callbacks for streaming responses
        await runAgent(prompt, {
          onPartialResponse: (content) => {
            socket.emit('partial_response', { content });
          },
          onFinalResponse: (content, metadata) => {
            console.log('=== SENDING FINAL RESPONSE ===');
            console.log('Content:', content);
            console.log('Metadata:', metadata);
            socket.emit('final_response', { content, ...metadata });
          },

          onPreviewImages: (before, after) => {
            socket.emit('preview_images', { before, after });
          }
        }, currentProjectName, { extendScriptMode: extendScriptMode || false });
      } catch (error) {
        console.error('Error processing socket command:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle project data updates from the client
    socket.on('update_project_data', (data) => {
      try {
        console.log('Received project data update from client');

        if (data && data.projectData) {
          // Store the new project data
          currentProjectData = data.projectData;

          // Check if we have the new format with summary
          if (currentProjectData.summary) {
            console.log('Project data updated (new format): ',
              `${currentProjectData.summary.totalItems} total items, ` +
              `${currentProjectData.summary.compositions} compositions, ` +
              `${currentProjectData.summary.videos} videos, ` +
              `${currentProjectData.summary.images} images, ` +
              `${currentProjectData.summary.audio} audio files, ` +
              `${currentProjectData.summary.folders} folders`);
          } else {
            // Traditional format
            console.log('Project data updated (traditional format): ',
              `${currentProjectData.comps?.length || 0} compositions, ` +
              `${currentProjectData.footage?.length || 0} footage items`);
          }

          // Log some details about what we received
          if (currentProjectData.comps && currentProjectData.comps.length > 0) {
            currentProjectData.comps.forEach(comp => {
              console.log(`Comp: ${comp.name}, ${comp.duration}s at ${comp.frameRate}fps, ${comp.layers?.length || 0} layers`);
            });
          }

          if (currentProjectData.footage && currentProjectData.footage.length > 0) {
            currentProjectData.footage.forEach(item => {
              console.log(`Footage: ${item.name}, ${item.filePath || 'No file path'}, Type: ${item.itemType || 'Unknown'}`);
            });
          }

          // Log items from the new format if available
          if (currentProjectData.items && currentProjectData.items.length > 0) {
            console.log(`Items by type:`);
            const typeCount = {};
            currentProjectData.items.forEach(item => {
              typeCount[item.type] = (typeCount[item.type] || 0) + 1;
            });
            Object.keys(typeCount).forEach(type => {
              console.log(`  ${type}: ${typeCount[type]} items`);
            });
          }

          // Process the project snapshot for memory/context if needed
          try {
            const { processProjectSnapshot } = require('./memory');
            if (typeof processProjectSnapshot === 'function') {
              processProjectSnapshot(currentProjectData)
                .catch(error => console.error('Error processing project snapshot:', error));
            }
          } catch (memoryError) {
            console.error('Error importing processProjectSnapshot:', memoryError);
          }

          // Save to database
          console.log(`Saving project data to database...`);
          try {
            // Use the provided project name or default
            const projectName = data.projectName || 'AEProject';

            // Save to database using the database module
            const result = db.saveProjectData(projectName, currentProjectData);
            console.log(`Project data saved successfully (ID: ${result.projectId}, Version: ${result.version})`);

            // Create response object with details from the database
            const responseData = {
              success: true,
              projectId: result.projectId,
              version: result.version,
              timestamp: new Date().toISOString(),
              message: `Saved ${currentProjectData.items ? currentProjectData.items.length : 0} items to database`
            };

            // Send confirmation back to the sender using both events for compatibility
            console.log(`Sending save confirmation to client: ${socket.id}`);

            // First use the MyAEPScannerExtension style event
            socket.emit('projectDataSaved', responseData.message);

            // Also use the PAMA style event for backward compatibility
            socket.emit('project_data_updated', responseData);

            // Also broadcast to all other clients
            socket.broadcast.emit('project_data_updated', responseData);
          } catch (dbError) {
            console.error('Error saving to database:', dbError);

            // Send error back to client
            socket.emit('error', {
              message: 'Failed to save project data to database',
              details: dbError.message
            });

            // Also send events to prevent UI from being stuck
            socket.emit('projectDataSaved', 'Error: Failed to save to database');
            socket.emit('project_data_updated', {
              success: false,
              error: dbError.message,
              saved: true // Force UI to update
            });
          }
        } else {
          console.error('Received invalid project data format');

          // Send error back to client
          socket.emit('error', {
            message: 'Invalid project data format'
          });

          // Also send events to prevent UI from being stuck
          socket.emit('projectDataSaved', 'Error: Invalid project data format');
          socket.emit('project_data_updated', {
            success: false,
            error: 'Invalid project data format',
            saved: true // Force UI to update
          });
        }
      } catch (error) {
        console.error('Error handling project data update:', error);

        // Send error back to client
        socket.emit('error', {
          message: 'Failed to process project data',
          details: error.message
        });

        // Also send a projectDataSaved event to prevent UI from being stuck
        socket.emit('projectDataSaved', 'Error: Failed to save project data');

        // And send a project_data_updated event with error info
        socket.emit('project_data_updated', {
          success: false,
          error: error.message,
          saved: true // Force UI to update
        });
      }
    });

    // Handle UI-initiated ExtendScript execution
    socket.on('eval_script_result', (data) => {
      // This would be used to receive results from ExtendScript calls
      // that the UI made on behalf of the server
      console.log('Received evalScript result:', data);
      // Would typically store this or use it to continue processing
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Initialize search components
  search.loadSearchComponents().then(() => {
    console.log('Search components loaded successfully');
  }).catch(error => {
    console.error('Failed to load search components:', error);
    console.log('Animation search will use fallback methods');
  });

  // Start server
  const PORT = 8321;
  server.listen(PORT, () => {
    console.log(`PAMA server running on port ${PORT}`);
  });

  // Error handling
  server.on('error', (error) => {
    console.error('Server error:', error);
  });

  return server; // Return server instance for reference
};

// Start the server if this file is run directly
if (require.main === module) {
  module.exports();
}
