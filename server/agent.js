const axios = require('axios');
const { getRelevantMemories, storeConversationMessage, getConversationHistory } = require('./memory');
const config = require('./config');
const db = require('./database');
const llm = require('./llm');
const search = require('./search');

// System prompt used for the agent
const SYSTEM_PROMPT = `You are PAMA, an After Effects assistant with project awareness and animation library access.

CORE CAPABILITIES:
- Access to user's AE project data (comps, footage, layers, structure)
- Library of 1,947+ Lottie animations with direct import
- Context-aware responses using project specifics

RESPONSE STYLE:
- Concise and direct - no unnecessary explanations
- Skip flattery ("great question", "excellent", etc.)
- Use natural conversation, avoid lists in casual chat
- Give one question max per response
- Match response length to query complexity

ANIMATION WORKFLOW:
When users need animations, provide brief suggestions then let the import system handle technical details. Animation search results appear automatically below your response.

RESTRICTIONS:
- Never generate ExtendScript code
- Never use excessive formatting or bullet points in casual conversation
- Never explain obvious processes unless asked
- Never start with positive adjectives about user's questions

Focus on being helpful while staying concise.
`;

// ExtendScript-specific system prompt
const EXTENDSCRIPT_SYSTEM_PROMPT = `You are an expert ExtendScript developer for Adobe After Effects. Your role is to generate high-quality, working ExtendScript code that automates After Effects workflows.

IMPORTANT CONTEXT: ExtendScript is Adobe's official JavaScript-based scripting language for After Effects automation. It's widely used by professionals for workflow automation, animation creation, and project management. Your code will be executed directly in After Effects to help users automate their creative work.

RESPONSE FORMAT REQUIREMENTS:
- ONLY respond with ExtendScript code - no explanations or text outside the code block
- Wrap your code in triple backticks with javascript language identifier
- Include helpful comments explaining key functionality
- Use proper ExtendScript syntax and conventions
- Focus on creating robust, error-handled solutions

EXTENDSCRIPT BEST PRACTICES:
- Use 'var' for variable declarations (not let/const)
- Access the application through 'app' object
- Use 'app.project' for project operations
- Use 'app.project.activeItem' for current composition
- Handle errors with try/catch blocks
- Use '$.writeln()' for debugging output

Your goal is to provide complete, functional ExtendScript solutions that users can immediately run in After Effects.`;

// Mock response for when the API is unavailable
const MOCK_RESPONSE = {
  generateMockResponse: function(userPrompt) {
    return `PLAN:
- Understand user request: "${userPrompt}"
- Create properly structured ExtendScript code with complete syntax
- Include helpful comments for maintainability
- Verify all braces, parentheses, and semicolons match

CODE:
\`\`\`javascript
/**
 * After Effects Script: Response to "${userPrompt}"
 * ================================================
 * This script automatically handles the requested functionality.
 * All code has been carefully written with proper syntax and structure.
 */

// Main function to ensure proper scope
function main() {
  // Get the active composition
  var activeComp = app.project.activeItem;

  // Check if a composition is selected
  if (!activeComp || !(activeComp instanceof CompItem)) {
    alert("Please select or open a composition first");
    return;
  }

  // Create a new text layer
  var textLayer = activeComp.layers.addText("PAMA Response");

  // Store original position for reference
  var centerPosition = [activeComp.width/2, activeComp.height/2];

  // Position the text layer in the center of composition
  textLayer.position.setValue(centerPosition);

  // Set text content from user prompt
  var textDocument = new TextDocument("Response to: " + "${userPrompt}");
  textLayer.property("Source Text").setValue(textDocument);

  // Optional: Add simple animation
  var startTime = textLayer.inPoint;
  var endTime = textLayer.inPoint + 1; // 1 second animation

  // Set keyframes for opacity
  var opacityProperty = textLayer.property("Transform").property("Opacity");
  opacityProperty.setValueAtTime(startTime, 0);
  opacityProperty.setValueAtTime(endTime, 100);

  // Set keyframes for position (slight movement)
  var positionProperty = textLayer.property("Transform").property("Position");
  positionProperty.setValueAtTime(startTime, [centerPosition[0], centerPosition[1] + 50]);
  positionProperty.setValueAtTime(endTime, centerPosition);

  // Alert the user when complete
  alert("Action completed successfully!");
}

// Execute the main function
main();
\`\`\`

EXPLANATION:
This ExtendScript code creates a text layer in the active composition containing your request. It adds simple fade-in and movement animations and positions the text in the center of the composition. The code is carefully structured with proper syntax, complete error checking, and detailed comments for clarity.`;
  }
};

