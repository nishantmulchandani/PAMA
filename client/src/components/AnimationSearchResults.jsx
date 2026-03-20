import React, { useState, useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import './AnimationSearchResults.css';

const AnimationSearchResults = ({ searchQuery, onImportAnimation }) => {
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAnimation, setSelectedAnimation] = useState(null);

  useEffect(() => {
    if (searchQuery) {
      performSearch(searchQuery);
    }
  }, [searchQuery]);

  const performSearch = async (query) => {
    setLoading(true);
    setError(null);

    try {
      console.log('AnimationSearchResults: Searching for:', query);
      const response = await fetch(`http://localhost:8321/search/lottie?query=${encodeURIComponent(query)}&top_k=4`);
      const data = await response.json();
      console.log('AnimationSearchResults: Search response:', data);

      if (data.results && data.results.length > 0) {
        // Load animation data for each result
        const animationsWithData = await Promise.all(
          data.results.map(async (filename) => {
            try {
              console.log('AnimationSearchResults: Loading animation data for:', filename);
              const animationResponse = await fetch(`http://localhost:8321/animations/${filename}`);

              if (!animationResponse.ok) {
                throw new Error(`Failed to load animation: ${animationResponse.status} ${animationResponse.statusText}`);
              }

              const animationData = await animationResponse.json();
              console.log('AnimationSearchResults: Animation data loaded successfully for:', filename);

              const animationObject = {
                filename,
                data: animationData,
                name: filename.replace('.json', '').replace(/^\d+_/, ''),
                id: filename.replace('.json', ''),
                // Add additional metadata for better debugging
                loaded: true,
                size: JSON.stringify(animationData).length
              };

              console.log('AnimationSearchResults: Created animation object:', {
                filename: animationObject.filename,
                name: animationObject.name,
                id: animationObject.id,
                hasData: !!animationObject.data,
                dataSize: animationObject.size
              });

              return animationObject;
            } catch (err) {
              console.error(`AnimationSearchResults: Failed to load animation ${filename}:`, err);
              return null;
            }
          })
        );

        const validAnimations = animationsWithData.filter(Boolean);
        console.log('AnimationSearchResults: Valid animations loaded:', validAnimations.length);
        setSearchResults(validAnimations);
      } else {
        console.log('AnimationSearchResults: No results found');
        setSearchResults([]);
      }
    } catch (err) {
      console.error('AnimationSearchResults: Search failed:', err);
      setError('Failed to search animations: ' + err.message);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewAnimation = (animation) => {
    setSelectedAnimation(animation);
  };

  const handleImportAnimation = (animation) => {
    console.log('AnimationSearchResults: Import button clicked for', animation.name);
    console.log('AnimationSearchResults: Animation object:', {
      filename: animation.filename,
      name: animation.name,
      id: animation.id,
      hasData: !!animation.data,
      dataKeys: animation.data ? Object.keys(animation.data) : [],
      dataSize: animation.data ? JSON.stringify(animation.data).length : 0
    });

    // Validate animation data before passing to import handler
    if (!animation.data) {
      console.error('AnimationSearchResults: Animation data is missing!');
      return;
    }

    if (!animation.data.v || !animation.data.fr || !animation.data.layers) {
      console.error('AnimationSearchResults: Invalid Lottie data structure:', animation.data);
      return;
    }

    if (onImportAnimation) {
      console.log('AnimationSearchResults: Calling onImportAnimation with validated data');
      onImportAnimation(animation);
    } else {
      console.error('AnimationSearchResults: onImportAnimation prop not provided');
    }
  };

  const LottiePreview = ({ animation }) => {
    const containerRef = useRef(null);
    const animationRef = useRef(null);

    useEffect(() => {
      if (containerRef.current && animation.data) {
        // Clean up previous animation
        if (animationRef.current) {
          animationRef.current.destroy();
        }

        // Create new Lottie animation with deep copy to prevent data corruption
        // The Lottie library may modify the animation data object, so we create a copy
        const animationDataCopy = JSON.parse(JSON.stringify(animation.data));
        animationRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: animationDataCopy
        });
      }

      return () => {
        if (animationRef.current) {
          animationRef.current.destroy();
        }
      };
    }, [animation.data]);

    return (
      <div className="animation-preview">
        <div
          ref={containerRef}
          className="lottie-container"
          style={{ width: '120px', height: '120px' }}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="animation-search-results loading">
        <div className="loading-spinner"></div>
        <p>Searching animations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animation-search-results error">
        <p className="error-message">{error}</p>
      </div>
    );
  }

  if (!searchQuery) {
    return null;
  }

  return (
    <div className="animation-search-results">
      {searchResults.length === 0 ? (
        <div className="no-results">
          <p>No animations found matching your search.</p>
        </div>
      ) : (
        <div className="results-grid">
          {searchResults.map((animation) => (
            <div key={animation.id} className="animation-card">
              <LottiePreview animation={animation} />
              <div className="animation-actions">
                <button
                  className="import-btn"
                  onClick={() => handleImportAnimation(animation)}
                >
                  Animate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedAnimation && (
        <div className="animation-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{selectedAnimation.name}</h3>
              <button 
                className="close-btn"
                onClick={() => setSelectedAnimation(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="large-preview">
                {renderAnimationPreview(selectedAnimation)}
              </div>
              <div className="animation-details">
                <p><strong>Filename:</strong> {selectedAnimation.filename}</p>
                <p><strong>Dimensions:</strong> {selectedAnimation.data.w} × {selectedAnimation.data.h}</p>
                <p><strong>Frame Rate:</strong> {selectedAnimation.data.fr} fps</p>
                <p><strong>Duration:</strong> {Math.round(selectedAnimation.data.op / selectedAnimation.data.fr * 100) / 100}s</p>
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="import-btn large"
                onClick={() => {
                  handleImportAnimation(selectedAnimation);
                  setSelectedAnimation(null);
                }}
              >
                Import to After Effects
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnimationSearchResults;
