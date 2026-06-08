import * as Sentry from "@sentry/browser";

let _initialized = false;

export function initSentry(): void {
  if (_initialized) return;
  _initialized = true;

  Sentry.init({
    dsn: "https://11607d50f70d8b3ced7bafb2e280cda2@o4510248801402880.ingest.us.sentry.io/4511527329857536",
    tracesSampleRate: 0,
    environment: "production",
  });
}
