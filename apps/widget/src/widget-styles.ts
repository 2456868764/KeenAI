/** Injected into Shadow DOM — keeps host page CSS from leaking in/out. */
export const WIDGET_CSS = `
:host, .keenai-root {
  --widget-primary: #7c5cff;
  --widget-primary-strong: #6547e8;
  --widget-surface: #ffffff;
  --widget-surface-subtle: #f6f7fb;
  --widget-border: #e5e7ef;
  --widget-text: #1f2433;
  --widget-muted: #667085;
  --widget-agent-bubble: #f1f3f8;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: var(--widget-text);
  box-sizing: border-box;
}
*, *::before, *::after { box-sizing: inherit; }
button, input { font: inherit; }

.keenai-panel {
  width: 410px;
  max-width: calc(100vw - 32px);
  height: 640px;
  max-height: calc(100dvh - 96px);
  border: 1px solid rgba(20, 24, 36, 0.08);
  border-radius: 24px;
  background: var(--widget-surface);
  box-shadow: 0 24px 80px rgba(25, 30, 45, 0.24);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.keenai-panel[hidden] {
  display: none;
}

.keenai-header {
  min-height: 70px;
  padding: 18px 20px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(229, 231, 239, 0.7);
}

.keenai-header__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.keenai-header strong {
  font-size: 17px;
  font-weight: 750;
  color: var(--widget-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keenai-header span {
  font-size: 12px;
  color: var(--widget-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keenai-icon-button {
  border: 1px solid var(--widget-border);
  border-radius: 999px;
  background: #fff;
  color: var(--widget-text);
  min-width: 44px;
  height: 34px;
  padding: 0 10px;
  cursor: pointer;
}

.keenai-status {
  min-height: 24px;
  padding: 4px 20px;
  color: var(--widget-muted);
  font-size: 11px;
}

.keenai-view {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: linear-gradient(180deg, #fff 0%, #fafbff 100%);
}

.keenai-home,
.keenai-help,
.keenai-list {
  padding: 14px 16px 18px;
}

.keenai-hero {
  min-height: 190px;
  border-radius: 22px;
  padding: 22px;
  color: #fff;
  background: linear-gradient(140deg, var(--widget-primary) 0%, #4b7bec 100%);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
}

.keenai-avatar {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.2);
  display: grid;
  place-items: center;
  font-weight: 800;
  margin-bottom: auto;
  overflow: hidden;
}

.keenai-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.keenai-hero h2,
.keenai-empty-state h2 {
  margin: 0;
  font-size: 25px;
  line-height: 1.08;
  letter-spacing: 0;
}

.keenai-hero p,
.keenai-empty-state p,
.keenai-content-card p {
  margin: 0;
  color: inherit;
  opacity: 0.78;
}

.keenai-card-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.keenai-home-section {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.keenai-home-section h3 {
  margin: 0;
  color: var(--widget-text);
  font-size: 14px;
}

.keenai-action-card,
.keenai-content-card,
.keenai-search-card,
.keenai-conversation-row {
  width: 100%;
  border: 1px solid var(--widget-border);
  border-radius: 16px;
  background: #fff;
  color: var(--widget-text);
  box-shadow: 0 8px 24px rgba(25, 30, 45, 0.06);
}

.keenai-action-card,
.keenai-search-card,
.keenai-conversation-row {
  min-height: 62px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  cursor: pointer;
}

.keenai-action-card span,
.keenai-search-card span,
.keenai-conversation-row strong {
  font-weight: 700;
}

.keenai-action-card strong,
.keenai-search-card button,
.keenai-secondary-button,
.keenai-primary-button {
  border: none;
  border-radius: 999px;
  background: var(--widget-primary);
  color: #fff;
  padding: 8px 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.keenai-search-card {
  margin-top: 14px;
}

.keenai-list {
  display: grid;
  gap: 10px;
}

.keenai-conversation-row span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.keenai-conversation-row small {
  color: var(--widget-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keenai-conversation-row time {
  color: var(--widget-muted);
  font-size: 12px;
  white-space: nowrap;
}

.keenai-empty-state {
  min-height: 100%;
  padding: 24px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 12px;
  text-align: center;
}

.keenai-content-card {
  padding: 16px;
  display: grid;
  gap: 6px;
}

.keenai-content-button {
  text-align: left;
  cursor: pointer;
}

.keenai-content-card small {
  color: var(--widget-muted);
  font-weight: 700;
}

.keenai-detail {
  padding: 18px 16px;
  display: grid;
  gap: 10px;
}

.keenai-detail small {
  color: var(--widget-muted);
  font-weight: 700;
}

.keenai-detail h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.16;
  letter-spacing: 0;
}

.keenai-detail p {
  margin: 0;
  color: var(--widget-text);
  white-space: pre-wrap;
}

.keenai-text-button {
  justify-self: start;
  border: none;
  background: transparent;
  color: var(--widget-primary-strong);
  padding: 0;
  font-weight: 700;
  cursor: pointer;
}

.keenai-inline-status {
  margin: 0;
  color: var(--widget-muted);
  font-size: 12px;
}

.keenai-search {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--widget-muted);
  font-weight: 700;
}

.keenai-search input {
  width: 100%;
  border: 1px solid var(--widget-border);
  border-radius: 14px;
  padding: 12px 14px;
  color: var(--widget-text);
  background: #fff;
  outline: none;
}

.keenai-chip-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 10px;
}

.keenai-chip {
  border: 1px solid var(--widget-border);
  border-radius: 999px;
  background: #fff;
  color: var(--widget-muted);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.keenai-secondary-button {
  margin-top: 14px;
  width: 100%;
  background: #eef0ff;
  color: var(--widget-primary-strong);
}

.keenai-ticket-form {
  padding: 16px;
  display: grid;
  gap: 14px;
}

.keenai-ticket-form label {
  display: grid;
  gap: 8px;
  color: var(--widget-muted);
  font-weight: 700;
}

.keenai-ticket-form input,
.keenai-ticket-form textarea {
  width: 100%;
  border: 1px solid var(--widget-border);
  border-radius: 14px;
  background: #fff;
  color: var(--widget-text);
  padding: 11px 12px;
  outline: none;
}

.keenai-workflow-form {
  margin-top: 6px;
  display: grid;
  gap: 9px;
}

.keenai-workflow-form label {
  display: grid;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  color: var(--widget-muted);
}

.keenai-workflow-form input,
.keenai-workflow-form select {
  width: 100%;
  border: 1px solid rgba(31, 36, 51, 0.16);
  border-radius: 10px;
  background: #fff;
  color: var(--widget-text);
  padding: 7px 8px;
}

.keenai-workflow-form input[type="checkbox"] {
  width: 18px;
  height: 18px;
}

.keenai-ticket-form textarea {
  min-height: 150px;
  resize: vertical;
}

.keenai-ticket-form .keenai-primary-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.keenai-ticket-attachments {
  margin: -4px 0 0;
  padding: 0;
  display: grid;
  gap: 6px;
  list-style: none;
}

.keenai-ticket-attachments li {
  border: 1px solid var(--widget-border);
  border-radius: 10px;
  background: #fff;
  color: var(--widget-muted);
  padding: 7px 9px;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.keenai-form-error {
  margin: 0;
  color: #b42318;
}

.keenai-bottom-nav {
  min-height: 72px;
  padding: 8px 10px 12px;
  border-top: 1px solid var(--widget-border);
  background: rgba(255, 255, 255, 0.94);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.keenai-bottom-nav__item {
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--widget-muted);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  min-width: 0;
}

.keenai-bottom-nav__item.is-active {
  background: #f0edff;
  color: var(--widget-primary-strong);
}

.keenai-bottom-nav__dot {
  width: 18px;
  height: 18px;
  border-radius: 7px;
  border: 2px solid currentColor;
}

.keenai-chat-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.keenai-chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.keenai-messages {
  flex: 1;
  min-height: 0;
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
  border-top: 1px solid var(--widget-border);
  background: #fff;
}

.keenai-input {
  flex: 1;
  min-width: 0;
  border-radius: 12px;
  border: 1px solid var(--widget-border);
  background: #fff;
  color: var(--widget-text);
  padding: 9px 11px;
  font-size: 13px;
}

.keenai-input:disabled { opacity: 0.6; }

.keenai-answer-status {
  margin: 0 12px 10px;
  border: 1px solid var(--widget-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(25, 30, 45, 0.08);
  color: var(--widget-text);
  padding: 10px 12px;
  display: grid;
  gap: 6px;
}

.keenai-answer-status strong {
  font-size: 12px;
  color: var(--widget-muted);
}

.keenai-answer-status__text,
.keenai-answer-status__error {
  margin: 0;
  font-size: 13px;
}

.keenai-answer-status__error {
  color: #b42318;
}

.keenai-answer-citations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.keenai-answer-citation {
  border-radius: 999px;
  background: #eef0ff;
  color: var(--widget-primary-strong);
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
}

.keenai-answer-handoff {
  justify-self: start;
  border: none;
  border-radius: 999px;
  background: var(--widget-primary);
  color: #fff;
  padding: 7px 11px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.keenai-answer-handoff:disabled {
  opacity: 0.65;
  cursor: default;
}

.keenai-send,
.keenai-attach {
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 13px;
}

.keenai-send {
  background: var(--widget-primary);
  color: #fff;
  padding: 8px 12px;
  min-width: 52px;
  font-weight: 700;
}

.keenai-send:disabled,
.keenai-attach:disabled {
  opacity: 0.6;
  cursor: wait;
}

.keenai-attach {
  background: var(--widget-surface-subtle);
  color: var(--widget-text);
  padding: 8px 10px;
}

.keenai-bubble__image {
  max-width: 100%;
  max-height: 200px;
  border-radius: 10px;
  object-fit: contain;
}

.keenai-bubble__audio {
  max-width: 100%;
  min-width: 200px;
  height: 32px;
}

.keenai-bubble__video {
  max-width: 100%;
  max-height: 220px;
  border-radius: 10px;
}

.keenai-bubble__file {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  border-radius: 10px;
  border: 1px solid rgba(31, 36, 51, 0.12);
  padding: 6px 8px;
  color: inherit;
  text-decoration: none;
  overflow-wrap: anywhere;
  font-size: 12px;
}

.keenai-bubble__text--muted {
  opacity: 0.85;
  font-size: 12px;
}

.keenai-bubble {
  max-width: 85%;
  padding: 9px 11px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.keenai-bubble--user {
  align-self: flex-end;
  background: var(--widget-primary);
  color: #fff;
  border-bottom-right-radius: 6px;
}

.keenai-bubble--agent {
  align-self: flex-start;
  background: var(--widget-agent-bubble);
  color: var(--widget-text);
  border-bottom-left-radius: 6px;
}

.keenai-bubble__text { margin: 0; }

.keenai-bubble__time {
  font-size: 10px;
  opacity: 0.7;
  align-self: flex-end;
}

.keenai-launcher {
  margin-top: 10px;
  margin-left: auto;
  width: 58px;
  height: 58px;
  border-radius: 9999px;
  border: none;
  background: var(--widget-primary);
  color: #fff;
  cursor: pointer;
  font-weight: 800;
  box-shadow: 0 14px 36px rgba(47, 55, 90, 0.28);
}

@media (max-width: 480px) {
  .keenai-host {
    inset: auto 0 0 0 !important;
  }

  .keenai-panel {
    width: 100vw;
    max-width: 100vw;
    height: min(100dvh, 760px);
    max-height: 100dvh;
    border-radius: 22px 22px 0 0;
  }

  .keenai-launcher {
    margin-right: 16px;
    margin-bottom: 16px;
  }
}
`.trim();
