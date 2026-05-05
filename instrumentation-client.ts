// Sentry — single source of client-side initialisation for the browser.
// (instrumentation.ts handles server-side via instrumentationHook.)
//
// Use NEXT_PUBLIC_SENTRY_DSN so the same code path skips init when the env
// var is missing (e.g. local dev without Sentry credentials).

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Lower trace sample so we don't burn quota on every page navigation.
    tracesSampleRate: 0.1,
    // Replay is expensive on interaction-heavy pages (the schematic editor
    // dispatches mouse/move events constantly). Keep session sampling low,
    // but record everything when an error fires.
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration({
      // Don't mask schematic content — it's not PII and masking impedes
      // debugging. Inputs are still masked by default (Sentry SDK default).
      maskAllText: false,
      blockAllMedia: false,
    })],
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
