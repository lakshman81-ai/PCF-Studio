/**
 * ray-pcf-fixer-tab.js — PCF Fixer React integration for index.html
 * Mounts the full PCF-Fixer React app directly into the PCF FIXER tab panel
 * Status bar is completely isolated within the panel (not merged with index.html's main status bar)
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import '../pcf-fixer/index.css';
import PcfFixerApp from '../pcf-fixer/App.jsx';

export async function initRayPcfFixerTab() {
  const container = document.getElementById('pcf-fixer-react-root');
  if (!container) {
    console.warn('[RayPcfFixerTab] React root element (pcf-fixer-react-root) not found');
    return;
  }

  try {
    console.info('[RayPcfFixerTab] Mounting PCF-Fixer React app...');
    const root = createRoot(container);
    // App component already wraps MainApp with AppProvider, so mount directly
    root.render(React.createElement(PcfFixerApp));
    console.info('[RayPcfFixerTab] PCF-Fixer app mounted successfully');
  } catch (err) {
    console.error('[RayPcfFixerTab] Failed to mount PCF-Fixer app:', err);
    if (container) {
      container.innerHTML = `<div style="padding:2rem;color:var(--text-muted);text-align:center">
        <div style="font-size:1.5rem;margin-bottom:1rem">❌</div>
        <p style="margin-bottom:0.5rem;font-family:var(--font-code)">Failed to load PCF-Fixer app</p>
        <p style="font-size:0.85rem;color:var(--text-muted)">${err.message}</p>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:1rem">Check browser console for details</p>
      </div>`;
    }
  }
}
