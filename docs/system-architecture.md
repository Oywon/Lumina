# System Architecture

Not a Mermaid diagram — this file describes exactly what to draw in draw.io, Excalidraw, or on paper.

## Blocks (left → right)

1. **Physical devices (conceptual)** — 3 rooms, each with 2 fans + 3 lights (15 total).
2. **Sensing layer (conceptual, per room)** — ESP32 microcontroller with:
   - Digital GPIO reading each relay's ON/OFF state (or driving them, in the real build).
   - One ACS712 current sensor on the mains feed for whole-room power sensing.
   - Wi-Fi uplink → REST POST to backend.
3. **Simulator** — because there's no real hardware for the demo, a server-side job replaces the sensing layer:
   - `pg_cron` runs every minute inside the database.
   - It calls `POST /api/public/tick` on the TanStack Start app.
   - The tick handler probabilistically toggles device states, appends to history, and accumulates Wh per hour.
4. **Backend (Lovable Cloud / Postgres)** — single source of truth:
   - Tables: `rooms`, `devices`, `device_state_history`, `hourly_usage`, `alerts`, `settings`.
   - Realtime publication on `devices`, `alerts`, `settings`.
5. **Alert engine** — runs inside every simulator tick:
   - After-hours alert: any device ON outside `settings.office_open`–`settings.office_close`.
   - Long-on alert: a room whose devices have all been ON for ≥ `settings.long_on_minutes`.
   - New alerts are inserted; existing alerts auto-resolve when the condition clears.
6. **Web dashboard (TanStack Start, `/`)**:
   - Loads a snapshot via `getSnapshot` server function.
   - Subscribes to Supabase Realtime on `devices` / `alerts` / `settings` and refetches on any change.
   - Also polls every 5s as a fallback.
   - Manual toggles use the `toggleDevice` server function.
7. **Discord bot** (`POST /api/public/discord`):
   - Verifies Ed25519 signature.
   - Handles PING (type 1) and APPLICATION_COMMAND (type 2).
   - Loads the same snapshot from the DB, then calls Lovable AI Gateway (Gemini 3 Flash) with a compact JSON `DATA:` context and a friendly-office-assistant system prompt.
   - Falls back to a templated reply if the LLM call errors or times out (>2.2s budget).
8. **Proactive alerts** *(bonus)* — when the simulator inserts a new alert, it POSTs a message to `DISCORD_ALERT_WEBHOOK_URL` (if configured).

## Arrows to draw

- `pg_cron` → `/api/public/tick` (labeled "every minute, apikey header")
- `/api/public/tick` → `Postgres` (writes: devices, history, hourly_usage, alerts)
- `Postgres` → `Web dashboard` (realtime WebSocket + REST for snapshot)
- `Web dashboard` → `toggleDevice serverFn` → `Postgres`
- `Discord user` → `Discord API` → `/api/public/discord` → `Postgres` (read)
- `/api/public/discord` → `Lovable AI Gateway` → back to `/api/public/discord` → `Discord user`
- `/api/public/tick` (on new alert) → `Discord webhook URL` → `#alerts channel`

## One line summary

Every action — a simulated toggle, a Discord command, a settings change — reads or writes the same Postgres. Both surfaces (dashboard and bot) show the same reality within seconds.
