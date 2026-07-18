import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Last line of defense: without a boundary, any uncaught render exception
 * unmounts the entire React root into a blank white page. Edits are
 * autosaved to this browser every ~600ms of inactivity, so the fallback can
 * honestly point users at reload/session-resume instead of dead air.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // This app is local-first with no telemetry backend by design; the
    // console is the only place a crash can be recorded.
    console.error("Unhandled render error", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary__card">
          <strong>Something went wrong.</strong>
          <p>
            The editor hit an unexpected error. Your edits are autosaved locally —
            reloading restores the most recent save.
          </p>
          <div className="error-boundary__actions">
            <button type="button" onClick={this.handleReload}>
              Reload editor
            </button>
            <button type="button" onClick={this.handleGoHome}>
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
