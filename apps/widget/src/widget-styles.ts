/** Injected into Shadow DOM — keeps host page CSS from leaking in/out. */
export const WIDGET_CSS = `
:host, .keenai-root {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: #f4f4f5;
  box-sizing: border-box;
}
*, *::before, *::after { box-sizing: inherit; }

.keenai-panel {
  width: 360px;
  max-width: calc(100vw - 32px);
  height: 480px;
  max-height: 70vh;
  border-radius: 12px;
  background: #1a1a1f;
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.keenai-header {
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a32;
  font-weight: 600;
}

.keenai-status {
  padding: 4px 16px;
  font-size: 11px;
  color: #a1a1aa;
}

.keenai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.keenai-compose {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #2a2a32;
}

.keenai-input {
  flex: 1;
  border-radius: 8px;
  border: 1px solid #3f3f46;
  background: #0f0f12;
  color: #f4f4f5;
  padding: 8px 10px;
  font-size: 13px;
}

.keenai-input:disabled { opacity: 0.6; }

.keenai-send {
  border: none;
  border-radius: 8px;
  background: #7c3aed;
  color: #fff;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  min-width: 52px;
}

.keenai-send:disabled { opacity: 0.6; cursor: wait; }

.keenai-attach {
  border: none;
  border-radius: 8px;
  background: #27272a;
  color: #f4f4f5;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.keenai-bubble__image {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  object-fit: contain;
}

.keenai-bubble__text--muted { opacity: 0.85; font-size: 12px; }

.keenai-bubble {
  max-width: 85%;
  padding: 8px 10px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.keenai-bubble--user {
  align-self: flex-end;
  background: #7c3aed;
  color: #fff;
}

.keenai-bubble--agent {
  align-self: flex-start;
  background: #27272a;
  color: #f4f4f5;
}

.keenai-bubble__text { margin: 0; }

.keenai-bubble__time {
  font-size: 10px;
  opacity: 0.75;
  align-self: flex-end;
}

.keenai-launcher {
  margin-top: 8px;
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  border: none;
  background: #7c3aed;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(0,0,0,.25);
}

@media (max-width: 480px) {
  .keenai-host {
    inset: 0 !important;
    bottom: 0 !important;
    right: 0 !important;
    left: 0 !important;
    top: auto !important;
  }
  .keenai-panel {
    width: 100%;
    max-width: 100%;
    height: min(100dvh, 100%);
    max-height: 100dvh;
    border-radius: 16px 16px 0 0;
  }
}
`.trim();
