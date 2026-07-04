import type { SnapshotRoom } from "@/lib/office-data.server";
import { Fan, Lightbulb } from "lucide-react";
import { motion } from "framer-motion";

export function OfficeLayout({
  rooms,
  onToggle,
}: {
  rooms: SnapshotRoom[];
  onToggle: (id: string, is_on: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {rooms.map((room, idx) => (
        <motion.div
          key={room.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.08, duration: 0.4, ease: "easeOut" }}
          whileHover={{ y: -3 }}
          className="relative aspect-4/3 overflow-hidden rounded-xl border border-border bg-(image:--gradient-surface) shadow-(--shadow-elegant)"
        >
          {/* grid backdrop */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          {/* Room label */}
          <div className="absolute left-3 top-3 z-10 rounded-md border border-border bg-surface-2/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-foreground backdrop-blur">
            {room.name}
          </div>
          <div className="absolute right-3 top-3 z-10 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-mono font-semibold text-primary backdrop-blur">
            {Math.round(room.watts_now)} W
          </div>

          {/* Furniture */}
          <svg
            viewBox="0 0 100 75"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            <rect
              x="35"
              y="42"
              width="30"
              height="12"
              fill="oklch(0.28 0.03 160)"
              stroke="oklch(0.40 0.05 155)"
              strokeWidth="0.4"
              rx="1.5"
            />
            <circle cx="30" cy="48" r="2.5" fill="oklch(0.35 0.04 160)" />
            <circle cx="70" cy="48" r="2.5" fill="oklch(0.35 0.04 160)" />
            <circle cx="50" cy="38" r="2.5" fill="oklch(0.35 0.04 160)" />
            <circle cx="50" cy="58" r="2.5" fill="oklch(0.35 0.04 160)" />
          </svg>

          {/* Devices */}
          {room.devices.map((d) => (
            <motion.button
              key={d.id}
              onClick={() => onToggle(d.id, !d.is_on)}
              whileHover={{ scale: 1.18 }}
              whileTap={{ scale: 0.92 }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${d.position_x}%`, top: `${d.position_y}%` }}
              title={`${d.label} — ${d.is_on ? "ON" : "OFF"} (${d.watts}W)`}
            >
              {d.kind === "fan" ? (
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                    d.is_on
                      ? "border-primary bg-primary/15 text-primary shadow-(--shadow-glow)"
                      : "border-border bg-surface-2 text-muted-foreground"
                  }`}
                >
                  <Fan
                    className={`h-4 w-4 ${d.is_on ? "animate-spin" : ""}`}
                    style={{ animationDuration: "1.2s" }}
                  />
                </div>
              ) : (
                <div
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    d.is_on
                      ? "bg-brand text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground border border-border"
                  }`}
                  style={
                    d.is_on
                      ? {
                          boxShadow:
                            "0 0 14px 4px oklch(0.85 0.22 140 / 0.55), 0 0 32px 10px oklch(0.78 0.20 145 / 0.25)",
                        }
                      : undefined
                  }
                >
                  <Lightbulb className="h-4 w-4" />
                </div>
              )}
            </motion.button>
          ))}
        </motion.div>
      ))}
    </div>
  );
}