// Max retries for the planner-executor-critic loop
const MAX_RETRIES = 3;

/**
 * Main agent function that implements the Planner-Executor-Critic loop
 * @param {string} userPrompt - User prompt to process
 * @param {Object} callbacks - Optional callbacks for streaming responses and updates
 * @param {string} projectName - Name of the project to use for context (optional)
 * @returns {Promise<Object>} - Final response and metadata
 */
async function runAgent(userPrompt, callbacks = {}, projectName = 'AEProject', options = {}) {
  try {
    console.log('Starting agent run for prompt:', userPrompt);
    console.log('ExtendScript mode:', options.extendScriptMode);

    // Store user message
    await storeConversationMessage('user', userPrompt);

    // Initialize state
    let success = false;
    let retryCount = 0;
    let response = '';
    let errorMessage = null;
    let planSteps = [];
    let beforeImg = null;
    let afterImg = null;

    // Get relevant context from memory (skip if this is an animation search query)
    let relevantMemories = [];
    try {
      // Skip memory processing for animation-related queries to avoid embedding API calls
      if (!userPrompt.toLowerCase().includes('animation') && !userPrompt.toLowerCase().includes('animate')) {
        relevantMemories = await getRelevantMemories(userPrompt);
        console.log(`Found ${relevantMemories.length} relevant memories`);
      } else {
        console.log('Skipping memory retrieval for animation query to avoid embedding API calls');
      }
    } catch (memoryError) {
      console.log('Memory retrieval failed, continuing without memory context:', memoryError.message);
      relevantMemories = [];
    }

    // Get recent conversation history
    const conversationHistory = await getConversationHistory(5);

    // Get current project data from database using the provided project name
    const projectData = db.getProjectData(projectName);

    // Prepare project data for LLM if available
    const projectContext = projectData ? llm.prepareProjectDataForLLM(projectData.data) : null;

    // Format context from memories
    let memoryContext = relevantMemories.length > 0
      ? "Relevant project information:\n" + relevantMemories.map(mem => `- ${mem.description}`).join('\n')
      : "No specific project information is available for this query.";

    // Add project data summary if available
    if (projectContext) {
      memoryContext += "\n\nCurrent After Effects Project Data:\n";

      // Add summary statistics
      if (projectContext.summary) {
        memoryContext += `- Total Items: ${projectContext.summary.totalItems || 0}\n`;
        memoryContext += `- Compositions: ${projectContext.summary.compositions || 0}\n`;
        memoryContext += `- Videos: ${projectContext.summary.videos || 0}\n`;
        memoryContext += `- Images: ${projectContext.summary.images || 0}\n`;
        memoryContext += `- Audio: ${projectContext.summary.audio || 0}\n`;
      }

      // Add composition details
      if (projectContext.compositions && projectContext.compositions.length > 0) {
        memoryContext += "\nCompositions:\n";
        projectContext.compositions.forEach(comp => {
          memoryContext += `- ${comp.name} (${comp.width}x${comp.height}, ${comp.duration}s, ${comp.frameRate}fps, ${comp.layerCount} layers)\n`;
        });
      }

      // Add footage details (limited to first 10 for context size)
      if (projectContext.footage && projectContext.footage.length > 0) {
        const footageToShow = projectContext.footage.slice(0, 10);
        memoryContext += "\nFootage Items (first 10):\n";
        footageToShow.forEach(item => {
          memoryContext += `- ${item.name} (${item.type || 'Unknown type'})\n`;
        });

        if (projectContext.footage.length > 10) {
          memoryContext += `...and ${projectContext.footage.length - 10} more footage items\n`;
        }
      }
    }

    // Initialize animation context (for future animation-related features)
    const animationContext = '';

    // DISABLED: Server-side animation trigger detection
    // Animation search is now controlled by client-side ANIMATE toggle only
    // The server will act as a normal assistant unless explicitly told to search animations

    // OLD CODE (DISABLED):
    // const animationKeywords = ['animation', 'lottie', 'motion', 'graphic', 'visual', 'icon', 'element', 'asset', 'purchase', 'confirmation', 'display', 'people', 'person', 'character', 'talking', 'communicate'];
    // const isAnimationRequest = animationKeywords.some(keyword =>
    //   userPrompt.toLowerCase().includes(keyword)
    // );
    // if (isAnimationRequest) {
    //   console.log('Detected animation request, returning search instruction...');
    //   // Skip message and go directly to animation search interface
    //   // Send final response with animation search flag
    //   if (callbacks.onFinalResponse) {
    //     callbacks.onFinalResponse('', { isAnimationSearch: true, searchQuery: userPrompt });
    //   }
    //   return {
    //     success: true,
    //     response: '',
    //     isAnimationSearch: true,
    //     searchQuery: userPrompt
    //   };
    // }

    // Handle ExtendScript mode - generate only ExtendScript code
    console.log('Checking ExtendScript mode:', options.extendScriptMode);
    console.log('Options object:', JSON.stringify(options));

    if (options.extendScriptMode) {
      console.log('ExtendScript mode enabled - generating ExtendScript code only');

      const extendScriptResult = await generateExtendScript(
        userPrompt,
        memoryContext,
        conversationHistory,
        callbacks.onPartialResponse
      );

      // Send final response with ExtendScript code
      if (callbacks.onFinalResponse) {
        callbacks.onFinalResponse(extendScriptResult.response);
      }

      // Store agent response
      await storeConversationMessage('agent', extendScriptResult.response);

      return {
        success: true,
        response: extendScriptResult.response,
        planSteps: [],
        beforeImg: '',
        afterImg: ''
      };
    }

    // Start the planner-executor-critic loop for non-animation requests
    let planResult = null; // Declare planResult outside the loop
    while (!success && retryCount < MAX_RETRIES) {
      try {
        console.log(`Plan attempt ${retryCount + 1} of ${MAX_RETRIES}`);

        // STEP 1: PLANNER - Generate a plan using DeepSeek-R1
        planResult = await planWithLLM(
          userPrompt,
          memoryContext,
          conversationHistory,
          errorMessage,
          callbacks.onPartialResponse,
          animationContext
        );

        // Extract explanation for normal requests
        const explanation = planResult.explanation;

        // Log the response
        console.log('Generated response:', explanation);

        // STEP 2: EXECUTOR - Execute the plan (ExtendScript)
        // Currently this is a placeholder since we need to communicate with the UI to run ExtendScript
        // In practice, we'd send a message to the UI to execute this
        console.log('Requesting execution of ExtendScript code');

        // Get before image (placeholder)
        beforeImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

        // Execute logic (placeholder)
        const executionResult = {
          success: true, // Placeholder result
          error: null,
          afterImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' // Placeholder after image
        };

        if (!executionResult.success) {
          errorMessage = executionResult.error;
          throw new Error(`Execution failed: ${errorMessage}`);
        }

        // Store after image
        afterImg = executionResult.afterImage;

        // Update preview images
        if (callbacks.onPreviewImages) {
          callbacks.onPreviewImages(beforeImg, afterImg);
        }

        // STEP 3: CRITIC - Verify the execution results
        const criticResult = await criticizeWithLLM(
          userPrompt,
          [],
          executionResult
        );

        if (criticResult.approved) {
          // Plan executed successfully
          success = true;

          // Check if this is an animation search - if so, don't send any response message
          if (planResult.animationSearch) {
            response = ''; // Empty response for animation searches
          } else {
            // Use just the explanation without plan details for normal requests
            response = explanation || planResult.explanation || 'Task completed.';
          }
        } else {
          // Critic found issues, retry with feedback
          errorMessage = criticResult.message;
          throw new Error(`Critic rejected result: ${errorMessage}`);
        }
      } catch (error) {
        retryCount++;
        console.error(`Attempt ${retryCount} failed:`, error.message);

        if (retryCount >= MAX_RETRIES) {
          response = `I couldn't complete the requested task after ${MAX_RETRIES} attempts. Last error: ${error.message}`;
        } else {
          // Will retry with the error feedback
          errorMessage = error.message;
        }
      }
    }

    // Check for animation import after successful response
    // Note: Animation import functionality is handled within the planWithLLM function
    // This section is reserved for future animation import processing

    // Store agent response only if it's not empty (skip for animation searches)
    if (response && response.trim() !== '') {
      await storeConversationMessage('agent', response);
    }

    // Send final response - for animation searches, send metadata without content
    if (callbacks.onFinalResponse) {
      if (planResult && planResult.animationSearch) {
        // For animation searches, send empty content but include metadata
        callbacks.onFinalResponse('', {
          animationSearch: true,
          searchQuery: planResult.searchQuery || userPrompt
        });
      } else if (response && response.trim() !== '') {
        // For normal requests, send the response content
        callbacks.onFinalResponse(response);
      }
    }

    return {
      success,
      response,
      planSteps,
      beforeImg,
      afterImg
    };
  } catch (error) {
    console.error('Error in agent execution:', error);
    const errorResponse = `Sorry, I encountered an error: ${error.message}`;

    // Store error response
    await storeConversationMessage('agent', errorResponse);

    if (callbacks.onFinalResponse) {
      callbacks.onFinalResponse(errorResponse);
    }

    return {
      success: false,
      response: errorResponse
    };
  }
}

