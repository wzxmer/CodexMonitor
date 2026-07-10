import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { resolveAppLanguage } from "@/features/i18n/appLanguage";
import { I18N_STRINGS } from "@/features/i18n/strings";

type RootErrorBoundaryProps = {
  children: ReactNode;
};

type RootErrorBoundaryState = {
  hasError: boolean;
};

export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack ?? "",
        },
      },
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const language = resolveAppLanguage("system");
    const strings = I18N_STRINGS[language];
    return (
      <main className="app-crash-fallback" role="alert">
        <div className="app-crash-fallback-card">
          <h1>{strings["app.crash.title"]}</h1>
          <p>{strings["app.crash.description"]}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {strings["app.crash.reload"]}
          </button>
        </div>
      </main>
    );
  }
}
