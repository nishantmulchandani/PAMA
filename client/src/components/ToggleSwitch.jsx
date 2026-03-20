import React from 'react';
import './ToggleSwitch.css';

const ToggleSwitch = ({ 
  id, 
  label, 
  checked, 
  onChange, 
  disabled = false,
  size = 'medium' // 'small', 'medium', 'large'
}) => {
  return (
    <div className={`toggle-switch-container ${size} ${disabled ? 'disabled' : ''}`}>
      <label htmlFor={id} className="toggle-switch-label">
        <span className="toggle-switch-text">{label}</span>
        <div className="toggle-switch-wrapper">
          <input
            type="checkbox"
            id={id}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="toggle-switch-input"
          />
          <div className="toggle-switch-slider">
            <div className="toggle-switch-thumb"></div>
          </div>
        </div>
      </label>
    </div>
  );
};

export default ToggleSwitch;