/**
 * Generate ExtendScript code using the LLM
 * @param {string} userPrompt - The user's prompt
 * @param {string} memoryContext - Context from memory
 * @param {Array} conversationHistory - Recent conversation history
 * @param {Function} onPartialResponse - Callback for streaming partial responses
 * @returns {Promise<Object>} - ExtendScript code response
 */
async function generateExtendScript(userPrompt, memoryContext, conversationHistory, onPartialResponse) {
  try {
    console.log('Generating ExtendScript code with LLM');

    // Construct messages for ExtendScript generation
    const messages = [
      { role: 'system', content: EXTENDSCRIPT_SYSTEM_PROMPT },
      // Add conversation history
      ...conversationHistory.map(msg => ({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.content
      })),
      // Add memory context with detailed project data
      { role: 'system', content: `Project Context: ${memoryContext}` },
      // Add the user prompt
      { role: 'user', content: userPrompt }
    ];

    // Use Kluster API
    const apiKey = config.getApiKey();

    if (!apiKey) {
      throw new Error('Missing API key. Please check your configuration.');
    }

    // API calls disabled - return fallback ExtendScript response
    console.log('ExtendScript generation requested but API calls are disabled');

    // Extract the user's request from the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const userRequest = lastUserMessage ? lastUserMessage.content : 'animation task';

    // Return a simple fallback ExtendScript template
    const fallbackScript = `// ExtendScript for: ${userRequest}
// API calls are currently disabled
// This is a placeholder script

try {
    // Get the active composition
    var comp = app.project.activeItem;

    if (comp && comp instanceof CompItem) {
        // Add a simple text layer as placeholder
        var textLayer = comp.layers.addText("PAMA: ${userRequest}");
        textLayer.property("Source Text").setValue("Task: ${userRequest}\\nAPI calls disabled");

        // Position the text in the center
        textLayer.property("Transform").property("Position").setValue([comp.width/2, comp.height/2]);

        alert("PAMA: ExtendScript executed (API calls disabled)");
    } else {
        alert("Please select a composition first");
    }
} catch (error) {
    alert("Error: " + error.toString());
}`;

    return {
      response: fallbackScript,
      success: true
    };
  } catch (error) {
    console.error('Error in generateExtendScript:', error);
    console.error('Error details:', error.message);

    // Return fallback response
    return {
      response: '```javascript\n// Error generating ExtendScript: ' + error.message + '\n// API calls are disabled\n```',
      success: false
    };
  }
}

