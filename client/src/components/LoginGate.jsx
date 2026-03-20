import React, { useEffect, useState } from 'react';
import './AuthModal.css';

export default function LoginGate({ onAuthenticated }) {
  const [userId, setUserId] = useState('');
  const [license, setLicense] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('pama_token');
    if (!token) return;
    fetch('http://localhost:8321/auth/session?token=' + encodeURIComponent(token))
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.user) {
          onAuthenticated({ user: data.user, token });
        }
      })
      .catch(() => {});
  }, [onAuthenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!userId || !license) { setError('Enter User ID and License'); return; }
    setLoading(true); setError('');
    try {
      console.log('Attempting login with:', { userId, license });
      const r = await fetch('http://localhost:8321/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, license })
      });
      console.log('Response status:', r.status);
      const ct = r.headers.get('content-type') || '';
      let data;
      if (ct.includes('application/json')) {
        data = await r.json();
      } else {
        const text = await r.text();
        console.error('Non-JSON response from server:', text);
        throw new Error(`Server returned non-JSON (${r.status}): ${text.slice(0,120)}`);
      }
      console.log('Response data:', data);
      if (data.ok) {
        localStorage.setItem('pama_token', data.token);
        onAuthenticated({ user: data.user, token: data.token });
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      // DEV FALLBACK: allow offline login if server returns non-JSON or is unreachable
      try {
        const devToken = `dev_${Date.now()}`;
        localStorage.setItem('pama_token', devToken);
        onAuthenticated({ user: { id: userId, name: userId }, token: devToken });
        return;
      } catch (e) {
        setError(`Connection error: ${err.message}`);
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <h2>Company Login</h2>
        <form onSubmit={handleLogin}>
          <label>User ID</label>
          <input value={userId} onChange={e=>setUserId(e.target.value)} placeholder="user@company" />
          <label>License</label>
          <input value={license} onChange={e=>setLicense(e.target.value)} placeholder="DEV-LICENSE" />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>
        <div className="auth-hint">Dev mode accepts any license for now</div>
      </div>
    </div>
  );
}
