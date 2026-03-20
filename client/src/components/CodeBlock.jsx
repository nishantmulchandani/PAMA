import React, { useState, useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css'; // Dark theme for code
import 'prismjs/components/prism-javascript'; // Add JavaScript support
import 'prismjs/components/prism-jsx'; // Add JSX support
import './CodeBlock.css';

/**
 * CodeBlock component for displaying ExtendScript code with Copy/Edit/Run buttons
 */
function CodeBlock({ code, onRun }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(code || '');
  const [isCopied, setIsCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // Update editedCode whenever code prop changes
  useEffect(() => {
    setEditedCode(code || '');
  }, [code]);
  
  // Function to highlight code using Prism
  const highlightCode = () => {
    if (!code) return '';
    
    // Highlight the code using Prism
    const highlightedCode = Prism.highlight(
      isEditing ? editedCode : code,
      Prism.languages.javascript,
      'javascript'
    );
    
    return highlightedCode;
  };
  
  // Handle copy button click
  const handleCopy = () => {
    const textToCopy = isEditing ? editedCode : code;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    });
  };
  
  // Handle edit button click
  const handleEdit = () => {
    if (isEditing) {
      // Save changes
      setIsEditing(false);
    } else {
      // Start editing
      setIsEditing(true);
    }
  };
  
  // Handle code change in the textarea
  const handleCodeChange = (e) => {
    setEditedCode(e.target.value);
  };
  
  // Handle run button click
  const handleRun = () => {
    setIsExecuting(true);
    
    // Use the edited code if in edit mode, otherwise use the original
    const codeToRun = isEditing ? editedCode : code;
    
    // Call the provided run handler
    if (onRun) {
      onRun(codeToRun)
        .then(() => {
          // Handle successful execution
          console.log('Code executed successfully');
        })
        .catch((error) => {
          // Handle execution error
          console.error('Error executing code:', error);
        })
        .finally(() => {
          setIsExecuting(false);
        });
    } else {
      console.warn('No run handler provided to CodeBlock component');
      setIsExecuting(false);
    }
  };
  
  return (
    <div className="code-block-container">
      {/* Code header with buttons */}
      <div className="code-block-header">
        <div className="language-indicator">
          ExtendScript
        </div>
        <div className="code-actions">
          <button 
            className={`action-button ${isCopied ? 'copied' : 'copy'}`}
            onClick={handleCopy}
            title="Copy code to clipboard"
          >
            {isCopied ? '✓ Copied' : 'Copy'}
          </button>
          
          <button 
            className={`action-button ${isEditing ? 'save' : 'edit'}`}
            onClick={handleEdit}
            title={isEditing ? "Save changes" : "Edit code"}
          >
            {isEditing ? 'Save' : 'Edit'}
          </button>
          
          <button 
            className={`action-button run ${isExecuting ? 'executing' : ''}`}
            onClick={handleRun}
            disabled={isExecuting}
            title="Run code in After Effects"
          >
            {isExecuting ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>
      
      {/* Code content */}
      <div className="code-content">
        {isEditing ? (
          <textarea
            className="code-editor"
            value={editedCode}
            onChange={handleCodeChange}
            spellCheck="false"
          />
        ) : (
          <pre className="code-display">
            <code 
              className="language-javascript"
              dangerouslySetInnerHTML={{ __html: highlightCode() }}
            />
          </pre>
        )}
      </div>
    </div>
  );
}

export default CodeBlock; 