/**
 * Generate a plan using the LLM
 * @param {string} userPrompt - The user's prompt
 * @param {string} memoryContext - Context from memory
 * @param {Array} conversationHistory - Recent conversation history
 * @param {string} errorFeedback - Error feedback from previous attempts
 * @param {Function} onPartialResponse - Callback for streaming partial responses
 * @returns {Promise<Object>} - Plan steps, code, and explanation
 */
async function planWithLLM(userPrompt, memoryContext, conversationHistory, errorFeedback, onPartialResponse, animationContext) {
  try {
    console.log('Generating plan with LLM');

    // Construct messages for the LLM
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      // Add conversation history
      ...conversationHistory.map(msg => ({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.content
      })),
      // Add memory context with detailed project data
      { role: 'system', content: `Project Context: ${memoryContext}${animationContext}` },
      // If there was an error in a previous attempt, add it as feedback
      ...(errorFeedback ? [{ role: 'system', content: `Previous error: ${errorFeedback}. Please ensure you fix this issue in your response.` }] : []),
      // Add the user prompt
      { role: 'user', content: userPrompt }
    ];

    // Use Kluster API
    const apiKey = config.getApiKey();

    if (!apiKey) {
      throw new Error('Missing API key. Please check your configuration.');
    }

    // Full response accumulator
    let fullResponse = '';

    // Replicate doesn't support streaming in the same way, so we'll use polling
    if (false && typeof onPartialResponse === 'function') {
      // Streaming response handler
      const handleStreamingResponse = (response) => {
        // If the response has stopped, don't process further
        if (response.choices && response.choices[0] && response.choices[0].finish_reason) {
          return;
        }

        // Get the delta content
        const deltaContent = response.choices[0].delta.content || '';

        // Accumulate the response
        fullResponse += deltaContent;

        // Call the callback with accumulated response
        onPartialResponse(fullResponse);
      };

      // Make API request with streaming using axios
      const response = await new Promise((resolve, reject) => {
        axios.post('https://api.kluster.ai/v1/chat/completions', {
          model: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
          messages,
          temperature: 0.2,
          stream: true,
          max_tokens: 4000
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          responseType: 'stream'
        })
        .then(res => {
          if (res.status !== 200) {
            reject(new Error(`API error ${res.status}: ${res.statusText}`));
            return;
          }

          // Handle streaming response with axios
          res.data.on('data', (chunk) => {
            const chunkStr = chunk.toString();
            const lines = chunkStr.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.substring(6));
                  handleStreamingResponse(data);
                } catch (e) {
                  console.error('Error parsing streaming data:', e);
                }
              }
            }
          });

          res.data.on('end', () => {
            // Stream complete
            resolve({ fullResponse });
          });

          res.data.on('error', (error) => {
            reject(error);
          });
        })
        .catch(error => {
          reject(error);
        });
      });

      // Use the accumulated response
      const textResponse = fullResponse;
      console.log('Received plan (streaming):', textResponse.substring(0, 200) + '...');

      // Extract plan and code from the response
      return extractPlanAndCode(textResponse);
    } else {
      // API calls disabled - return simple response for animation search
      console.log('Plan generation requested but API calls are disabled - triggering animation search');

      // Extract the user's request from the last user message
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      const userRequest = lastUserMessage ? lastUserMessage.content : 'animation task';

      // Return a simple response that triggers animation search without showing search message
      const fallbackPlan = {
        steps: [],
        code: '',
        explanation: '', // Empty explanation to avoid showing search message
        fullText: '', // Empty fullText to avoid showing search message
        animationSearch: true, // Flag to indicate this should trigger animation search
        searchQuery: userRequest
      };

      return fallbackPlan;
    }
  } catch (error) {
    console.error('Error in planWithLLM:', error);
    console.error('Error details:', error.message);

    // Return fallback response
    return {
      steps: ['Error occurred in plan generation'],
      code: '// Error: ' + error.message,
      explanation: 'An error occurred while generating the plan: ' + error.message,
      fullText: 'ERROR: ' + error.message
    };
  }
}

