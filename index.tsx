
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 20, color: '#ff6b6b', background: '#1a1a2e',
          minHeight: '100vh', fontFamily: 'monospace', fontSize: 14,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all'
        }}>
          <h1 style={{ color: '#fff', fontSize: 20 }}>APP ERROR</h1>
          <p><strong>Message:</strong> {this.state.error.message}</p>
          <p><strong>Stack:</strong> {this.state.error.stack}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Also catch non-React errors
window.onerror = (msg, src, line, col, err) => {
  document.getElementById('root')!.innerHTML = `
    <div style="padding:20px;color:#ff6b6b;background:#1a1a2e;min-height:100vh;font-family:monospace;font-size:14px;white-space:pre-wrap;">
      <h1 style="color:#fff;font-size:20px;">GLOBAL ERROR</h1>
      <p><b>Message:</b> ${msg}</p>
      <p><b>Source:</b> ${src}:${line}:${col}</p>
      <p><b>Stack:</b> ${err?.stack || 'N/A'}</p>
    </div>`;
};

window.addEventListener('unhandledrejection', (e) => {
  document.getElementById('root')!.innerHTML = `
    <div style="padding:20px;color:#ff6b6b;background:#1a1a2e;min-height:100vh;font-family:monospace;font-size:14px;white-space:pre-wrap;">
      <h1 style="color:#fff;font-size:20px;">UNHANDLED PROMISE REJECTION</h1>
      <p><b>Reason:</b> ${e.reason?.message || e.reason}</p>
      <p><b>Stack:</b> ${e.reason?.stack || 'N/A'}</p>
    </div>`;
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
