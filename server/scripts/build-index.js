// server/scripts/build-index.js

const fs = require('fs/promises');
const path = require('path');
const { pipeline } = require('@xenova/transformers');
const FlexSearch = require('flexsearch');
const usearch = require('usearch'); // For HNSW index

// --- Configuration ---
const PROMPTS_DIR = path.join(__dirname, '../lottie_library/prompts');
const DATA_DIR = path.join(__dirname, '../data');
const HNSW_INDEX_PATH = path.join(DATA_DIR, 'lottie_hnsw_index.bin');
const KEYWORD_INDEX_PATH = path.join(DATA_DIR, 'lottie_keyword_index.json');
const FILENAME_MAP_PATH = path.join(DATA_DIR, 'lottie_filename_map.json');

// Recommended embedding model for semantic similarity
const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5'; // Output dimension 384
const EMBEDDING_DIMENSIONS = 384;

async function buildIndex() {
    console.log('Starting index build process...');

    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });

    // 1. Initialize embedding pipeline
    console.log(`Loading embedding model: ${EMBEDDING_MODEL}...`);
    const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL);
    console.log('Embedding model loaded.');

    // 2. Initialize FlexSearch (keyword index)
    // FlexSearch.Document is used for document-based indexing, allowing association with IDs
    const keywordIndex = new FlexSearch.Document({
        document: {
            id: 'id', // This will be our internal numeric ID
            index: 'text', // The field to index for keyword search
        },
        // Optimize for speed and space for a large number of documents
        preset: 'match', // 'match' for better relevance, 'fast' for pure speed
    });

    // 3. Initialize USearch (HNSW index)
    // 'ip' (inner product) metric is equivalent to cosine similarity for normalized vectors
    const hnswIndex = new usearch.Index({
        dimensions: EMBEDDING_DIMENSIONS,
        metric: 'ip', // Inner Product for cosine similarity with normalized vectors
        connectivity: 16, // Max number of connections per node (M parameter in HNSW)
        expansion_add: 5, // Search expansion factor during index construction (efConstruction)
        // quantization: 'f32', // Default, can be 'f16' for smaller index size
    });

    const prompts = [];
    const filenameMap = {}; // Maps internal ID to original Lottie filename
    let currentId = 0;

    // Read all prompt files
    console.log(`Reading prompts from ${PROMPTS_DIR}...`);
    const files = await fs.readdir(PROMPTS_DIR);

    for (const file of files) {
        if (file.endsWith('.txt')) {
            const filePath = path.join(PROMPTS_DIR, file);
            // Extract the number from filename like "0001_prompt.txt" -> "0001_Agricultural Income.json"
            const fileNumber = file.match(/(\d+)_prompt\.txt/)?.[1];
            if (!fileNumber) continue;
            
            const animationFilename = `${fileNumber}_${await getAnimationName(fileNumber)}.json`;
            const text = await fs.readFile(filePath, 'utf8');

            prompts.push({
                id: currentId,
                filename: animationFilename,
                text: text,
            });
            filenameMap[currentId] = animationFilename; // Store mapping

            // Add to FlexSearch keyword index
            keywordIndex.add({
                id: currentId,
                text: text,
            });

            currentId++;
        }
    }
    console.log(`Read ${prompts.length} prompts.`);

    // 4. Generate dense embeddings and add to HNSW index
    console.log('Generating dense embeddings and building HNSW index...');
    const batchSize = 64; // Process in batches to manage memory and performance
    for (let i = 0; i < prompts.length; i += batchSize) {
        const batch = prompts.slice(i, i + batchSize);
        const texts = batch.map(p => p.text);

        // Generate embeddings for the batch
        // For document/passage embedding, no special 'query instruction' is needed for BGE models
        const embeddingsOutput = await extractor(texts, { pooling: 'mean', normalize: true });
        const embeddings = embeddingsOutput.tolist(); // Convert to standard array of arrays

        // Add embeddings to HNSW index
        for (let j = 0; j < batch.length; j++) {
            const prompt = batch[j];
            const embedding = new Float32Array(embeddings[j]); // usearch expects Float32Array
            hnswIndex.add(BigInt(prompt.id), embedding); // usearch keys are BigInt
        }
        process.stdout.write(`Processed ${Math.min(i + batchSize, prompts.length)}/${prompts.length} embeddings.\r`);
    }
    console.log('\nDense embeddings generated and HNSW index built.');

    // 5. Save indices and mapping
    console.log('Saving indices and filename map...');
    await hnswIndex.save(HNSW_INDEX_PATH);

    // Export FlexSearch index with proper error handling
    try {
        const exportedIndex = keywordIndex.export();
        await fs.writeFile(KEYWORD_INDEX_PATH, JSON.stringify(exportedIndex), 'utf8');
    } catch (error) {
        console.error('Error exporting FlexSearch index:', error);
        // Create a simple backup index structure
        const backupIndex = {
            prompts: prompts,
            type: 'backup'
        };
        await fs.writeFile(KEYWORD_INDEX_PATH, JSON.stringify(backupIndex), 'utf8');
        console.log('Saved backup index structure instead.');
    }

    await fs.writeFile(FILENAME_MAP_PATH, JSON.stringify(filenameMap), 'utf8');
    console.log('Indices and filename map saved successfully.');

    console.log('Index build process completed.');
}

// Helper function to get animation name from the corresponding JSON file
async function getAnimationName(fileNumber) {
    const animationsDir = path.join(__dirname, '../lottie_library/animations');
    const files = await fs.readdir(animationsDir);

    // Find the corresponding animation file
    const animationFile = files.find(file => file.startsWith(fileNumber + '_'));
    if (animationFile) {
        // Extract name from filename like "0001_Agricultural Income.json" -> "Agricultural Income"
        return animationFile.replace(`${fileNumber}_`, '').replace('.json', '');
    }
    return 'Unknown';
}

buildIndex().catch(error => {
    console.error('Error during index build:', error);
    process.exit(1);
});