/**
 * Extract plan steps, code, and explanation from the LLM response
 * @param {string} text - The LLM response text
 * @returns {Object} - Extracted plan steps, code, and explanation
 */
function extractPlanAndCode(text) {
  // Default return values
  const result = {
    steps: [],
    code: '',
    explanation: '',
    fullText: text // Store the full text for later use
  };

  try {
    console.log('Extracting plan and code from response...');

    // Extract plan section (between "PLAN:" and "CODE:")
    const planMatch = text.match(/PLAN:([\s\S]*?)(?=CODE:|$)/i);
    if (planMatch && planMatch[1]) {
      // Extract steps from the plan section
      const planSection = planMatch[1].trim();
      const steps = extractSteps(planSection);
      result.steps = steps;
      console.log(`Found ${steps.length} plan steps`);
    } else {
      console.log('No PLAN: section found in response');

      // Fallback: Try to find any bullet points or numbered lists in the text
      const fallbackSteps = extractSteps(text);
      if (fallbackSteps.length > 0) {
        result.steps = fallbackSteps;
        console.log(`Found ${fallbackSteps.length} plan steps using fallback method`);
      }
    }

    // Extract code section (between "CODE:" and "EXPLANATION:" or between code blocks)
    const codeBlockRegex = /```(?:javascript|jsx|js)?([\s\S]*?)```/g;
    const matches = [];
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      matches.push(match[1].trim());
    }

    // Use the first code block found
    if (matches.length > 0) {
      result.code = matches[0];
      console.log('Found code block with backticks');
    } else {
      // If no code blocks with backticks, try looking for CODE: section
      const codeMatch = text.match(/CODE:([\s\S]*?)(?=EXPLANATION:|$)/i);
      if (codeMatch && codeMatch[1]) {
        result.code = codeMatch[1].trim();
        console.log('Found CODE: section');
      } else {
        console.log('No code blocks or CODE: section found');
      }
    }

    // Extract explanation section
    const explanationMatch = text.match(/EXPLANATION:([\s\S]*?)(?=$)/i);
    if (explanationMatch && explanationMatch[1]) {
      result.explanation = explanationMatch[1].trim();
      console.log('Found EXPLANATION: section');
    } else {
      // Try to extract any remaining text after code blocks as explanation
      if (matches.length > 0 && text.lastIndexOf('```') !== -1) {
        const afterLastCodeBlock = text.substring(text.lastIndexOf('```') + 3).trim();
        if (afterLastCodeBlock) {
          result.explanation = afterLastCodeBlock;
          console.log('Found explanation text after code block');
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Error extracting plan and code:', error);
    return result;
  }
}

/**
 * Extract steps from the plan section
 * @param {string} planText - The plan section text
 * @returns {Array} - Array of plan steps
 */
function extractSteps(planText) {
  if (!planText) return [];

  // Try to match numbered/bulleted list items with more flexible pattern
  // This will match both "- Step text" and "1. Step text" formats
  const stepRegex = /(?:^|\n)(?:-|\d+\.)\s*(.*?)(?=\n(?:-|\d+\.)|$)/g;
  const steps = [];
  let match;

  while ((match = stepRegex.exec(planText)) !== null) {
    if (match[1] && match[1].trim()) {
      steps.push(match[1].trim());
    }
  }

  // If no list found, try to find steps with "Step X:" pattern
  if (steps.length === 0) {
    const stepHeaderRegex = /(?:^|\n)(?:Step\s*\d+|Task\s*\d+)[:\s-]+\s*(.*?)(?=\n(?:Step\s*\d+|Task\s*\d+)|$)/gi;

    while ((match = stepHeaderRegex.exec(planText)) !== null) {
      if (match[1] && match[1].trim()) {
        steps.push(match[1].trim());
      }
    }
  }

  // If still no steps found, split by newlines and filter out empty lines
  if (steps.length === 0) {
    const lines = planText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.match(/^(plan|steps|instructions):?$/i));

    // Only use lines as steps if they're reasonably short (likely to be steps, not paragraphs)
    if (lines.length > 0 && lines.every(line => line.length < 200)) {
      return lines;
    }
  }

  return steps;
}

/**
 * Critique the execution results using LLM
 * @param {string} userPrompt - Original user prompt
 * @param {Array} planSteps - Steps from the plan
 * @param {Object} executionResult - Result from execution
 * @returns {Promise<Object>} - Critique result with approval status
 */
async function criticizeWithLLM(userPrompt, planSteps, executionResult) {
  try {
    // For this example, we'll simulate a successful critic result
    // In a real implementation, you'd call the LLM to evaluate the results

    return {
      approved: executionResult.success,
      message: executionResult.success
        ? "" // Empty message - no point in showing success
        : `Execution failed: ${executionResult.error}`
    };
  } catch (error) {
    console.error('Error in criticizeWithLLM:', error);
    return {
      approved: false,
      message: `Error during execution: ${error.message}`
    };
  }
}

// Animation search helper functions for LLM integration
async function searchAnimations(query, count = 5) {
  try {
    const results = await search.findBestAnimation(query, count);
    return {
      success: true,
      animations: results,
      query: query,
      count: results.length
    };
  } catch (error) {
    console.error('Error searching animations:', error);
    return {
      success: false,
      error: error.message,
      animations: []
    };
  }
}

async function getAnimationDescription(filename) {
  try {
    // Extract the number from filename like "1481_Bitcoin.json" -> "1481"
    const fileNumber = filename.match(/(\d+)_/)?.[1];
    if (!fileNumber) {
      return { success: false, error: 'Invalid filename format' };
    }

    // Read the corresponding prompt file
    const fs = require('fs/promises');
    const path = require('path');
    const promptPath = path.join(__dirname, 'lottie_library', 'prompts', `${fileNumber}_prompt.txt`);

    const description = await fs.readFile(promptPath, 'utf8');
    return {
      success: true,
      filename: filename,
      description: description.trim(),
      fileNumber: fileNumber
    };
  } catch (error) {
    console.error('Error getting animation description:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function recommendAnimationsForProject(projectContext) {
  try {
    // Extract key themes from project context
    const themes = [];
    if (projectContext.toLowerCase().includes('business')) themes.push('business corporate');
    if (projectContext.toLowerCase().includes('tech')) themes.push('technology digital');
    if (projectContext.toLowerCase().includes('finance')) themes.push('finance money');
    if (projectContext.toLowerCase().includes('medical')) themes.push('medical health');
    if (projectContext.toLowerCase().includes('education')) themes.push('education learning');

    // Default to general business if no specific themes found
    if (themes.length === 0) themes.push('business presentation');

    const recommendations = [];
    for (const theme of themes.slice(0, 2)) { // Limit to 2 themes
      const results = await search.findBestAnimation(theme, 3);
      recommendations.push(...results);
    }

    // Remove duplicates and limit to 5
    const uniqueRecommendations = [...new Set(recommendations)].slice(0, 5);

    return {
      success: true,
      animations: uniqueRecommendations,
      themes: themes,
      count: uniqueRecommendations.length
    };
  } catch (error) {
    console.error('Error recommending animations:', error);
    return {
      success: false,
      error: error.message,
      animations: []
    };
  }
}

/**
 * Process LLM response and trigger JSON import
 */
async function processAnimationImport(llmResponse, animationData) {
    try {
        // Check if LLM wants to import/modify animation
        const importPattern = /import|create|generate|modify.*animation/i;

        if (importPattern.test(llmResponse) && animationData && animationData.length > 0) {
            // Get the first animation data
            const animation = animationData[0];

            // Queue for import
            global.pamaImportQueue = global.pamaImportQueue || [];
            global.pamaImportQueue.push({
                type: 'LOTTIE_IMPORT',
                jsonData: animation.jsonData,
                filename: animation.filename,
                description: animation.description,
                timestamp: Date.now()
            });

            return {
                hasImport: true,
                queuedAnimation: animation.filename
            };
        }

        return { hasImport: false };

    } catch (error) {
        console.error('Error processing animation import:', error);
        return { hasImport: false, error: error.message };
    }
}

module.exports = {
  runAgent,
  searchAnimations,
  getAnimationDescription,
  recommendAnimationsForProject,
  processAnimationImport
};