import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import AnimationExecutionBar from './AnimationExecutionBar';
import { extractCodeFromResponse } from '../utils/codeExtractor';
import { useImportManager } from '../hooks/useImportManager';
import './ChatThread.css';

function ChatThread({ messages, onSend, isConnected, dbStatus, threadId }) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Use ImportManager for thread-agnostic import state
  const { showProgress, searchQuery, startImport, completeImport, cancelImport, importState, hasActiveImport, manager } = useImportManager(threadId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // DISABLED: Don't check for ongoing imports when thread changes
  // This was causing imports to restart when PAMA reopened
  // useEffect(() => {
  //   if (threadId && manager) {
  //     // Refresh state from storage when switching threads
  //     manager.refreshFromStorage();
  //
  //     // Check if there's an ongoing process
  //     const hasOngoing = manager.checkForOngoingProcess(threadId);
  //     if (hasOngoing) {
  //       console.log('🎬 ChatThread: Detected ongoing import for thread', threadId);
  //     } else {
  //       // If no local ongoing process, check server
  //       manager.syncWithServer(threadId);
  //     }
  //   }
  // }, [threadId, manager]);

  // Mark UI started only AFTER we actually trigger the import workflow, not just when progress shows
  // This was causing the bar to think import already started when it hadn't

  // Listen for animation search events from the server
  useEffect(() => {
    const handleAnimationSearch = (event) => {
      console.log('Received animation search event:', event.detail);
      console.log('PAMA: Always in ANIMATE mode - showing animation search results');

      // Start import via ImportManager instead of local state
      startImport(event.detail.searchQuery, (result) => {
        // Handle completion - add system message
        const text = `Import complete: ${result?.filename || 'animation'} is ready in After Effects.`;
        window.dispatchEvent(new CustomEvent('systemMessage', { detail: { text } }));
      });

    };

    window.addEventListener('animationSearch', handleAnimationSearch);
    return () => {
      window.removeEventListener('animationSearch', handleAnimationSearch);
    };
  }, [startImport]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (inputValue.trim() === '') return;

    const userQuery = inputValue.trim();

    // Always in ANIMATE mode - trigger animation search
    console.log('🎬 ChatThread: ANIMATE mode (always on) - triggering animation search for:', userQuery);
    console.log('🎬 ChatThread: Query length:', userQuery?.length, 'Query value:', JSON.stringify(userQuery));

    // Send user message to chat first (so it appears in the conversation)
    onSend(userQuery, { animateMode: true });

    // Trigger animation search via ImportManager
    startImport(userQuery);
    console.log('🎬 ChatThread: Started import for query:', userQuery);

    // Clear input
    setInputValue('');
  };

  // Import animation to After Effects - DIRECT IMPORT APPROACH
  const handleImportAnimation = async (animation) => {
    console.log('PAMA: DIRECT IMPORT - Import button clicked for animation:', animation);

    // Validate animation data
    if (!animation.data) {
      console.error('PAMA: No animation data provided');
      return;
    }

    if (!animation.filename) {
      console.error('PAMA: No animation filename provided');
      return;
    }

    try {
      // DIRECT APPROACH: Try immediate import if BodymovinImporter is available
      if (window.BodymovinImporter && typeof window.BodymovinImporter.convert === 'function') {
        console.log('PAMA: BodymovinImporter available - attempting direct import');

        try {
          window.BodymovinImporter.convert(
            animation.data,
            (progress) => {
              console.log('PAMA: Direct import progress:', progress);
            },
            (result) => {
              console.log('PAMA: Direct import completed successfully:', result);
            },
            (error) => {
              console.error('PAMA: Direct import error:', error);
            }
          );
          console.log('PAMA: Direct import initiated successfully');
          return;
        } catch (directError) {
          console.error('PAMA: Direct import failed:', directError);
        }
      }

      // FALLBACK: Check if running inside After Effects CEP extension
      if (window.CSInterface) {
        console.log('PAMA: Running in CEP extension, checking bridge...');

        // Wait for both bridge and Redux to be ready (like JSON-IMPORTER)
        return new Promise((resolve, reject) => {
          let bridgeReady = false;
          let reduxReady = false;
          let attempts = 0;
          const maxAttempts = 50; // 5 seconds max

          function checkReady() {
            if (bridgeReady && reduxReady) {
              console.log('PAMA: Bridge and Redux ready, importing animation...');
              console.log('PAMA: Animation data to import:', {
                name: animation.data.nm || 'Unknown',
                version: animation.data.v,
                frameRate: animation.data.fr,
                width: animation.data.w,
                height: animation.data.h,
                layers: animation.data.layers ? animation.data.layers.length : 0
              });

              // Use the BodymovinImporter.convert function exactly like JSON-IMPORTER
              try {
                window.BodymovinImporter.convert(
                  animation.data, // The actual Lottie JSON data
                  (progress) => {
                    console.log('PAMA: Import progress:', progress);
                  },
                  (result) => {
                    console.log('PAMA: Import completed successfully:', result);
                    resolve(result);
                  },
                  (error) => {
                    console.error('PAMA: Import error:', error);
                    reject(new Error(error));
                  }
                );
                console.log('PAMA: BodymovinImporter.convert called successfully');
              } catch (convertError) {
                console.error('PAMA: Error calling BodymovinImporter.convert:', convertError);
                reject(convertError);
              }
              return;
            }
          }

          async function checkBridge() {
            attempts++;

            console.log(`PAMA DEBUG: Checking bridge attempt ${attempts}`);
            console.log('PAMA DEBUG: window.BodymovinImporter =', typeof window.BodymovinImporter);

            // Wait for JSX initialization if it's still pending
            let jsxReady = false;
            try {
              if (window.jsxInitPromise) {
                console.log('PAMA DEBUG: Waiting for JSX initialization...');
                await window.jsxInitPromise;
                console.log('PAMA DEBUG: JSX initialization complete');
              }
              jsxReady = true;
            } catch (error) {
              console.error('PAMA DEBUG: JSX initialization failed:', error);
              jsxReady = false;
            }

            console.log('PAMA DEBUG: JSX system ready =', jsxReady);

            if (window.BodymovinImporter) {
              console.log('PAMA DEBUG: window.BodymovinImporter.convert =', typeof window.BodymovinImporter.convert);
            }

            // Check both BodymovinImporter bridge and JSX system
            if (window.BodymovinImporter && typeof window.BodymovinImporter.convert === 'function' && jsxReady) {
              bridgeReady = true;
              console.log('PAMA DEBUG: BodymovinImporter bridge and JSX system ready');
              checkReady();
              return;
            }

            if (attempts >= maxAttempts) {
              console.error('PAMA DEBUG: Bridge/JSX check failed after', maxAttempts, 'attempts');
              console.error('PAMA DEBUG: BodymovinImporter available:', !!window.BodymovinImporter);
              console.error('PAMA DEBUG: Convert function available:', !!(window.BodymovinImporter && window.BodymovinImporter.convert));
              console.error('PAMA DEBUG: JSX system ready:', jsxReady);
              reject(new Error('BodymovinImporter bridge or JSX system not available - timeout after 10 seconds'));
              return;
            }

            setTimeout(checkBridge, 100);
          }

          // Listen for Redux ready event
          const handleReduxReady = () => {
            reduxReady = true;
            console.log('Redux store ready');
            window.removeEventListener('redux-ready', handleReduxReady);
            checkReady();
          };

          window.addEventListener('redux-ready', handleReduxReady);

          // Start checking for bridge
          checkBridge();
        });
      } else {
        // Running in browser, queue for import via server
        console.log('PAMA: Running in browser, queueing animation for import...');
        console.log('PAMA: Queueing animation:', {
          filename: animation.filename,
          name: animation.name,
          hasData: !!animation.data
        });

        const response = await fetch('http://localhost:8321/queue-animation-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            animationFile: animation.filename
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('PAMA: Failed to queue animation:', response.status, errorText);
          throw new Error(`Failed to queue animation: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('PAMA: Animation queued successfully:', result);

        // Show user feedback
        console.log(`✅ Animation "${animation.name}" has been queued for import. It will be imported when After Effects connects to PAMA.`);

        return result;
      }
    } catch (error) {
      console.error('Error importing animation:', error);
      throw error;
    }
  };



  // Format message content and extract code blocks
  const formatMessageContent = (content) => {
    // For user messages, just display as plain text
    if (content && !content.includes('```')) {
      return <p>{content}</p>;
    }

    // For agent messages, try to extract plan and code
    const extracted = extractCodeFromResponse(content);

    return (
      <div className="agent-response">




        {/* Display explanation if available */}
        {extracted.explanation && (
          <div className="response-explanation">
            <p className="explanation-text">{extracted.explanation}</p>
          </div>
        )}

        {/* If no structured content was extracted, show the raw message */}
        {!extracted.extractionSuccessful && content && (
          <ReactMarkdown
            className="prose prose-invert max-w-none"
            components={{
              code({node, inline, className, children, ...props}) {
                if (inline) {
                  return <code className="bg-gray-800 px-1 rounded text-sm" {...props}>{children}</code>;
                }

                // Extract language if specified
                const match = /language-(\w+)/.exec(className || '');
                const language = match ? match[1] : '';

                return (
                  <div className="bg-gray-800 rounded-md my-2 overflow-hidden">
                    {language && (
                      <div className="bg-gray-700 px-4 py-1 font-mono text-xs text-gray-300">
                        {language}
                      </div>
                    )}
                    <pre className="p-4 overflow-auto">
                      <code className="font-mono text-sm" {...props}>
                        {String(children).replace(/\n$/, '')}
                      </code>
                    </pre>
                  </div>
                );
              }
            }}
          >
            {content}
          </ReactMarkdown>
        )}
      </div>
    );
  };

  return (
    <div className="chat-thread-container">
      {/* Chat header */}
      <div className="chat-header">
        <h2 className="chat-title">PAMA Agent</h2>
        <div className="status-container">
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span className="status-text">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>

          {dbStatus && (
            <div className="database-status">
              <span className={`status-indicator ${dbStatus.saved ? 'db-saved' : 'db-pending'}`}></span>
              <span className="status-text">
                {dbStatus.saved
                  ? dbStatus.message
                    ? dbStatus.message
                    : `Saved v${dbStatus.version || '1'}`
                  : 'Saving...'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Messages container */}
      <div
        ref={chatContainerRef}
        className="messages-container"
      >
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="welcome-message">
            <h3 className="welcome-title">Welcome to PAMA</h3>
            <p className="welcome-subtitle">The Project-Aware Multimodal Agent for After Effects</p>
            <p className="welcome-prompt">Type a command below to get started</p>
          </div>
        )}

        {/* Message bubbles with inline progress bar */}
        {messages.map((message, index) => {
          // Find the last user message index
          const lastUserMessageIndex = messages.map((m, i) => m.role === 'user' ? i : -1)
                                               .filter(i => i !== -1)
                                               .pop();

          return (
            <div key={message.id}>
              <div
                className={`message-wrapper ${message.role === 'user' ? 'user-message' : 'agent-message'}`}
              >
                <div
                  className={`message-bubble ${message.isDraft ? 'draft-message' : ''}`}
                >
                  {formatMessageContent(message.content)}
                  {message.isDraft && (
                    <div className="typing-indicator">
                      Thinking
                    </div>
                  )}
                </div>
              </div>

              {/* Show animation execution bar after the last user message if import is active */}
              {showProgress &&
               message.role === 'user' &&
               index === lastUserMessageIndex && (
                <AnimationExecutionBar
                  threadId={threadId}
                  searchQuery={searchQuery}
                  uiAlreadyStarted={importState?.uiStarted}
                  importState={importState}
                  onImportAnimation={handleImportAnimation}
                  onCancel={() => {
                    console.log('🎬 ChatThread: Cancelling animation search');
                    cancelImport();
                  }}
                  onComplete={(info) => {
                    // Complete import via ImportManager
                    completeImport(info);
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="input-container">
        <form onSubmit={handleSubmit} className="message-form">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Describe the animation you want to find..."
            className="message-input animate-mode"
            disabled={!isConnected}
          />
          <button
            type="submit"
            className={`send-button ${!isConnected || !inputValue.trim() ? 'disabled' : ''}`}
            disabled={!isConnected || !inputValue.trim()}
          >
            <svg className="send-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatThread;