/**
 * Database service for PAMA
 * Handles SQLite operations for storing project data
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure the data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize the database
const dbPath = path.join(dataDir, 'pama.db');
const db = new Database(dbPath);

// Create tables if they don't exist
function initializeDatabase() {
    // Projects table
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Project data table (stores JSON data)
    db.exec(`
        CREATE TABLE IF NOT EXISTS project_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            data TEXT,
            version INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )
    `);

    // Project items table (for faster querying of specific items)
    // Enhanced schema similar to MyAEPScannerExtension
    db.exec(`
        CREATE TABLE IF NOT EXISTS project_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            item_id TEXT,
            name TEXT,
            type TEXT,
            path TEXT,
            width INTEGER,
            height INTEGER,
            duration REAL,
            frameRate REAL,
            pixelAspect REAL,
            isVideo INTEGER,
            isImage INTEGER,
            isAudio INTEGER,
            isPSD INTEGER,
            isIllustrator INTEGER,
            parentFolder INTEGER,
            metadata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )
    `);

    // Create a table to store scan history
    db.exec(`
        CREATE TABLE IF NOT EXISTS scan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            item_count INTEGER,
            comp_count INTEGER,
            footage_count INTEGER,
            folder_count INTEGER,
            video_count INTEGER,
            image_count INTEGER,
            audio_count INTEGER,
            psd_count INTEGER,
            ai_count INTEGER,
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )
    `);

    // Auth tables (dev login)
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS licenses (
            user_id TEXT,
            license TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, license),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT,
            created_at INTEGER,
            expires_at INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Threads tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            title TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS thread_messages (
            id TEXT PRIMARY KEY,
            thread_id TEXT,
            role TEXT,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (thread_id) REFERENCES threads(id)
        )
    `);

    console.log('Database initialized successfully');
}

// Save project data
function saveProjectData(projectName, projectData) {
    // Begin transaction
    const transaction = db.transaction(() => {
        // Check if project exists
        let project = db.prepare('SELECT * FROM projects WHERE name = ?').get(projectName);

        // If project doesn't exist, create it
        if (!project) {
            const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
            const info = insertProject.run(projectName);
            project = { id: info.lastInsertRowid };
        } else {
            // Update the updated_at timestamp
            db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(project.id);
        }

        // Get the latest version number
        const latestVersion = db.prepare('SELECT MAX(version) as max_version FROM project_data WHERE project_id = ?').get(project.id);
        const newVersion = (latestVersion.max_version || 0) + 1;

        // Save the project data
        const insertData = db.prepare('INSERT INTO project_data (project_id, data, version) VALUES (?, ?, ?)');
        insertData.run(project.id, JSON.stringify(projectData), newVersion);

        // Clear existing items for this project
        db.prepare('DELETE FROM project_items WHERE project_id = ?').run(project.id);

        // Insert items for faster querying with enhanced schema
        const insertItem = db.prepare(`
            INSERT INTO project_items (
                project_id, item_id, name, type, path,
                width, height, duration, frameRate, pixelAspect,
                isVideo, isImage, isAudio, isPSD, isIllustrator,
                parentFolder, metadata
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?
            )
        `);

        // Process compositions
        if (projectData.comps && Array.isArray(projectData.comps)) {
            projectData.comps.forEach(comp => {
                insertItem.run(
                    project.id,
                    comp.id.toString(),
                    comp.name,
                    'Composition',
                    '',
                    comp.width || null,
                    comp.height || null,
                    comp.duration || null,
                    comp.frameRate || null,
                    comp.pixelAspect || null,
                    0, // isVideo
                    0, // isImage
                    0, // isAudio
                    0, // isPSD
                    0, // isIllustrator
                    0, // parentFolder
                    JSON.stringify(comp)
                );
            });
        }

        // Process items
        if (projectData.items && Array.isArray(projectData.items)) {
            projectData.items.forEach(item => {
                insertItem.run(
                    project.id,
                    item.id ? item.id.toString() : item.index.toString(),
                    item.name,
                    item.type,
                    item.filePath || '',
                    item.width || null,
                    item.height || null,
                    item.duration || null,
                    item.frameRate || null,
                    item.pixelAspect || null,
                    item.isVideo || 0,
                    item.isImage || 0,
                    item.isAudio || 0,
                    item.isPSD || 0,
                    item.isIllustrator || 0,
                    item.parentFolder || 0,
                    JSON.stringify(item)
                );
            });
        }

        // Add scan to history
        const insertScanHistory = db.prepare(`
            INSERT INTO scan_history (
                project_id, item_count, comp_count, footage_count, folder_count,
                video_count, image_count, audio_count, psd_count, ai_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Extract counts from summary or calculate them
        const summary = projectData.summary || {};
        const counts = {
            item_count: summary.totalItems || (projectData.items ? projectData.items.length : 0),
            comp_count: summary.compositions || 0,
            footage_count: 0, // Will calculate below
            folder_count: summary.folders || 0,
            video_count: summary.videos || 0,
            image_count: summary.images || 0,
            audio_count: summary.audio || 0,
            psd_count: summary.psd || 0,
            ai_count: summary.illustratorFiles || 0
        };

        // Calculate footage count if not in summary
        if (!summary.footage && projectData.items) {
            counts.footage_count = projectData.items.filter(item =>
                item.type === 'Footage' || item.type === 'Video' ||
                item.type === 'Image' || item.type === 'Audio'
            ).length;
        } else {
            counts.footage_count = summary.footage || 0;
        }

        // Insert scan history
        insertScanHistory.run(
            project.id,
            counts.item_count,
            counts.comp_count,
            counts.footage_count,
            counts.folder_count,
            counts.video_count,
            counts.image_count,
            counts.audio_count,
            counts.psd_count,
            counts.ai_count
        );

        return {
            projectId: project.id,
            version: newVersion
        };
    });

    // Execute the transaction
    return transaction();
}

// Get project data by name
function getProjectData(projectName) {
    const project = db.prepare('SELECT * FROM projects WHERE name = ?').get(projectName);
    if (!project) {
        return null;
    }

    const data = db.prepare(`
        SELECT * FROM project_data
        WHERE project_id = ?
        ORDER BY version DESC
        LIMIT 1
    `).get(project.id);

    if (!data) {
        return null;
    }

    return {
        project,
        data: JSON.parse(data.data),
        version: data.version
    };
}

// Get all projects
function getAllProjects() {
    return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
}

// Get project history (all versions)
function getProjectHistory(projectName) {
    const project = db.prepare('SELECT * FROM projects WHERE name = ?').get(projectName);
    if (!project) {
        return [];
    }

    return db.prepare(`
        SELECT id, version, created_at
        FROM project_data
        WHERE project_id = ?
        ORDER BY version DESC
    `).all(project.id);
}

// Get specific version of project data
function getProjectVersion(projectName, version) {
    const project = db.prepare('SELECT * FROM projects WHERE name = ?').get(projectName);
    if (!project) {
        return null;
    }

    const data = db.prepare(`
        SELECT * FROM project_data
        WHERE project_id = ? AND version = ?
    `).get(project.id, version);

    if (!data) {
        return null;
    }

    return {
        project,
        data: JSON.parse(data.data),
        version: data.version
    };
}

// Search for items in projects
function searchProjectItems(query) {
    return db.prepare(`
        SELECT pi.*, p.name as project_name
        FROM project_items pi
        JOIN projects p ON pi.project_id = p.id
        WHERE pi.name LIKE ? OR pi.type LIKE ?
        ORDER BY pi.name
        LIMIT 100
    `).all(`%${query}%`, `%${query}%`);
}

// Close the database when the application exits
function closeDatabase() {
    db.close();
}

// Initialize the database on module load
initializeDatabase();

// --- Auth (dev) ---
function upsertUser(userId, name) {
    db.prepare(`INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)`)
      .run(userId, name || userId);
    return db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
}

function createSession(userId, ttlMs = 7 * 24 * 60 * 60 * 1000) {
    const token = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
      .run(token, userId, now, now + ttlMs);
    return { token };
}

function getSession(token) {
    const row = db.prepare(`SELECT * FROM sessions WHERE token = ?`).get(token);
    if (!row) return null;
    if (row.expires_at && row.expires_at < Date.now()) return null;
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(row.user_id);
    return user ? { token, user } : null;
}

function deleteSession(token) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

// --- Threads ---
function createThread(id, userId, title) {
    db.prepare(`INSERT INTO threads (id, user_id, title) VALUES (?, ?, ?)`)
      .run(id, userId, title || 'New Animation Chat');
    return db.prepare(`SELECT * FROM threads WHERE id = ?`).get(id);
}

function listThreads(userId) {
    return db.prepare(`
      SELECT t.id, t.title, t.updated_at,
             (SELECT substr(m.content,1,60) FROM thread_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
      FROM threads t
      WHERE t.user_id = ?
      ORDER BY t.updated_at DESC
    `).all(userId);
}

function getThreadMessages(threadId) {
    return db.prepare(`SELECT id, role, content, created_at FROM thread_messages WHERE thread_id = ? ORDER BY created_at ASC`).all(threadId);
}

function addThreadMessage(id, threadId, role, content) {
    db.prepare(`INSERT INTO thread_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)`)
      .run(id, threadId, role, content);
    db.prepare(`UPDATE threads SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(threadId);
}

function updateThreadTitle(threadId, title) {
    db.prepare(`UPDATE threads SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(title, threadId);
}

module.exports = {
    saveProjectData,
    getProjectData,
    getAllProjects,
    getProjectHistory,
    getProjectVersion,
    searchProjectItems,
    closeDatabase,
    // auth
    upsertUser,
    createSession,
    getSession,
    deleteSession,
    // threads
    createThread,
    listThreads,
    getThreadMessages,
    addThreadMessage,
    updateThreadTitle
};
