
# Office Electricity Monitor — Plan

Build a live dashboard + Discord slash-command bot on a shared Lovable Cloud backend that simulates 18 devices across 3 rooms, tracks power/kWh, and raises configurable alerts.

## Architecture

```text
[pg_cron: simulator tick / minute]
        │
        ▼
[Lovable Cloud DB: rooms, devices, state_history, hourly_usage, alerts, settings]
        ▲                    ▲
        │ realtime           │ read/write
        │                    │
[Web Dashboard (TanStack)]   [/api/public/discord — slash-command interactions]
                                     │
                                     ▼
                            [Lovable AI Gateway → Gemini 3 Flash]
                                     │
                                     ▼
                              [Discord user in server]
```

Single source of truth = the database. Both surfaces read/write it. Dashboard subscribes via Supabase Realtime for push updates (no refresh).

## Data model (migrations)

- `rooms` — id, slug (`drawing`, `work1`, `work2`), name
- `devices` — id, room_id, kind (`fan`|`light`), label (`Fan 1`, `Light 3`), watts (fan 60, light 15), is_on bool, last_changed timestamptz
- `device_state_history` — device_id, is_on, changed_at (for "ON for 2h" detection & kWh)
- `hourly_usage` — room_id nullable, hour timestamptz, wh numeric (accumulated Wh per hour; today's kWh = sum where hour::date = today)
- `alerts` — id, kind (`after_hours`|`room_long_on`), room_id, message, created_at, resolved_at
- `settings` — singleton row: office_open (09:00), office_close (17:00), long_on_minutes (120), tick_seconds (60)

RLS: readable by `anon` (public dashboard is fine per brief — no PII). Writes only via server functions using service role.

## Simulator (server-side cron)

- Public route `POST /api/public/tick` protected by `CRON_SECRET`.
- pg_cron job calls it every minute.
- Logic per tick:
  - During office hours: high probability devices ON, small chance of toggles (mimic people entering/leaving).
  - After hours: gradually turn off, but leave a random "forgotten" device or two so alerts have something to fire on.
  - Write state changes to `device_state_history`, update `devices.is_on` + `last_changed`.
  - Add elapsed Wh to current hour bucket in `hourly_usage`.
  - Evaluate alert rules from `settings`, insert into `alerts`, and (bonus) POST to Discord alert webhook.
- Manual dashboard toggles also allowed (server fn) so demo is interactive.

## Web dashboard (`/`)

Style: **Clean daylight** — bg `#F8FAFC`, ink `#0F172A`, primary `#2563EB`, accent `#F97316`. Inter for body, sturdy sans display for numbers.

Sections:
1. **Header meter** — Total Watts now, today's kWh, office-hours status pill.
2. **Top-view office layout** — SVG floor plan of 3 rooms with chairs/tables; each light glows amber when ON, each fan has a CSS-spin animation when ON. Click a device to toggle (demo control).
3. **Per-room panels** — device list with ON/OFF pills, per-room W, per-room today kWh.
4. **Alerts panel** — active alerts with timestamps, resolved history collapsible.
5. **Settings drawer** — edit office hours, long-on threshold, tick cadence.

Live updates via Supabase Realtime on `devices` and `alerts` tables + a 5s poll fallback for aggregates.

## Discord bot (HTTP interactions)

- Register 3 slash commands with Discord: `/status`, `/room name:<drawing|work1|work2>`, `/usage`.
- Endpoint: `POST /api/public/discord` — verifies Ed25519 signature using `DISCORD_PUBLIC_KEY`, handles PING, dispatches commands.
- Each command loads live data from the same DB, then calls Gemini 3 Flash via Lovable AI Gateway with a compact JSON context and a "friendly office-assistant" system prompt to humanize the reply. Fallback to templated string on LLM failure.
- Bonus: alert evaluator posts to a Discord channel via `DISCORD_ALERT_WEBHOOK_URL` when a new alert is created.

Secrets needed (via add_secret, after user confirms):
- `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN` (for command registration script), `DISCORD_ALERT_WEBHOOK_URL` (optional, for proactive alerts)
- `CRON_SECRET` (auto-generated)

A one-time `scripts/register-discord-commands.ts` documented in README registers the slash commands.

## Diagrams & schematic (provided as guidance, not built)

Deliverables I'll write into `/docs` in the repo:
- `docs/system-architecture.md` — described block diagram with the flow above (user draws in draw.io/Excalidraw).
- `docs/hardware-schematic.md` — pin-mapping table for one representative room (ESP32 + 5 devices): 2 relays for fans on GPIO 25/26, 3 relays for lights on GPIO 27/32/33, ACS712 current sensor on ADC GPIO 34, common ground, external 5V for relay coil, opto-isolation notes. Connection list + electrical reasoning; user builds in Wokwi.

## Trade-offs

- HTTP-interactions bot means no persistent gateway connection needed → runs fully on Lovable's edge, but only supports slash commands (not classic `!` prefix). Brief allows any command style.
- pg_cron tick = 1 minute granularity; fine for W/kWh but not sub-second animation. Dashboard fan spin is pure CSS, decoupled.
- kWh is estimated from state × wattage over time, not measured — matches "simulated" scope.
- Public read RLS keeps demo simple; if the boss wants auth-gated dashboard, that's an add-on.

## Validation

- Seed migration inserts 3 rooms + 15 devices with correct wattages; verify counts with SQL.
- Manually invoke `/api/public/tick` a few times → confirm `devices.is_on`, `hourly_usage`, and `alerts` update.
- Load dashboard → toggle a device → see UI update within ~1s (realtime).
- Simulate a Discord interaction with signed test payload → confirm `/status` returns humanized text.
- Fast-forward `settings` (set office_close in the past) → confirm after-hours alert fires and webhook posts.

## Build order

1. Enable Lovable Cloud + migrations (schema, seed, RLS, pg_cron).
2. Server fns: `getDashboardSnapshot`, `toggleDevice`, `updateSettings`.
3. Tick endpoint + cron job.
4. Dashboard UI (layout, panels, alerts, settings drawer, realtime wiring).
5. Discord interactions endpoint + LLM reply layer + registration script.
6. Docs: README, architecture, schematic guidance.

Confirm and I'll start with Cloud + schema, then build outward.
