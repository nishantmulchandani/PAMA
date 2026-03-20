const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const config = require('./config');

// Path to SQLite database file
const DB_PATH = path.join(__dirname, '../pama_memory.db');

// Database connection
let db = null;

/**
 * Initialize the SQLite database and create tables if they don't exist
 */
function setupMemoryDB() {
  return new Promise((resolve, reject) => {
    // Create or open the database
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      
      console.log('Connected to SQLite database');
      
      // Create memory tables if they don't exist
      db.serialize(() => {
        // Scene memory table for storing project elements with embeddings
        db.run(`
          CREATE TABLE IF NOT EXISTS SceneMemory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            embedding BLOB,
            source_type TEXT,
            source_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            console.error('Error creating SceneMemory table:', err);
            reject(err);
            return;
          }
          
          // Conversation history table
          db.run(`
            CREATE TABLE IF NOT EXISTS ConversationHistory (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `, (err) => {
            if (err) {
              console.error('Error creating ConversationHistory table:', err);
              reject(err);
              return;
            }
            
            console.log('Database tables created successfully');
            resolve();
          });
        });
      });
    });
  });
}

/**
 * Get an embedding vector for text using Kluster API
 * @param {string} text - Text to get embedding for
 * @returns {Promise<number[]>} - Embedding vector
 */
async function getEmbedding(text) {
  // LLM connections have been disconnected in offline mode
  console.log('Offline mode: Skipping embedding API call');
  return null;
}

/**
 * Store a memory item with its embedding in the database
 * @param {string} description - Text description of the memory item
 * @param {string} sourceType - Type of source (comp, layer, footage, etc.)
 * @param {string} sourceId - ID of the source
 */
async function storeMemory(description, sourceType, sourceId) {
  try {
    // Get embedding for the description
    const embedding = await getEmbedding(description);
    
    if (!embedding) {
      console.error('Failed to get embedding for memory item');
      return;
    }
    
    // Store as binary blob or JSON string
    const embeddingBlob = Buffer.from(JSON.stringify(embedding));
    
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO SceneMemory (description, embedding, source_type, source_id) 
         VALUES (?, ?, ?, ?)`,
        [description, embeddingBlob, sourceType, sourceId],
        function(err) {
          if (err) {
            console.error('Error storing memory:', err);
            reject(err);
            return;
          }
          
          console.log(`Memory stored with ID ${this.lastID}`);
          resolve(this.lastID);
        }
      );
    });
  } catch (error) {
    console.error('Error in storeMemory:', error);
    throw error;
  }
}

/**
 * Get relevant memories based on a query embedding
 * @param {string} query - User query to get relevant memories for
 * @param {number} limit - Maximum number of memories to retrieve
 * @returns {Promise<Array>} - Array of relevant memories
 */
async function getRelevantMemories(query, limit = 5) {
  try {
    // Get embedding for the query
    const queryEmbedding = await getEmbedding(query);
    
    if (!queryEmbedding) {
      console.error('Failed to get embedding for query');
      return [];
    }
    
    // Retrieve all memories from database
    return new Promise((resolve, reject) => {
      db.all('SELECT id, description, embedding, source_type, source_id FROM SceneMemory', [], (err, rows) => {
        if (err) {
          console.error('Error retrieving memories:', err);
          reject(err);
          return;
        }
        
        // Calculate similarity between query and each memory
        const memoriesWithSimilarity = rows.map(row => {
          try {
            // Parse the embedding from blob
            const embedding = JSON.parse(row.embedding.toString());
            
            // Calculate cosine similarity
            const similarity = cosineSimilarity(queryEmbedding, embedding);
            
            return {
              id: row.id,
              description: row.description,
              sourceType: row.source_type,
              sourceId: row.source_id,
              similarity
            };
          } catch (e) {
            console.error('Error processing memory row:', e);
            return null;
          }
        }).filter(Boolean); // Remove nulls
        
        // Sort by similarity (highest first) and limit
        memoriesWithSimilarity.sort((a, b) => b.similarity - a.similarity);
        resolve(memoriesWithSimilarity.slice(0, limit));
      });
    });
  } catch (error) {
    console.error('Error in getRelevantMemories:', error);
    return [];
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} - Cosine similarity (-1 to 1)
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Process a project snapshot and generate memory items
 * @param {Object} projectData - Project snapshot data
 */
async function processProjectSnapshot(projectData) {
  if (!projectData) {
    console.log('No project data to process');
    return;
  }
  
  const { comps, footage } = projectData;
  console.log(`Processing project snapshot: ${comps?.length || 0} compositions, ${footage?.length || 0} footage items`);
  
  // For now just log the data - in a full implementation we would:
  // 1. Generate text descriptions for each comp and footage item
  // 2. Get embeddings for these descriptions
  // 3. Store in the memory database
  
  // Example: Process compositions
  if (comps && comps.length > 0) {
    for (const comp of comps) {
      console.log(`Found composition: ${comp.name}, ${comp.duration}s at ${comp.frameRate}fps, ${comp.width}x${comp.height}, ${comp.layers?.length || 0} layers`);
      
      // Process layers
      if (comp.layers && comp.layers.length > 0) {
        for (const layer of comp.layers) {
          console.log(`  - Layer: ${layer.name}, Type: ${layer.type}`);
        }
      }
    }
  }
  
  // Example: Process footage
  if (footage && footage.length > 0) {
    for (const item of footage) {
      console.log(`Found footage: ${item.name}, ${item.filePath || 'No file path'}`);
    }
  }
}

/**
 * Store a conversation message in history
 * @param {string} role - Role (user or agent)
 * @param {string} content - Message content
 */
function storeConversationMessage(role, content) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO ConversationHistory (role, content) VALUES (?, ?)',
      [role, content],
      function(err) {
        if (err) {
          console.error('Error storing conversation message:', err);
          reject(err);
          return;
        }
        
        resolve(this.lastID);
      }
    );
  });
}

/**
 * Get recent conversation history
 * @param {number} limit - Maximum number of messages to retrieve
 */
function getConversationHistory(limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT role, content, timestamp FROM ConversationHistory ORDER BY id DESC LIMIT ?',
      [limit],
      (err, rows) => {
        if (err) {
          console.error('Error retrieving conversation history:', err);
          reject(err);
          return;
        }
        
        // Return in chronological order
        resolve(rows.reverse());
      }
    );
  });
}

/**
 * Clear all memory items from the database
 */
function clearMemory() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM SceneMemory', (err) => {
      if (err) {
        console.error('Error clearing memory:', err);
        reject(err);
        return;
      }
      
      console.log('Memory cleared');
      resolve();
    });
  });
}

/**
 * Close the database connection
 */
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
        return;
      }
      
      console.log('Database connection closed');
    });
  }
}

module.exports = {
  setupMemoryDB,
  storeMemory,
  getRelevantMemories,
  processProjectSnapshot,
  storeConversationMessage,
  getConversationHistory,
  clearMemory,
  closeDatabase
}; 