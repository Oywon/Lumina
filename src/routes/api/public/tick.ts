import { createFileRoute } from "@tanstack/react-router";

// Called every minute by pg_cron. Auth: apikey header must match Supabase publishable key.
// (No PII, no writes beyond simulation — this is a demo simulator.)
export const Route = createFileRoute("/api/public/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedApiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || providedApiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runSimulatorTick } = await import("@/lib/simulator.server");
        try {
          const result = await runSimulatorTick();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("[tick] failed", err);
          return Response.json(
            { ok: false, error: String((err as Error).message ?? err) },
            { status: 500 },
          );
        }
      },
      // Allow browser triggering for the demo (no auth): simulator has no privileged effects
      GET: async () => {
        const { runSimulatorTick } = await import("@/lib/simulator.server");
        const result = await runSimulatorTick();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
