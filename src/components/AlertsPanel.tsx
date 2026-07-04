import type { SnapshotAlert } from "@/lib/office-data.server";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function AlertsPanel({
  active,
  resolved,
}: {
  active: SnapshotAlert[];
  resolved: SnapshotAlert[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-(--shadow-elegant)">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: "var(--gradient-brand)" }}
      />
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Alerts
        </h2>
        <span className="text-[11px] font-mono text-muted-foreground">
          {active.length} active · {resolved.length} resolved
        </span>
      </div>
      {active.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4" />
          All clear — no active alerts.
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {active.map((a) => (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-start gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-danger" />
                <div className="flex-1">
                  <p className="text-sm text-foreground">{a.message}</p>
                  <p className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                    {formatTime(a.created_at)} · {a.kind}
                  </p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {resolved.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
          <CollapsibleTrigger className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary">
            {open ? "Hide" : "Show"} resolved history
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            {resolved.slice(0, 20).map((a) => (
              <div
                key={a.id}
                className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
              >
                <span>{a.message}</span>
                <span className="ml-2 font-mono text-muted-foreground/70">
                  {formatTime(a.created_at)} → resolved{" "}
                  {a.resolved_at ? formatTime(a.resolved_at) : "—"}
                </span>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
