import type { SnapshotRoom } from "@/lib/office-data.server";
import { Fan, Lightbulb } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";

export function RoomPanel({
  room,
  onToggle,
}: {
  room: SnapshotRoom;
  onToggle: (id: string, is_on: boolean) => void;
}) {
  const onCount = room.devices.filter((d) => d.is_on).length;
  const utilization = room.devices.length
    ? (onCount / room.devices.length) * 100
    : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-(--shadow-elegant)"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: "var(--gradient-brand)" }}
      />
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {room.name}
        </h3>
        <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          {onCount}/{room.devices.length} on
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="tabular-nums text-2xl font-semibold text-primary">
          {Math.round(room.watts_now)}
          <span className="ml-1 text-xs font-medium text-muted-foreground">W</span>
        </span>
        <span className="tabular-nums text-sm text-muted-foreground">
          {room.kwh_today.toFixed(2)} kWh today
        </span>
      </div>
      {/* utilization bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "var(--gradient-brand)" }}
          initial={{ width: 0 }}
          animate={{ width: `${utilization}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <ul className="mt-4 divide-y divide-border/60">
        {room.devices.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between py-2.5 text-sm"
          >
            <div className="flex items-center gap-2.5">
              {d.kind === "fan" ? (
                <Fan
                  className={`h-4 w-4 ${
                    d.is_on
                      ? "text-primary animate-spin"
                      : "text-muted-foreground"
                  }`}
                  style={{ animationDuration: "1.2s" }}
                />
              ) : (
                <Lightbulb
                  className={`h-4 w-4 ${
                    d.is_on ? "text-brand-glow" : "text-muted-foreground"
                  }`}
                />
              )}
              <span
                className={
                  d.is_on
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {d.label}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground/70">
                {d.watts}W
              </span>
            </div>
            <Switch
              checked={d.is_on}
              onCheckedChange={(v) => onToggle(d.id, v)}
            />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
