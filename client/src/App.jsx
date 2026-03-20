import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import ChatThread from './components/ChatThread';
import DebugProvider from './components/DebugProvider';
// Sidebar removed based on user request

import './App.css'; // Make sure to create this file if it doesn't exist

function App() {
  const [messages, setMessages] = useState([]);
  const [isServerConnected, setIsServerConnected] = useState(false);
  const [socketConnection, setSocketConnection] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [currentUser, setCurrentUser] = useState({ id: 'default-user', username: 'User' });

  // Single chat - no auth needed
  const [currentThreadId, setCurrentThreadId] = useState(null);

  // Single chat persistence - no user auth needed
  const localKeyMsgs = () => `pama_single_chat_messages`;
  const localKeyDraft = () => `pama_single_chat_draft`;
  const saveDraft = (content) => { try { localStorage.setItem(localKeyDraft(), JSON.stringify({ content, updated_at: Date.now() })); } catch(_){} };
  const loadDraft = () => { try { return JSON.parse(localStorage.getItem(localKeyDraft()) || 'null'); } catch(_) { return null; } };
  const clearDraft = () => { try { localStorage.removeItem(localKeyDraft()); } catch(_){} };

  // No need for fetchThreads - single chat only

  // Use fixed thread ID for single chat
  const getSingleThreadId = () => 'single-chat-thread';

  // Get auth token from PAMA Manager
  const getAuthTokenFromManager = async () => {
    try {
      // Fix: Only use the correct manager port
      const managerPort = 8431; // Use the known working port
      
      try {
        console.log(`🔑 Attempting to get auth token from Manager on port ${managerPort}...`);
        const response = await fetch(`http://127.0.0.1:${managerPort}/auth/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store'
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Got auth token from Manager successfully');
          return data.token;
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`❌ Manager auth token response error: ${response.status} - ${errorText}`);
          return null;
        }
      } catch (e) {
        console.error('❌ Error fetching auth token:', e.message);
        // Check if it's a CORS error
        if (e.message.includes('CORS') || e.message.includes('Failed to fetch')) {
          console.error('⚠️ CORS issue detected - Manager may not be allowing requests');
        }
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting auth token from Manager:', error);
      return null;
    }
  };

  // Check auth status with Manager (mocked to always return true now)
  const checkAuthStatus = async () => {
    setIsAuthenticated(true);
    setCurrentUser({ id: 'local-user', username: 'Local User' });
    return true;
  };

  const loadMessages = async () => {
    try {
      const msgs = JSON.parse(localStorage.getItem(localKeyMsgs()) || '[]');
      const draft = loadDraft();
      setMessages(draft ? [...msgs, { id: `draft-${Date.now()}`, role: 'agent', content: draft.content, isDraft: true }] : msgs);
      console.log('🔄 Loaded messages from localStorage:', msgs.length);
    } catch (e) {
      console.warn('Failed to load messages:', e);
      setMessages([]);
    }
  };

  const persistMessage = async (role, content) => {
    try {
      // Save to local storage only
      const current = (() => { try { return JSON.parse(localStorage.getItem(localKeyMsgs()) || '[]'); } catch { return []; } })();
      current.push({ id: Date.now(), role: role === 'assistant' ? 'agent' : role, content });
      localStorage.setItem(localKeyMsgs(), JSON.stringify(current));
      console.log('🔄 Persisted message to localStorage:', { role, content });
    } catch (e) {
      console.warn('Failed to persist message:', e);
    }
  };

  // Launch the server extension when the panel loads
  useEffect(() => {
    // Access CSInterface from window object since it's defined in the HTML
    const cs = window.CSInterface ? new window.CSInterface() : null;

    if (!cs) {
      console.error("CSInterface not available");
      return;
    }

    // Request to launch the server extension
    cs.requestOpenExtension("com.yourcompany.pama.server", "");

    // Try to connect to the Node server via websocket
    const connectToServer = async () => {
      try {
        console.log("PAMA: Attempting to connect to server at http://localhost:8321");

        // Get auth token before connecting
        const token = await getAuthTokenFromManager();
        setAuthToken(token);
        
        // Configure socket with better connection options and auth
        const socket = io('http://localhost:8321', {
          reconnectionAttempts: 5,
          timeout: 10000,
          transports: ['websocket', 'polling'],
          auth: {
            token: token
          }
        });

        // Connection established
        socket.on('connect', () => {
          console.log('PAMA: Connected to server successfully');
          setIsServerConnected(true);
          setSocketConnection(socket);
        });

        // Connection error handling
        socket.on('connect_error', (error) => {
          console.error('PAMA: Socket connection error:', error.message);
          setIsServerConnected(false);
        });

        // General error handling
        socket.on('error', (error) => {
          console.error('PAMA: Socket error:', error);
          setIsServerConnected(false);
          
          // Handle insufficient credits error
          if (error.message && error.message.includes('Insufficient credits')) {
            const errorMsg = {
              id: Date.now(),
              role: 'agent',
              content: '⚠️ **Insufficient Credits**\n\nYou need more credits to generate animations. Each animation costs 100 credits.\n\nPlease purchase more credits to continue using PAMA.'
            };
            setMessages(prev => [...prev, errorMsg]);
          }
        });

        // Connection timeout handling
        socket.on('connect_timeout', () => {
          console.error('PAMA: Socket connection timeout');
          setIsServerConnected(false);
        });

        // Disconnection handling
        socket.on('disconnect', (reason) => {
          console.log('PAMA: Disconnected from server. Reason:', reason);
          setIsServerConnected(false);

          // If server initiated disconnect, we need to manually reconnect
          if (reason === 'io server disconnect') {
            socket.connect();
          }
        });

        // Reconnection attempt
        socket.on('reconnecting', (attemptNumber) => {
          console.log(`PAMA: Attempting to reconnect (${attemptNumber})...`);
        });

        // Reconnection success
        socket.on('reconnect', (attemptNumber) => {
          console.log(`PAMA: Reconnected after ${attemptNumber} attempts`);
          setIsServerConnected(true);
        });

        // Reconnection failure
        socket.on('reconnect_failed', () => {
          console.error('PAMA: Failed to reconnect after maximum attempts');
          setIsServerConnected(false);
        });

        // CEP -> server -> client import completion event
        socket.on('import-complete', (data) => {
          try {
            const name = data?.compositionName || 'Animation';
            const text = `${name} has successfully imported.`;
            console.log('🎬 Import complete event received:', { name, text, data });
            window.dispatchEvent(new CustomEvent('systemMessage', { detail: { text } }));
          } catch (e) {
            console.warn('Failed to handle import-complete event:', e);
          }
        });

        socket.on('partial_response', (data) => {
          // Handle partial/streaming response from agent
          setMessages(prev => {
            const newMessages = [...prev];
            // If the last message is from the agent and is a draft, update it
            if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'agent' && newMessages[newMessages.length - 1].isDraft) {
              newMessages[newMessages.length - 1].content = data.content;
            } else {
              // Otherwise add a new draft message
              newMessages.push({
                id: Date.now(),
                role: 'agent',
                content: data.content,
                isDraft: true
              });
            }
            // Persist draft for this thread
            saveDraft(currentThreadId, data.content);
            return newMessages;
          });
        });

        socket.on('final_response', (data) => {
          // Check if this is an animation generation with credit deduction
          if (data.creditsDeducted && data.creditsDeducted > 0) {
            console.log(`💰 Credits deducted: ${data.creditsDeducted}`);
            // Refresh credit balance in sidebar
            window.dispatchEvent(new CustomEvent('creditUpdate', {
              detail: { deducted: data.creditsDeducted }
            }));
          }
          
          // Check if this is an animation search request first
          if (data.animationSearch && data.searchQuery) {
            console.log('Animation search detected, triggering search interface for:', data.searchQuery);
            // Remove any draft message without adding a new one
            setMessages(prev => {
              const newMessages = [...prev];
              const draftIndex = newMessages.findIndex(m => m.isDraft);
              if (draftIndex >= 0) {
                newMessages.splice(draftIndex, 1); // Remove draft message
              }
              return newMessages;
            });
            // Trigger animation search in ChatThread
            window.dispatchEvent(new CustomEvent('animationSearch', {
              detail: { searchQuery: data.searchQuery }
            }));
          } else if (data.content && data.content.trim() !== '') {
            // Only add message if content is not empty
            setMessages(prev => {
              const newMessages = [...prev];
              // Find the draft message and finalize it
              const draftIndex = newMessages.findIndex(m => m.isDraft);
              if (draftIndex >= 0) {
                newMessages[draftIndex] = {
                  ...newMessages[draftIndex],
                  content: data.content,
                  isDraft: false
                };
              } else {
                // If no draft was found, add a new message
                newMessages.push({
                  id: Date.now(),
                  role: 'agent',
                  content: data.content,
                  isDraft: false
                });
              }
              return newMessages;
            });
            // persist assistant message (fire-and-forget)
            try { persistMessage('assistant', data.content); } catch(_){}
            // clear draft now that final is in
            clearDraft();

          } else {
            // Remove draft message if content is empty
            setMessages(prev => {
              const newMessages = [...prev];
              const draftIndex = newMessages.findIndex(m => m.isDraft);
              if (draftIndex >= 0) {
                newMessages.splice(draftIndex, 1); // Remove draft message
              }
              return newMessages;
            });
            console.log('Empty response received, not adding to chat');
          }
        });





        return socket;
      } catch (error) {
        console.error('Failed to connect to PAMA server:', error);
        // Retry after a delay
        setTimeout(connectToServer, 2000);
        return null;
      }
    };

    connectToServer();

    // Cleanup function
    return () => {
      if (socketConnection) {
        socketConnection.disconnect();
      }
    };
  }, []);

  // Listen to system messages (e.g., import completion) and persist them
  useEffect(() => {
    const handler = (evt) => {
      const text = evt.detail?.text;
      if (!text) return;
      console.log('🎬 System message received:', text);
      const sysMsg = { id: Date.now(), role: 'agent', content: text };
      setMessages(prev => [...prev, sysMsg]);
      try {
        persistMessage('assistant', text);
        console.log('🎬 System message persisted');
      } catch(e) {
        console.error('🎬 Failed to persist system message:', e);
      }
    };
    window.addEventListener('systemMessage', handler);
    return () => window.removeEventListener('systemMessage', handler);
  }, [currentThreadId]);

  // Handle sending user messages
  const handleUserSend = async (message, options = {}) => {
    // Auth check bypassed

    // Add user message to chat
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message
    };

    setMessages(prev => [...prev, userMessage]);

    // Persist user message
    try { await persistMessage('user', message); } catch(_){}

    // Send to server (always in animate mode) with auth token
    if (socketConnection) {
      // Create proper auth token with real user ID
      const userToken = currentUser?.id ? `dev:${currentUser.id}` : 'dev:google-oauth2|102396721651386249785';
      
      socketConnection.emit('user_command', {
        prompt: message,
        animateMode: true,
        threadId: currentThreadId,
        authToken: userToken
      });
    } else {
      // Fallback to fetch API if socket isn't connected
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Add auth token if available
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      fetch('http://localhost:8321/command', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          prompt: message,
          animateMode: true
        })
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(errorData => {
            throw new Error(errorData.error || `HTTP ${response.status}`);
          });
        }
        return response.json();
      })
      .then(data => {
        // Check for credit deduction
        if (data.creditsDeducted && data.creditsDeducted > 0) {
          console.log(`💰 Credits deducted: ${data.creditsDeducted}`);
          window.dispatchEvent(new CustomEvent('creditUpdate', {
            detail: { deducted: data.creditsDeducted }
          }));
        }
        
        // Handle response
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: 'agent',
          content: data.response || data.message || 'Animation generated successfully'
        }]);
      })
      .catch(error => {
        console.error('Error sending command:', error);
        
        // Handle insufficient credits error
        if (error.message && error.message.includes('Insufficient credits')) {
          const errorMsg = {
            id: Date.now(),
            role: 'agent',
            content: '⚠️ **Insufficient Credits**\n\nYou need more credits to generate animations. Each animation costs 100 credits.\n\nPlease purchase more credits to continue using PAMA.'
          };
          setMessages(prev => [...prev, errorMsg]);
        } else {
          // General error message
          const errorMsg = {
            id: Date.now(),
            role: 'agent',
            content: `❌ Error: ${error.message}`
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      });
    }
  };

  // Debug information function - can be used by the debug panel
  const getDebugInfo = () => {
    return {
      isConnected: isServerConnected,
      serverUrl: 'http://localhost:8321'
    };
  };

  // Initialize on first load
  useEffect(() => {
    console.log('🔄 Initializing PAMA with authentication check');
    setCurrentThreadId(getSingleThreadId());
    loadMessages();
    
    // Check auth status on startup
    const initAuth = async () => {
      console.log('🔑 Starting authentication flow...');
      const authResult = await checkAuthStatus();
      console.log('🔑 Auth check result:', authResult);
      
      if (authResult) {
        console.log('🔑 User authenticated, getting token...');
        const token = await getAuthTokenFromManager();
        console.log('🔑 Token result:', token ? 'Got token' : 'No token');
        setAuthToken(token);
      } else {
        console.log('🔑 User not authenticated');
      }
    };
    
    initAuth();
    
    // Poll auth status every 30 seconds
    const authInterval = setInterval(checkAuthStatus, 30000);
    return () => clearInterval(authInterval);
  }, []);

  // Show authentication required screen removed.
  return (
    <DebugProvider>
      <div className="app-container">
        <div className="app-layout">
          {/* Sidebar removed */}

          {/* Chat thread */}
          <div className="chat-container">
            <ChatThread
              messages={messages}
              onSend={isAuthenticated ? handleUserSend : null}
              isConnected={isServerConnected && isAuthenticated}
              threadId={currentThreadId}
            />
          </div>
        </div>
      </div>
    </DebugProvider>
  );
}

export default App;