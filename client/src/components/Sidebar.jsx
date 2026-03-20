import React, { useState, useEffect } from 'react';
import './Sidebar.css';

export default function Sidebar({ user, onLogout, isAuthenticated, authToken }) {
  const [creditBalance, setCreditBalance] = useState(null);
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  const [creditError, setCreditError] = useState(null);

  // Fetch credit balance directly from PAMA Server (no Manager needed)
  const fetchCreditBalance = async () => {
    console.log('💰 fetchCreditBalance called - Direct to PAMA Server');
    console.log('💰 Auth state:', { isAuthenticated, hasToken: !!authToken });
    
    // Use the real authenticated user ID from Manager auth status
    const userId = user?.id || 'google-oauth2|102396721651386249785'; // Use real user from Manager
    console.log('💰 Using authenticated userId:', userId);

    setIsLoadingCredits(true);
    setCreditError(null);
    console.log('💰 Fetching credits directly from PAMA Server...');

    try {
      // Direct fetch from PAMA Server (8321) - the single source of truth
      const pamaServerPort = 8321;
      const url = `http://127.0.0.1:${pamaServerPort}/credits`;
      
      console.log(`🎯 Direct fetch from PAMA Server: ${url}`);
      
      // Create a simple dev token for now
      const devToken = `dev:${userId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${devToken}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });
      
      console.log(`💰 PAMA Server response: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Credit data received from PAMA Server:', data);
        setCreditBalance(data);
        setCreditError(null);
        setIsLoadingCredits(false);
        return;
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ PAMA Server credits fetch failed: ${response.status} - ${errorText}`);
        setCreditError(`Server Error ${response.status}`);
        setIsLoadingCredits(false);
      }
    } catch (error) {
      console.error('❌ PAMA Server credit fetch exception:', error);
      setCreditError('Server unavailable');
      setIsLoadingCredits(false);
    }
  };

  // Fetch credits on mount and when auth changes
  useEffect(() => {
    fetchCreditBalance();
  }, [isAuthenticated, authToken]);

  // Listen for credit updates from socket events
  useEffect(() => {
    const handleCreditUpdate = (event) => {
      console.log('💰 Credit update received:', event.detail);
      if (event.detail && event.detail.available !== undefined) {
        setCreditBalance(event.detail);
      }
    };

    window.addEventListener('creditUpdate', handleCreditUpdate);
    return () => window.removeEventListener('creditUpdate', handleCreditUpdate);
  }, []);

  // Format credit display
  const formatCredits = () => {
    if (!creditBalance) return '---';
    
    // Get the available credits (Manager returns 'creditsAvailable', not 'available')
    const available = creditBalance.creditsAvailable || creditBalance.available || 0;
    
    // Handle infinite credits for developers
    if (available === 'infinite' || available > 999999) {
      return '∞';
    }
    
    return available.toString();
  };

  // Get credit status color
  const getCreditStatusColor = () => {
    if (!creditBalance) return '#9ca3af';
    
    const available = creditBalance.creditsAvailable || creditBalance.available || 0;
    
    if (available === 'infinite' || available > 999999) return '#4CAF50';
    if (available <= 0) return '#f44336';
    if (available <= 100) return '#ff9800';
    return '#4CAF50';
  };

  return (
    <div className="pama-sidebar">
      <div className="pama-sidebar-header">
        <div className="pama-logo">
          <div className="pama-logo-title">PAMA</div>
          <div className="pama-logo-sub">Animation AI</div>
        </div>
      </div>
      
      {/* Credit Display Section */}
      <div className="pama-credits-section">
        <div className="pama-credits-label">Credits</div>
        <div 
          className="pama-credits-balance"
          style={{ color: getCreditStatusColor() }}
        >
          {isLoadingCredits ? '...' : formatCredits()}
        </div>
        {creditError && (
          <div className="pama-credits-error">{creditError}</div>
        )}
        {!isAuthenticated && (
          <div className="pama-credits-auth">Please authenticate to view credits</div>
        )}
        {creditBalance && (() => {
          const available = creditBalance.creditsAvailable || creditBalance.available || 0;
          return available <= 0 && available !== 'infinite';
        })() && (
          <div className="pama-credits-warning">
            <div className="pama-insufficient-funds">Insufficient Credits</div>
            <div className="pama-buy-credits">Buy credits to continue</div>
          </div>
        )}
      </div>

      <div className="pama-sidebar-footer">
        <div className="pama-user">{user?.username || user?.id || 'No user'}</div>
        <button className="pama-logout" onClick={onLogout}>Logout</button>
      </div>
    </div>
  );
}
