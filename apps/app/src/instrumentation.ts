import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "development") {
    const port = process.env.PORT ?? "3000";
    setTimeout(() => {
      fetch(`http://localhost:${port}/org_warmup/tasks/tsk_warmup/automation/aut_warmup`).catch(() => {});
    }, 2000);
  }
}

export const onRequestError = Sentry.captureRequestError;
