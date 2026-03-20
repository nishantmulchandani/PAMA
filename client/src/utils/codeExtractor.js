/**
 * Extract code from a markdown-formatted string
 * @param {string} text - The markdown text
 * @returns {object} - Object with extracted code and metadata
 */
function extractCodeFromResponse(text) {
  // Default return structure
  const result = {
    code: null,
    plan: null,
    explanation: null,
    extractionSuccessful: false
  };

  try {
    console.log('Extracting code and plan from response...');

    // Extract plan section if it exists (between "PLAN:" and "CODE:")
    const planMatch = text.match(/PLAN:([\s\S]*?)(?=CODE:|$)/i);
    if (planMatch && planMatch[1]) {
      result.plan = planMatch[1].trim();
      console.log('Found PLAN: section');
    } else {
      // If no explicit PLAN section, try to find any bulleted or numbered lists
      // that might be a plan
      const firstCodeBlockIndex = text.indexOf('```');
      if (firstCodeBlockIndex > 0) {
        // Look for lists in the text before the first code block
        const textBeforeCode = text.substring(0, firstCodeBlockIndex);
        if (textBeforeCode.match(/(?:^|\n)(?:-|\d+\.)\s+/)) {
          result.plan = textBeforeCode.trim();
          console.log('Found implicit plan (list before code block)');
        }
      }
    }

    // Extract explanation section if it exists (after "EXPLANATION:")
    const explanationMatch = text.match(/EXPLANATION:([\s\S]*?)(?=$)/i);
    if (explanationMatch && explanationMatch[1]) {
      result.explanation = explanationMatch[1].trim();
      console.log('Found EXPLANATION: section');
    } else {
      // Try to extract any text after the last code block as explanation
      const lastCodeBlockEnd = text.lastIndexOf('```');
      if (lastCodeBlockEnd !== -1 && lastCodeBlockEnd + 3 < text.length) {
        const textAfterCode = text.substring(lastCodeBlockEnd + 3).trim();
        if (textAfterCode && !result.explanation) {
          result.explanation = textAfterCode;
          console.log('Found implicit explanation (text after code block)');
        }
      }
    }

    // Look for code blocks with triple backticks
    const codeBlockRegex = /```(?:javascript|jsx|js)?([\s\S]*?)```/g;
    const matches = [];
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      matches.push(match[1].trim());
    }

    // If we found code blocks, use the first one
    if (matches.length > 0) {
      result.code = matches[0];
      result.extractionSuccessful = true;
      console.log('Found code block with backticks');
    }

    // Special case: If no code blocks found, check for a CODE: section without backticks
    if (!result.code) {
      const codeMatch = text.match(/CODE:([\s\S]*?)(?=EXPLANATION:|$)/i);
      if (codeMatch && codeMatch[1]) {
        result.code = codeMatch[1].trim();
        result.extractionSuccessful = true;
        console.log('Found CODE: section');
      }
    }

    // If we found any structured content, mark extraction as successful
    if (result.plan || result.code || result.explanation) {
      result.extractionSuccessful = true;
    }

    return result;
  } catch (error) {
    console.error("Error extracting code from response:", error);
    return result;
  }
}

/**
 * Convert plan text into a structured array of steps
 * @param {string} planText - The plan section text
 * @returns {Array} - Array of plan steps
 */
function extractPlanSteps(planText) {
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

export { extractCodeFromResponse, extractPlanSteps };