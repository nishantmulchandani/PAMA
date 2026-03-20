// server/search.js

const fs = require('fs/promises');
const path = require('path');
const { pipeline } = require('@xenova/transformers');
const FlexSearch = require('flexsearch');
const usearch = require('usearch'); // For HNSW index

// --- Configuration ---
const DATA_DIR = path.join(__dirname, './data');
const HNSW_INDEX_PATH = path.join(DATA_DIR, 'lottie_hnsw_index.bin');
const KEYWORD_INDEX_PATH = path.join(DATA_DIR, 'lottie_keyword_index.json');
const FILENAME_MAP_PATH = path.join(DATA_DIR, 'lottie_filename_map.json');

// Recommended embedding model for semantic similarity
const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5'; // Output dimension 384
const EMBEDDING_DIMENSIONS = 384;
const BGE_QUERY_INSTRUCTION = 'Represent this sentence for searching relevant passages: '; // Crucial for BGE models

// RRF constant
const RRF_K = 60;

let hnswIndex = null;
let keywordIndex = null;
let filenameMap = null;
let extractor = null;

/**
 * Loads all necessary search indices and the embedding model.
 * This function should be called once during application startup.
 */
async function loadSearchComponents() {
    console.log('Loading search components...');

    try {
        // Load HNSW index
        hnswIndex = new usearch.Index({
            dimensions: EMBEDDING_DIMENSIONS,
            metric: 'ip',
            connectivity: 16, // Max number of connections per node (M parameter in HNSW)
            expansion_add: 5, // Search expansion factor during index construction (efConstruction)
        });
        await hnswIndex.load(HNSW_INDEX_PATH);
        console.log(`HNSW Index loaded with ${hnswIndex.size()} vectors.`);

        // Load FlexSearch keyword index
        const keywordIndexData = JSON.parse(await fs.readFile(KEYWORD_INDEX_PATH, 'utf8'));
        keywordIndex = new FlexSearch.Document({
            document: {
                id: 'id',
                index: 'text',
            },
            preset: 'match',
        });

        // Handle both exported FlexSearch index and backup structure
        if (keywordIndexData.type === 'backup') {
            console.log('Loading backup keyword index...');
            // Rebuild index from backup data
            keywordIndexData.prompts.forEach(prompt => {
                keywordIndex.add({
                    id: prompt.id,
                    text: prompt.text,
                });
            });
        } else {
            keywordIndex.import(keywordIndexData);
        }
        console.log('Keyword Index loaded.');

        // Load filename mapping
        filenameMap = JSON.parse(await fs.readFile(FILENAME_MAP_PATH, 'utf8'));
        console.log(`Filename map loaded with ${Object.keys(filenameMap).length} entries.`);

        // Initialize embedding pipeline
        extractor = await pipeline('feature-extraction', EMBEDDING_MODEL);
        console.log('Embedding model initialized.');

        console.log('All search components loaded successfully.');
    } catch (error) {
        console.error('Failed to load search components:', error);
        // Depending on the application, you might want to exit or provide a fallback
        throw error;
    }
}

/**
 * Performs a hybrid search for Lottie animations using semantic and keyword matching,
 * then fuses results with Reciprocal Rank Fusion (RRF).
 * @param {string} query The user's search query.
 * @param {number} top_k The number of top results to return.
 * @returns {Promise<string[]>} An ordered list of top_k animation filenames.
 */
async function findBestAnimation(query, top_k = 5) {
    if (!hnswIndex || !keywordIndex || !filenameMap || !extractor) {
        console.error('Search components not loaded. Call loadSearchComponents() first.');
        throw new Error('Search components not initialized.');
    }

    // Determine how many candidates to retrieve from each search method
    // This is crucial for RRF to have a rich pool of candidates
    const candidates_k = top_k * 10; // Retrieve more candidates than final top_k

    // --- 1. Perform Dense Vector Search ---
    const queryWithInstruction = BGE_QUERY_INSTRUCTION + query; // Apply query instruction
    const queryEmbeddingOutput = await extractor([queryWithInstruction], { pooling: 'mean', normalize: true });
    const queryEmbeddingArray = queryEmbeddingOutput.tolist();

    // For single query, extract the first (and only) embedding
    const singleQueryEmbedding = Array.isArray(queryEmbeddingArray[0]) ? queryEmbeddingArray[0] : queryEmbeddingArray;
    console.log('Query embedding dimensions:', singleQueryEmbedding.length);
    const queryEmbedding = new Float32Array(singleQueryEmbedding);

    // Search HNSW index
    const denseResults = hnswIndex.search(queryEmbedding, candidates_k, {
        expansion_search: 3 // efSearch parameter for HNSW
    });

    // Map dense results to animation filenames and assign ranks
    const denseRankedResults = [];
    if (denseResults.keys) {
        // Convert BigUint64Array to regular array and process
        const keysArray = Array.from(denseResults.keys);
        for (let i = 0; i < keysArray.length; i++) {
            const id = Number(keysArray[i]);
            const filename = filenameMap[id];
            if (filename) {
                denseRankedResults.push({
                    id: id,
                    filename: filename,
                    rank: i + 1,
                });
            }
        }
    }

    // --- 2. Perform Keyword Search ---
    const keywordSearchResults = keywordIndex.search(query, candidates_k, {
        enrich: true, // Return full document objects
        // Passing a limit here is important to control the number of candidates for RRF
        limit: candidates_k,
    });

    // FlexSearch's search results are already ranked by relevance
    const keywordRankedResults = keywordSearchResults?.result?.map((item, index) => ({
        id: item.id,
        filename: filenameMap[item.id],
        rank: index + 1, // Ranks start from 1
    })) || [];

    // --- 3. Apply Reciprocal Rank Fusion (RRF) ---
    const rrfScores = {};

    // Process dense search results
    denseRankedResults.forEach(result => {
        if (result.filename) {
            const rrfScore = 1 / (result.rank + RRF_K);
            rrfScores[result.filename] = (rrfScores[result.filename] || 0) + rrfScore;
        }
    });

    // Process keyword search results
    keywordRankedResults.forEach(result => {
        if (result.filename) {
            const rrfScore = 1 / (result.rank + RRF_K);
            rrfScores[result.filename] = (rrfScores[result.filename] || 0) + rrfScore;
        }
    });

    // --- 4. Sort by RRF scores and return top_k results ---
    const sortedResults = Object.entries(rrfScores)
        .map(([filename, score]) => ({ filename, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, top_k)
        .map(result => result.filename);

    return sortedResults;
}

/**
 * Simple keyword-only search fallback
 * @param {string} query The user's search query.
 * @param {number} top_k The number of top results to return.
 * @returns {Promise<string[]>} An ordered list of top_k animation filenames.
 */
async function keywordOnlySearch(query, top_k = 5) {
    if (!keywordIndex || !filenameMap) {
        throw new Error('Search components not initialized.');
    }

    const keywordSearchResults = keywordIndex.search(query, top_k, {
        enrich: true,
        limit: top_k,
    });

    return keywordSearchResults?.result?.map(item => filenameMap[item.id]).filter(Boolean) || [];
}

module.exports = {
    loadSearchComponents,
    findBestAnimation,
    keywordOnlySearch
};
