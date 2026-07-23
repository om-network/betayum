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
    const base = `http://localhost:${port}`;

    const warmup = async () => {
      await fetch(`${base}/org_warmup/tasks/tsk_warmup/automation/aut_warmup`).catch(() => {});
      await fetch(`${base}/api/tasks-automations/chat`, { method: "POST", body: "[]" }).catch(() => {});
      await fetch(`${base}/api/tasks-automations/models`).catch(() => {});
    };

    const tryWarmup = async (attemptsLeft: number) => {
      try {
        const res = await fetch(`${base}/api/health`).catch(() => null);
        if (res && res.ok) {
          await warmup();
          return;
        }
      } catch {}
      if (attemptsLeft > 0) setTimeout(() => tryWarmup(attemptsLeft - 1), 1000);
    };

    setTimeout(() => tryWarmup(15), 2000);
  }
}

export const onRequestError = Sentry.captureRequestError;
