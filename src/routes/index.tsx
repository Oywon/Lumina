import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getSnapshot,
  toggleDevice,
  updateSettings,
} from "@/lib/dashboard.functions";
import { OfficeLayout } from "@/components/OfficeLayout";
import { RoomPanel } from "@/components/RoomPanel";
import { AlertsPanel } from "@/components/AlertsPanel";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Zap, Clock } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Office Power Monitor — Live Dashboard" },
      {
        name: "description",
        content:
          "Live view of every fan and light in the office, real-time power draw, and after-hours alerts. Same data powers the Discord bot.",
      },
      { property: "og:title", content: "Office Power Monitor" },
      {
        property: "og:description",
        content:
          "Real-time dashboard of the office's 18 devices, kWh usage, and alerts.",
      },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["snapshot"],
      queryFn: () => getSnapshot(),
    }),
  component: Dashboard,
});

function Dashboard() {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: snap } = useQuery({
    queryKey: ["snapshot"],
    queryFn: () => getSnapshot(),
    refetchInterval: 5000,
  });

  // Realtime: refresh on devices/alerts/settings changes
  useEffect(() => {
    const ch = supabase
      .channel("dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        () => router.invalidate(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => router.invalidate(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => router.invalidate(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [router]);

  const toggleFn = useServerFn(toggleDevice);
  const toggleMut = useMutation({
    mutationFn: (input: { deviceId: string; is_on: boolean }) =>
      toggleFn({ data: input }),
    onSuccess: () => router.invalidate(),
  });

  const updateFn = useServerFn(updateSettings);
  const settingsMut = useMutation({
    mutationFn: (input: {
      office_open: string;
      office_close: string;
      long_on_minutes: number;
    }) => updateFn({ data: input }),
    onSuccess: () => {
      router.invalidate();
      setSettingsOpen(false);
    },
  });

  if (!snap) return null;

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 600px at 10% -10%, oklch(0.35 0.15 145 / 0.35), transparent 60%), radial-gradient(900px 500px at 100% 0%, oklch(0.30 0.12 160 / 0.30), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground shadow-(--shadow-glow)"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                Office Power Monitor
              </h1>
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                Live · 3 rooms · 18 devices
              </p>
            </div>
          </motion.div>
          <div className="flex items-center gap-3">
            <motion.span
              whileHover={{ scale: 1.03 }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                snap.withinOfficeHours
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-danger/40 bg-danger/10 text-danger"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {snap.withinOfficeHours ? "Office hours" : "After hours"}
              <span className="text-muted-foreground">
                · {snap.settings.office_open}–{snap.settings.office_close}
              </span>
            </motion.span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="border-border bg-secondary/40 hover:bg-primary/15 hover:text-primary hover:border-primary/40 transition-all"
            >
              <SettingsIcon className="h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Meter row */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MeterCard
            label="Total power now"
            value={`${Math.round(snap.totalWatts)} W`}
            highlight
          />
          <MeterCard
            label="Estimated today"
            value={`${snap.kwhToday.toFixed(2)} kWh`}
          />
          <MeterCard
            label="Active alerts"
            value={String(snap.activeAlerts.length)}
            danger={snap.activeAlerts.length > 0}
          />
        </section>

        {/* Office layout */}
        <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-(--shadow-elegant)">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Office layout · top view
            </h2>
            <p className="text-[11px] font-mono text-muted-foreground">
              Click a device to toggle (demo)
            </p>
          </div>
          <OfficeLayout
            rooms={snap.rooms}
            onToggle={(id, is_on) => toggleMut.mutate({ deviceId: id, is_on })}
          />
        </section>

        {/* Rooms & alerts */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {snap.rooms.map((r) => (
            <RoomPanel
              key={r.id}
              room={r}
              onToggle={(id, is_on) =>
                toggleMut.mutate({ deviceId: id, is_on })
              }
            />
          ))}
        </section>

        <section className="mt-6">
          <AlertsPanel
            active={snap.activeAlerts}
            resolved={snap.resolvedAlerts}
          />
        </section>

        <footer className="mt-12 mb-6 text-center text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          Same backend powers the Discord bot · Simulator ticks every minute
        </footer>
      </main>

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={snap.settings}
        saving={settingsMut.isPending}
        onSave={(v) => settingsMut.mutate(v)}
      />
    </div>
  );
}

function MeterCard({
  label,
  value,
  highlight,
  danger,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-(--shadow-elegant)"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
        style={{ background: "var(--gradient-brand)" }}
      />
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "var(--brand)" }}
      />
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-3 text-4xl font-semibold tabular-nums tracking-tight ${
          danger
            ? "text-danger"
            : highlight
              ? "text-primary"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
    </motion.div>
  );
}

