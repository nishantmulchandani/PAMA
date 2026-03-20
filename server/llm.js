/**
 * LLM Integration for PAMA
 * Handles communication with the LLM service
 */

const db = require('./database');

// Mock LLM function for now - in a real implementation, this would call an actual LLM API
async function processCommand(prompt, projectData) {
    console.log('Processing command with LLM:', prompt);
    console.log('Project data available:', !!projectData);

    // In a real implementation, this would send the prompt and project data to an LLM API
    // For now, we'll create a more detailed mock response that demonstrates file awareness

    let response = `I received your command: "${prompt}"\n\n`;

    if (projectData) {
        // Project summary
        response += `Your After Effects project contains:\n`;
        response += `- ${projectData.summary.totalItems || 'Unknown number of'} total items\n`;
        response += `- ${projectData.summary.compositions || 0} compositions\n`;

        // File type breakdown
        if (projectData.fileTypes) {
            response += `\nFile types in your project:\n`;
            if (projectData.fileTypes.video > 0) response += `- ${projectData.fileTypes.video} video files\n`;
            if (projectData.fileTypes.image > 0) response += `- ${projectData.fileTypes.image} image files\n`;
            if (projectData.fileTypes.audio > 0) response += `- ${projectData.fileTypes.audio} audio files\n`;
            if (projectData.fileTypes.psd > 0) response += `- ${projectData.fileTypes.psd} Photoshop files\n`;
            if (projectData.fileTypes.illustrator > 0) response += `- ${projectData.fileTypes.illustrator} Illustrator files\n`;
            if (projectData.fileTypes.other > 0) response += `- ${projectData.fileTypes.other} other footage files\n`;
        }

        // Composition details
        if (projectData.compositions && projectData.compositions.length > 0) {
            response += `\nMain compositions:\n`;
            projectData.compositions.slice(0, 3).forEach(comp => {
                response += `- "${comp.name}" (${comp.width}x${comp.height}, ${comp.duration.toFixed(2)}s at ${comp.frameRate}fps)\n`;
            });

            if (projectData.compositions.length > 3) {
                response += `- ...and ${projectData.compositions.length - 3} more compositions\n`;
            }
        }

        // File paths (limited sample)
        if (projectData.filePaths && projectData.filePaths.length > 0) {
            response += `\nI can see the following files are used in your project (showing ${Math.min(3, projectData.filePaths.length)} of ${projectData.filePaths.length}):\n`;
            projectData.filePaths.slice(0, 3).forEach(path => {
                response += `- ${path}\n`;
            });
        }
    } else {
        response += "I don't have any information about your After Effects project. Try scanning your project first.";
    }

    // This function is now deprecated - the main agent system in agent.js handles LLM calls
    // This is only used for project data preparation
    console.log('Note: This function is deprecated. Main LLM processing is handled by agent.js');

    return {
        response: response,
        planSteps: [
            'Analyzed project structure',
            'Identified compositions and assets',
            'Processed file paths and metadata',
            'Generated response based on project context'
        ]
    };
}

// Function to prepare project data for the LLM
function prepareProjectDataForLLM(projectData) {
    if (!projectData) return null;

    // Create a comprehensive version of the project data for the LLM
    // This ensures the LLM has full awareness of project files and structure
    const enhancedData = {
        summary: projectData.summary || {},
        compositions: [],
        footage: [],
        fileTypes: {}, // Will contain counts of different file types
        filePaths: []  // Will contain all file paths for context
    };

    // Add composition data with more details
    if (projectData.comps && Array.isArray(projectData.comps)) {
        enhancedData.compositions = projectData.comps.map(comp => ({
            id: comp.id,
            name: comp.name,
            duration: comp.duration,
            frameRate: comp.frameRate,
            width: comp.width,
            height: comp.height,
            layerCount: comp.layers ? comp.layers.length : 0,
            // Include more detailed layer information
            layers: comp.layers ? comp.layers.map(layer => ({
                name: layer.name,
                type: layer.type,
                index: layer.index,
                inPoint: layer.inPoint,
                outPoint: layer.outPoint,
                isVisible: layer.isVisible,
                source: layer.source
            })) : []
        }));
    }

    // Add footage data with file paths
    if (projectData.footage && Array.isArray(projectData.footage)) {
        enhancedData.footage = projectData.footage.map(item => ({
            id: item.id,
            name: item.name,
            type: item.itemType || item.type,
            filePath: item.filePath,
            fileType: item.fileType,
            width: item.width,
            height: item.height,
            duration: item.duration,
            frameRate: item.frameRate
        }));

        // Collect file paths for context
        projectData.footage.forEach(item => {
            if (item.filePath) {
                enhancedData.filePaths.push(item.filePath);
            }
        });
    }

    // Process all items to build file type statistics and collect all file paths
    if (projectData.items && Array.isArray(projectData.items)) {
        // Initialize file type counters
        const fileTypes = {
            video: 0,
            image: 0,
            audio: 0,
            psd: 0,
            illustrator: 0,
            other: 0
        };

        // Process each item
        projectData.items.forEach(item => {
            // Count file types
            if (item.isVideo) fileTypes.video++;
            else if (item.isImage) fileTypes.image++;
            else if (item.isAudio) fileTypes.audio++;
            else if (item.isPSD) fileTypes.psd++;
            else if (item.isIllustrator) fileTypes.illustrator++;
            else if (item.type === 'Footage') fileTypes.other++;

            // Collect file paths
            if (item.filePath && !enhancedData.filePaths.includes(item.filePath)) {
                enhancedData.filePaths.push(item.filePath);
            }
        });

        enhancedData.fileTypes = fileTypes;
    }

    return enhancedData;
}

// Function to get project data and process a command
async function processUserCommand(prompt, projectName) {
    try {
        // Get the latest project data from the database
        const projectData = db.getProjectData(projectName);

        // If we have project data, prepare it for the LLM
        const llmProjectData = projectData ? prepareProjectDataForLLM(projectData.data) : null;

        // Process the command with the LLM
        return await processCommand(prompt, llmProjectData);
    } catch (error) {
        console.error('Error processing user command:', error);
        throw error;
    }
}

module.exports = {
    processCommand,
    prepareProjectDataForLLM,
    processUserCommand
};
