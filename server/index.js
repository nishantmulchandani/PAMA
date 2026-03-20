/**
 * PAMA Server
 * Handles communication between the CEP extension and the LLM
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const db = require('./database');
const llm = require('./llm');
const search = require('./search');
const agent = require('./agent');
const { setupMemoryDB } = require('./memory');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Store current project data in memory
let currentProjectData = null;
let currentProjectName = 'AEProject'; // Default project name
let activeImports = new Map(); // threadId -> { startTime, query, status, socketId }
const MANAGER_URL = process.env.PAMMA_MANAGER_URL || 'http://127.0.0.1:8431';
const IMPORT_CREDIT_COST = parseInt(process.env.IMPORT_CREDIT_COST || '100', 10);

// API Routes
app.get('/', (req, res) => {
    res.send('PAMA Server is running');
});

// --- Auth (dev) ---
app.post('/auth/login', (req, res) => {
    console.log('Login request received:', req.body);
    const { userId, license } = req.body || {};
    if (!userId || !license) {
        console.log('Missing credentials');
        return res.status(400).json({ ok: false, error: 'Missing userId or license' });
    }

    try {
        // dev accept any license; upsert user and create session
        const user = db.upsertUser(userId, userId);
        const { token } = db.createSession(user.id);
        console.log('Login successful for user:', userId);
        return res.json({ ok: true, user: { id: user.id, name: user.name }, token });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ ok: false, error: 'Server error' });
    }
});

app.get('/auth/session', (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).json({ ok: false });
    const session = db.getSession(token);
    if (!session) return res.json({ ok: false });
    return res.json({ ok: true, user: { id: session.user.id, name: session.user.name } });
});

app.post('/auth/logout', (req, res) => {
    const { token } = req.body || {};
    if (token) db.deleteSession(token);
    return res.json({ ok: true });
});

// --- Threads ---
app.get('/threads', (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
    try {
        const threads = db.listThreads(user_id);
        res.json(threads);
    } catch (e) {
        console.error('List threads error', e);
        res.status(500).json({ error: 'Failed to list threads' });
    }
});

app.post('/threads', (req, res) => {
    const { user_id, title } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
    try {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const t = db.createThread(id, user_id, title || 'New Animation Chat');
        res.json({ id: t.id, title: t.title });
    } catch (e) {
        console.error('Create thread error', e);
        res.status(500).json({ error: 'Failed to create thread' });
    }
});

app.get('/threads/:id/messages', (req, res) => {
    try {
        const msgs = db.getThreadMessages(req.params.id);
        res.json(msgs);
    } catch (e) {
        console.error('Get messages error', e);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

app.post('/threads/:id/messages', (req, res) => {
    const { role, content, update_title_if_default } = req.body || {};
    if (!role || !content) return res.status(400).json({ error: 'Missing role or content' });
    try {
        const mid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        db.addThreadMessage(mid, req.params.id, role, content);
        if (update_title_if_default && role === 'user') {
            // Set thread title to first 40 chars if it still looks default
            const snippet = String(content).slice(0, 40);
            try { db.updateThreadTitle(req.params.id, snippet); } catch(_) {}
        }
        res.json({ id: mid });
    } catch (e) {
        console.error('Add message error', e);
        res.status(500).json({ error: 'Failed to add message' });
    }
});

// Health check endpoint for testing
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        server: 'PAMA',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        endpoints: {
            search: '/search/lottie',
            animations: '/animations/:filename',
            queue: '/queue-animation-import',
            importQueue: '/import-queue'
        }
    });
});

// Get current project data
app.get('/project', (req, res) => {
    if (currentProjectData) {
        res.json(currentProjectData);
    } else {
        // Try to get from database
        const projectData = db.getProjectData(currentProjectName);
        if (projectData) {
            currentProjectData = projectData.data;
            res.json(currentProjectData);
        } else {
            res.status(404).json({ error: 'No project data available' });
        }
    }
});

// Save project data
app.post('/project', (req, res) => {
    const { projectData, projectName } = req.body;

    if (!projectData) {
        return res.status(400).json({ error: 'No project data provided' });
    }

    const name = projectName || currentProjectName;
    currentProjectName = name;
    currentProjectData = projectData;

    try {
        const result = db.saveProjectData(name, projectData);
        res.json({
            success: true,
            message: 'Project data saved',
            projectId: result.projectId,
            version: result.version
        });
    } catch (error) {
        console.error('Error saving project data:', error);
        res.status(500).json({ error: 'Failed to save project data' });
    }
});

// Get all projects
app.get('/projects', (req, res) => {
    try {
        const projects = db.getAllProjects();
        res.json(projects);
    } catch (error) {
        console.error('Error getting projects:', error);
        res.status(500).json({ error: 'Failed to get projects' });
    }
});

// Get project history
app.get('/project/:name/history', (req, res) => {
    try {
        const history = db.getProjectHistory(req.params.name);
        res.json(history);
    } catch (error) {
        console.error('Error getting project history:', error);
        res.status(500).json({ error: 'Failed to get project history' });
    }
});

// Get specific version of project
app.get('/project/:name/version/:version', (req, res) => {
    try {
        const projectData = db.getProjectVersion(req.params.name, parseInt(req.params.version));
        if (projectData) {
            res.json(projectData.data);
        } else {
            res.status(404).json({ error: 'Project version not found' });
        }
    } catch (error) {
        console.error('Error getting project version:', error);
        res.status(500).json({ error: 'Failed to get project version' });
    }
});

// Search project items
app.get('/search', (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'No search query provided' });
    }

    try {
        const results = db.searchProjectItems(query);
        res.json(results);
    } catch (error) {
        console.error('Error searching project items:', error);
        res.status(500).json({ error: 'Failed to search project items' });
    }
});

// Advanced Lottie animation search
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

// Keyword-only Lottie animation search
app.get('/search/lottie/keyword', async (req, res) => {
    const { query, top_k = 5 } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'No search query provided' });
    }

    try {
        const results = await search.keywordOnlySearch(query, parseInt(top_k));
        res.json({
            query,
            results,
            count: results.length,
            search_type: 'keyword'
        });
    } catch (error) {
        console.error('Error in keyword search:', error);
        res.status(500).json({ error: 'Failed to perform keyword search' });
    }
});

// Smart animation workflow endpoint - User query → Single result → Auto-import
app.post('/smart-animation-workflow', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'No query provided' });
    }

    try {
        console.log('Smart workflow started for query:', query);

        // Step 1: Search and get single best result
        const searchResults = await search.findBestAnimation(query, 1); // Only get 1 result
        if (!searchResults || searchResults.length === 0) {
            return res.status(404).json({
                error: 'No matching animation found',
                query: query
            });
        }

        const bestAnimation = searchResults[0];
        console.log('Best animation found:', bestAnimation);

        // Step 2: Load the animation JSON data
        const animationPath = path.join(__dirname, 'lottie_library', 'animations', bestAnimation);
        if (!fs.existsSync(animationPath)) {
            return res.status(404).json({
                error: 'Animation file not found',
                filename: bestAnimation
            });
        }

        const animationData = JSON.parse(fs.readFileSync(animationPath, 'utf8'));

        // Step 3: Return the result for auto-import (skip LLM modification for now)
        res.json({
            success: true,
            query: query,
            animation: {
                name: bestAnimation.replace('.json', ''),
                filename: bestAnimation,
                data: animationData,
                readyForImport: true
            },
            workflow: 'smart-single-result'
        });

    } catch (error) {
        console.error('Smart workflow error:', error);
        res.status(500).json({
            error: 'Smart workflow failed',
            details: error.message
        });
    }
});

// Serve individual animation JSON files
app.get('/animations/:filename', async (req, res) => {
    const { filename } = req.params;

    try {
        const fs = require('fs/promises');
        const path = require('path');

        // Ensure filename has .json extension
        const jsonFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
        const animationPath = path.join(__dirname, 'lottie_library', 'animations', jsonFilename);

        console.log(`Loading animation: ${jsonFilename} from ${animationPath}`);

        // Check if file exists
        await fs.access(animationPath);

        // Read and return the JSON file
        const animationData = await fs.readFile(animationPath, 'utf8');
        const parsedData = JSON.parse(animationData);

        console.log(`Animation loaded successfully: ${jsonFilename}, size: ${animationData.length} bytes`);

        // Add CORS headers for cross-origin requests
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type');

        res.json(parsedData);
    } catch (error) {
        console.error(`Error serving animation file ${filename}:`, error);
        if (error.code === 'ENOENT') {
            console.error(`Animation file not found: ${filename}`);
            res.status(404).json({
                error: 'Animation not found',
                filename: filename,
                searchedPath: path.join(__dirname, 'lottie_library', 'animations', filename.endsWith('.json') ? filename : `${filename}.json`)
            });
        } else if (error instanceof SyntaxError) {
            console.error(`Invalid JSON in animation file ${filename}:`, error);
            res.status(400).json({ error: 'Invalid JSON format in animation file' });
        } else {
            console.error(`Server error loading animation ${filename}:`, error);
            res.status(500).json({ error: 'Failed to load animation', details: error.message });
        }
    }
});

// Process user command with LLM
app.post('/command', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'No prompt provided' });
    }

    try {
        // Process the command with the real agent (includes animation search)
        const result = await agent.runAgent(prompt, {
            onPartialResponse: null, // No streaming for HTTP endpoint
            onFinalResponse: null,
            onPlanSteps: null
        });

        res.json({
            response: result.response,
            planSteps: result.planSteps || [],
            success: result.success
        });
    } catch (error) {
        console.error('Error processing command:', error);
        res.status(500).json({ error: 'Failed to process command' });
    }
});

// Add animation to import queue
app.post('/queue-animation-import', async (req, res) => {
    try {
        const { animationFile } = req.body;

        console.log('Queueing animation import:', animationFile);

        if (!animationFile) {
            console.error('No animation file provided in request');
            return res.status(400).json({ error: 'No animation file provided' });
        }

        // Check credits via Manager and create a hold (if Manager available)
        const DEV_ALLOW_NO_HOLD = process.env.DEV_ALLOW_NO_HOLD === '1';
        let chargeId = null;
        let entitlement = null;
        try {
            // Query status first (optional)
            const st = await axios.get(`${MANAGER_URL}/credits`, { timeout: 2000 }).then(r => r.data).catch(() => null);
            const insufficient = st && st.success && !st.membershipActive && (st.creditsAvailable || 0) < IMPORT_CREDIT_COST;
            if (insufficient) {
                return res.status(402).json({ error: 'Insufficient credits', message: 'Your credits are depleted. Please top up to continue.' });
            }
            // Authorize a hold
            // Compute a content hash to bind entitlement
            const crypto = require('crypto');
            const fileBuf = await fs.promises.readFile(path.join(__dirname, 'lottie_library', 'animations', animationFile.endsWith('.json') ? animationFile : `${animationFile}.json`));
            const assetHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
            const idempKey = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
            const auth = await axios.post(
                `${MANAGER_URL}/credits/authorize`,
                { amount: IMPORT_CREDIT_COST, sku: (animationFile.endsWith('.json') ? animationFile : `${animationFile}.json`), assetHash },
                { timeout: 2000, headers: { 'Idempotency-Key': idempKey } }
            ).then(r => r.data).catch(() => null);
            if (auth && auth.success && auth.chargeId) {
                chargeId = auth.chargeId;
                entitlement = auth.entitlement || null;
            } else if (auth && auth.error) {
                return res.status(402).json({ error: 'Insufficient credits', details: auth.error });
            }
        } catch (e) {
            console.warn('Manager credits check failed:', e.message);
            if (!DEV_ALLOW_NO_HOLD) {
                return res.status(503).json({ error: 'Credits service unavailable. Please try again shortly.' });
            }
        }

        // If we could not secure a hold and fallback is disabled, block
        if (!chargeId && !DEV_ALLOW_NO_HOLD) {
            return res.status(503).json({ error: 'Credits hold could not be authorized' });
        }

        // Ensure filename has .json extension
        const jsonFilename = animationFile.endsWith('.json') ? animationFile : `${animationFile}.json`;
        const animationPath = path.join(__dirname, 'lottie_library', 'animations', jsonFilename);

        console.log('Loading animation for queue:', animationPath);

        // Check if file exists
        if (!fs.existsSync(animationPath)) {
            console.error('Animation file not found:', animationPath);
            return res.status(404).json({
                error: 'Animation file not found',
                filename: jsonFilename,
                searchedPath: animationPath
            });
        }

        // Fetch the animation data from the server
        const animationData = await fs.readFile(animationPath, 'utf8');
        const parsedData = JSON.parse(animationData);

        // Initialize queue if it doesn't exist
        if (!global.pamaImportQueue) {
            global.pamaImportQueue = [];
        }

        // Add to import queue with enhanced metadata
        const queueItem = {
            timestamp: Date.now(),
            animationFile: jsonFilename,
            animationData: (process.env.DEV_INLINE_ANIMATION === '1') ? parsedData : null,
            status: 'pending',
            type: 'LOTTIE_IMPORT',
            filename: jsonFilename,
            queuedAt: new Date().toISOString(),
            chargeId: chargeId || null,
            entitlement: entitlement || null,
            entitledUrl: entitlement ? `http://localhost:8321/entitled/animation?file=${encodeURIComponent(jsonFilename)}&token=${encodeURIComponent(entitlement)}` : null
        };

        global.pamaImportQueue.push(queueItem);

        console.log(`Animation ${jsonFilename} added to import queue. Queue length: ${global.pamaImportQueue.length}`);

        res.json({
            success: true,
            message: 'Animation queued for import',
            queueLength: global.pamaImportQueue.length,
            filename: jsonFilename,
            timestamp: queueItem.timestamp
        });
    } catch (error) {
        console.error('Error queueing animation import:', error);
        if (error instanceof SyntaxError) {
            res.status(400).json({ error: 'Invalid JSON format in animation file' });
        } else {
            res.status(500).json({
                error: 'Failed to queue animation import',
                details: error.message
            });
        }
    }
});

// Get pending animation imports for CEP
app.get('/import-queue', (req, res) => {
    const queue = global.pamaImportQueue || [];

    console.log(`Import queue check: ${queue.length} items pending`);
    if (queue.length > 0) {
        console.log('Queue items:', queue.map(item => ({
            filename: item.filename || item.animationFile,
            timestamp: item.timestamp,
            type: item.type,
            status: item.status
        })));
    }

    global.pamaImportQueue = []; // Clear queue after reading

    res.json({
        success: true,
        imports: queue,
        count: queue.length,
        timestamp: Date.now()
    });
});

// Handle import completion from CEP
app.post('/import-complete', async (req, res) => {
    const { timestamp, success, error, compositionName, threadId } = req.body;

    console.log('Import completed:', { timestamp, success, error, compositionName, threadId });

    // Remove from active imports if threadId provided
    if (threadId) {
        activeImports.delete(threadId);
        console.log('Removed completed import for thread:', threadId);
    }

    // Notify connected clients
    io.emit('import-complete', { timestamp, success, error, compositionName, threadId });

    // Commit or cancel credits hold if chargeId present on matching queue item
    try {
        const chargeId = req.body && req.body.chargeId ? req.body.chargeId : null;
        if (chargeId) {
            const crypto = require('crypto');
            const idempKey = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
            const headers = { 'Idempotency-Key': idempKey };
            if (success) {
                await axios.post(`${MANAGER_URL}/credits/commit`, { chargeId }, { headers }).catch(() => {});
            } else {
                await axios.post(`${MANAGER_URL}/credits/cancel`, { chargeId }, { headers }).catch(() => {});
            }
        }
    } catch (e) {
        console.warn('Credits commit/cancel failed:', e.message);
    }

    res.json({ received: true });
});

// Entitled asset delivery (validates entitlement token and streams JSON)
app.get('/entitled/animation', async (req, res) => {
    try {
        const token = String(req.query.token || '');
        const file = String(req.query.file || '');
        if (!token || !file) return res.status(400).json({ error: 'Missing token or file' });

        // basic filename validation (no traversal)
        if (!/^[A-Za-z0-9_.\-]+\.json$/.test(file)) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        // Verify HMAC-SHA256 JWT-like token issued by credits-api
        const secret = process.env.CREDITS_SIGNING_KEY || 'dev-signing-key';
        const parts = token.split('.');
        if (parts.length !== 3) return res.status(403).json({ error: 'Invalid token' });
        const [h, p, s] = parts;
        const base64urlToBuffer = (str) => {
            const pad = str.length % 4 === 2 ? '==' : (str.length % 4 === 3 ? '=' : '');
            const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
            return Buffer.from(b64, 'base64');
        };
        const crypto = require('crypto');
        const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
        const sigIncoming = base64urlToBuffer(s);
        if (!crypto.timingSafeEqual(sig, sigIncoming)) return res.status(403).json({ error: 'Bad signature' });
        const payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        const nowSec = Math.floor(Date.now() / 1000);
        if (!payload || !payload.exp || payload.exp < nowSec) return res.status(403).json({ error: 'Token expired' });
        if (payload.sku && payload.sku !== file) return res.status(403).json({ error: 'SKU mismatch' });

        const path = require('path');
        const fs = require('fs');
        const fullPath = path.join(__dirname, 'lottie_library', 'animations', file);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Not found' });
        const buf = await fs.promises.readFile(fullPath);
        if (payload.assetHash) {
            const hash = crypto.createHash('sha256').update(buf).digest('hex');
            if (hash !== payload.assetHash) return res.status(409).json({ error: 'Asset hash mismatch' });
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.send(buf);
    } catch (e) {
        console.error('Entitled fetch error:', e.message);
        return res.status(400).json({ error: 'Invalid request' });
    }
});

// Check for active imports for a thread
app.get('/active-imports/:threadId', (req, res) => {
    const { threadId } = req.params;
    const importData = activeImports.get(threadId);

    if (importData) {
        res.json({
            active: true,
            ...importData,
            duration: Date.now() - importData.startTime
        });
    } else {
        res.json({ active: false });
    }
});

// Get all active imports
app.get('/active-imports', (req, res) => {
    const imports = {};
    for (const [threadId, data] of activeImports.entries()) {
        imports[threadId] = {
            ...data,
            duration: Date.now() - data.startTime
        };
    }
    res.json(imports);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current project data if available
    if (currentProjectData) {
        socket.emit('project_data', { projectData: currentProjectData });
    }

    // Handle project data updates
    socket.on('update_project_data', async (data) => {
        console.log('Received project data update from client:', socket.id);

        if (!data) {
            console.error('Received empty data object from client:', socket.id);
            socket.emit('error', { message: 'Empty data received' });
            return;
        }

        if (!data.projectData) {
            console.error('Received data without projectData from client:', socket.id);
            socket.emit('error', { message: 'No project data provided' });
            return;
        }

        // Log some basic info about the received data
        const summary = data.projectData.summary || {};
        console.log(`Project data summary: ${summary.totalItems || 0} items, ${summary.compositions || 0} compositions`);

        // Store the current project data
        currentProjectData = data.projectData;

        // Use the provided project name or default
        const projectName = data.projectName || currentProjectName;
        if (data.projectName) {
            currentProjectName = data.projectName;
        }

        // Save to database
        try {
            console.log(`Saving project data to database (project: ${projectName})...`);
            const result = db.saveProjectData(projectName, data.projectData);
            console.log(`Project data saved successfully (ID: ${result.projectId}, Version: ${result.version})`);

            // Create response object
            const responseData = {
                success: true,
                projectData: data.projectData,
                projectId: result.projectId,
                version: result.version,
                timestamp: new Date().toISOString(),
                message: `Saved ${data.projectData.items ? data.projectData.items.length : 0} items to database`
            };

            // Send confirmation back to the sender using both events for compatibility
            // First use the MyAEPScannerExtension style event
            console.log(`Sending save confirmation to client: ${socket.id}`);
            socket.emit('projectDataSaved', responseData.message);

            // Also use the PAMA style event for backward compatibility
            socket.emit('project_data_updated', responseData);

            // Also broadcast to all other clients
            socket.broadcast.emit('project_data_updated', responseData);
        } catch (error) {
            console.error('Error saving project data:', error);

            // Send error back to client
            socket.emit('error', {
                message: 'Failed to save project data',
                details: error.message
            });
        }
    });

    // Handle user commands
    socket.on('user_command', async (data) => {
        console.log('=== RECEIVED SOCKET COMMAND ===');
        console.log('Prompt:', data.prompt);
        console.log('ExtendScript Mode:', data.extendScriptMode);
        console.log('Data:', JSON.stringify(data));

        if (!data.prompt) {
            socket.emit('error', { message: 'No prompt provided' });
            return;
        }

        try {
            const { prompt, projectName, extendScriptMode, threadId } = data;

            // Use the provided project name or default to 'AEProject'
            const currentProjectName = projectName || 'AEProject';
            console.log('Using project name for context:', currentProjectName);

            // Track import if this looks like an animation import request
            if (threadId && (prompt.toLowerCase().includes('import') || prompt.toLowerCase().includes('animation'))) {
                activeImports.set(threadId, {
                    startTime: Date.now(),
                    query: prompt,
                    status: 'active',
                    socketId: socket.id
                });
                console.log('Tracking import for thread:', threadId);
            }

            // Start the agent loop, with callbacks for streaming responses
            await agent.runAgent(prompt, {
                onPartialResponse: (content) => {
                    socket.emit('partial_response', { content });
                },
                onFinalResponse: (content, metadata) => {
                    console.log('=== SENDING FINAL RESPONSE ===');
                    console.log('Content:', content);
                    console.log('Metadata:', metadata);
                    socket.emit('final_response', { content, ...metadata });

                    // If this was an import that completed, remove from tracking
                    if (threadId && activeImports.has(threadId)) {
                        activeImports.delete(threadId);
                        console.log('Import completed for thread:', threadId);
                    }
                },
                onPlanSteps: (steps) => {
                    socket.emit('plan_steps', { steps });
                },
                onPreviewImages: (before, after) => {
                    socket.emit('preview_images', { before, after });
                }
            }, currentProjectName, { extendScriptMode });
        } catch (error) {
            console.error('Error processing socket command:', error);
            socket.emit('error', { message: error.message });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Initialize search components
async function initializeServer() {
    // Initialize memory database
    try {
        await setupMemoryDB();
        console.log('Memory database initialized successfully.');
    } catch (error) {
        console.error('Failed to initialize memory database:', error.message);
        console.error('Conversation history and memory features will not be available.');
    }

    // Initialize search components
    try {
        await search.loadSearchComponents();
        console.log('Search components initialized successfully.');
    } catch (error) {
        console.warn('Failed to initialize search components:', error.message);
        console.warn('Advanced Lottie search will not be available. Run build-index.js first.');
    }
}

// Start the server
const PORT = process.env.PORT || 8321;
server.listen(PORT, async () => {
    console.log(`PAMA Server running on port ${PORT}`);
    await initializeServer();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    db.closeDatabase();
    process.exit(0);
});

module.exports = { app, server };
