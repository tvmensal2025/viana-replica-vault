import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
  });
}

const Fallback = () => (
  <div className="flex h-screen items-center justify-center bg-background text-foreground p-6 text-center">
    <div>
      <h1 className="text-xl font-semibold mb-2">Algo deu errado</h1>
      <p className="text-muted-foreground">Recarregue a página para tentar novamente.</p>
    </div>
  </div>
);

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<Fallback />}>
    <App />
  </Sentry.ErrorBoundary>
);
