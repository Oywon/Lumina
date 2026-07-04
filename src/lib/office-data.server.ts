// Server-only helpers used by dashboard server functions and Discord bot.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SnapshotDevice = {
  id: string;
  kind: "fan" | "light";
  label: string;
  watts: number;
  is_on: boolean;
  last_changed: string;
  position_x: number;
  position_y: number;
};
export type SnapshotRoom = {
  id: string;
  slug: string;
  name: string;
  devices: SnapshotDevice[];
  watts_now: number;
  kwh_today: number;
};
export type SnapshotAlert = {
  id: string;
  kind: string;
  room_id: string | null;
  message: string;
  created_at: string;
  resolved_at: string | null;
};
export type Snapshot = {
  rooms: SnapshotRoom[];
  totalWatts: number;
  kwhToday: number;
  activeAlerts: SnapshotAlert[];
  resolvedAlerts: SnapshotAlert[];
  settings: {
    office_open: string;
    office_close: string;
    long_on_minutes: number;
    timezone: string;
  };
  withinOfficeHours: boolean;
  now: string;
};

type MemoryDevice = SnapshotDevice & { room_id: string };
type MemoryRoom = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
};
type MemoryAlert = SnapshotAlert;
type MemorySettings = Snapshot["settings"];
type MemoryState = {
  rooms: MemoryRoom[];
  devices: MemoryDevice[];
  alerts: MemoryAlert[];
  settings: MemorySettings;
  hourlyUsage: Array<{ room_id: string; hour: string; wh: number }>;
  lastTickAt: string;
};

type MemoryStateGlobal = typeof globalThis & {
  __luminaOfficeState?: MemoryState;
};

function timeStrToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function currentMinutesInTz(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}
function hasSupabaseConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function createInitialMemoryState(): MemoryState {
  const rooms: MemoryRoom[] = [
    { id: "room-drawing", slug: "drawing", name: "Drawing Room", sort_order: 1 },
    { id: "room-work1", slug: "work1", name: "Work Room 1", sort_order: 2 },
    { id: "room-work2", slug: "work2", name: "Work Room 2", sort_order: 3 },
  ];
  const nowIso = new Date().toISOString();
  const devices: MemoryDevice[] = rooms.flatMap((room) => [
    { id: `${room.id}-fan-1`, room_id: room.id, kind: "fan" as const, label: "Fan 1", watts: 60, is_on: room.slug === "drawing" ? true : false, last_changed: nowIso, position_x: 30, position_y: 30 },
    { id: `${room.id}-fan-2`, room_id: room.id, kind: "fan" as const, label: "Fan 2", watts: 60, is_on: room.slug === "work2" ? true : false, last_changed: nowIso, position_x: 70, position_y: 30 },
    { id: `${room.id}-light-1`, room_id: room.id, kind: "light" as const, label: "Light 1", watts: 15, is_on: room.slug === "drawing" ? true : room.slug === "work2" ? true : false, last_changed: nowIso, position_x: 20, position_y: 70 },
    { id: `${room.id}-light-2`, room_id: room.id, kind: "light" as const, label: "Light 2", watts: 15, is_on: room.slug === "work2" ? true : false, last_changed: nowIso, position_x: 50, position_y: 70 },
    { id: `${room.id}-light-3`, room_id: room.id, kind: "light" as const, label: "Light 3", watts: 15, is_on: room.slug === "drawing" ? true : false, last_changed: nowIso, position_x: 80, position_y: 70 },
  ]);
  return {
    rooms,
    devices,
    alerts: [],
    settings: {
      office_open: "09:00",
      office_close: "17:00",
      long_on_minutes: 120,
      timezone: "Asia/Dhaka",
    },
    hourlyUsage: [],
    lastTickAt: new Date(0).toISOString(),
  };
}
function getMemoryState(): MemoryState {
  const globalObj = globalThis as MemoryStateGlobal;
  if (!globalObj.__luminaOfficeState) {
    globalObj.__luminaOfficeState = createInitialMemoryState();
  }
  return globalObj.__luminaOfficeState;
}
function pickTargetProb(kind: "fan" | "light", withinHours: boolean): number {
  if (withinHours) return kind === "light" ? 0.85 : 0.6;
  return 0.08;
}
function buildSnapshotFromState(state: MemoryState, now: Date): Snapshot {
  const roomsOut: SnapshotRoom[] = state.rooms
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((room) => {
      const devices = state.devices
        .filter((device) => device.room_id === room.id)
        .map((device) => ({
          id: device.id,
          kind: device.kind,
          label: device.label,
          watts: Number(device.watts),
          is_on: device.is_on,
          last_changed: device.last_changed,
          position_x: Number(device.position_x),
          position_y: Number(device.position_y),
        }));
      const watts_now = devices.filter((device) => device.is_on).reduce((sum, device) => sum + device.watts, 0);
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const kwh_today = state.hourlyUsage
        .filter((entry) => entry.room_id === room.id && new Date(entry.hour) >= startOfDay)
        .reduce((sum, entry) => sum + Number(entry.wh), 0) / 1000;
      return {
        id: room.id,
        slug: room.slug,
        name: room.name,
        devices,
        watts_now,
        kwh_today,
      };
    });
  const totalWatts = roomsOut.reduce((sum, room) => sum + room.watts_now, 0);
  const activeAlerts = state.alerts.filter((alert) => !alert.resolved_at);
  const resolvedAlerts = state.alerts.filter((alert) => alert.resolved_at);
  const minutes = currentMinutesInTz(state.settings.timezone);
  const withinOfficeHours =
    minutes >= timeStrToMin(state.settings.office_open) &&
    minutes < timeStrToMin(state.settings.office_close);
  return {
    rooms: roomsOut,
    totalWatts,
    kwhToday: state.hourlyUsage.reduce((sum, entry) => sum + Number(entry.wh), 0) / 1000,
    activeAlerts,
    resolvedAlerts,
    settings: state.settings,
    withinOfficeHours,
    now: now.toISOString(),
  };
}
function addHourlyUsage(state: MemoryState, roomId: string, watts: number, hour: Date) {
  const hourKey = hour.toISOString();
  const existing = state.hourlyUsage.find((entry) => entry.room_id === roomId && entry.hour === hourKey);
  if (existing) {
    existing.wh += watts / 60;
  } else {
    state.hourlyUsage.push({ room_id: roomId, hour: hourKey, wh: watts / 60 });
  }
}
function runMemoryTick(state: MemoryState, now: Date): Snapshot {
  const settings = state.settings;
  const { minutes, date } = (() => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: settings.timezone,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return { minutes: h * 60 + m, date: now };
  })();
  const withinHours = minutes >= timeStrToMin(settings.office_open) && minutes < timeStrToMin(settings.office_close);
  const hour = new Date(date);
  hour.setUTCMinutes(0, 0, 0);

  for (const device of state.devices) {
    if (device.is_on) {
      addHourlyUsage(state, device.room_id, device.watts, hour);
    }
  }

  for (const device of state.devices) {
    const target = pickTargetProb(device.kind, withinHours);
    const toggleChance = withinHours ? 0.08 : 0.12;
    if (Math.random() < toggleChance) {
      const shouldBeOn = Math.random() < target;
      if (shouldBeOn !== device.is_on) {
        device.is_on = shouldBeOn;
        device.last_changed = date.toISOString();
      }
    }
  }

  const activeAlerts = state.alerts.filter((alert) => !alert.resolved_at);
  const createAlert = (kind: string, room_id: string | null, message: string) => {
    const existing = activeAlerts.some((alert) => alert.kind === kind && alert.room_id === room_id);
    if (!existing) {
      state.alerts.push({
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        kind,
        room_id,
        message,
        created_at: date.toISOString(),
        resolved_at: null,
      });
    }
  };

  if (!withinHours) {
    for (const room of state.rooms) {
      const roomDevices = state.devices.filter((device) => device.room_id === room.id);
      const onDevices = roomDevices.filter((device) => device.is_on);
      if (onDevices.length > 0) {
        createAlert("after_hours", room.id, `${room.name}: ${onDevices.length} device(s) still ON after office hours.`);
      }
    }
  }

  const cutoff = new Date(date.getTime() - settings.long_on_minutes * 60_000);
  for (const room of state.rooms) {
    const roomDevices = state.devices.filter((device) => device.room_id === room.id);
    if (roomDevices.length > 0 && roomDevices.every((device) => device.is_on)) {
      const oldestOn = roomDevices
        .map((device) => device.last_changed)
        .filter(Boolean)
        .map((value) => new Date(value))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (oldestOn && oldestOn <= cutoff) {
        createAlert("room_long_on", room.id, `${room.name}: all devices have been ON for over ${settings.long_on_minutes} minutes.`);
      }
    }
  }

  for (const alert of activeAlerts) {
    const roomId = alert.room_id;
    if (!roomId) continue;
    const roomDevices = state.devices.filter((device) => device.room_id === roomId);
    const stillTrue =
      alert.kind === "after_hours"
        ? !withinHours && roomDevices.some((device) => device.is_on)
        : alert.kind === "room_long_on"
          ? roomDevices.length > 0 && roomDevices.every((device) => device.is_on)
          : false;
    if (!stillTrue) {
      alert.resolved_at = date.toISOString();
    }
  }

  state.lastTickAt = date.toISOString();
  return buildSnapshotFromState(state, date);
}

export async function loadSnapshot(): Promise<Snapshot> {
  const now = new Date();
  if (!hasSupabaseConfig()) {
    const state = getMemoryState();
    if (Date.now() - new Date(state.lastTickAt).getTime() > 60_000) {
      runMemoryTick(state, now);
    }
    return buildSnapshotFromState(state, now);
  }

  const [{ data: rooms }, { data: devices }, { data: alerts }, { data: settingsRows }] =
    await Promise.all([
      supabaseAdmin.from("rooms").select("*").order("sort_order"),
      supabaseAdmin.from("devices").select("*"),
      supabaseAdmin.from("alerts").select("*").order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("settings").select("*").eq("id", 1).limit(1),
    ]);

  const settings = (settingsRows?.[0] ?? {
    office_open: "09:00",
    office_close: "17:00",
    long_on_minutes: 120,
    timezone: "Asia/Dhaka",
  }) as Snapshot["settings"];

  const nowInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const startOfDay = new Date(`${nowInTz}T00:00:00`);
  const { data: usage } = await supabaseAdmin
    .from("hourly_usage")
    .select("room_id, wh, hour")
    .gte("hour", new Date(startOfDay.getTime() - 12 * 3600_000).toISOString());

  const kwhByRoom = new Map<string, number>();
  let kwhToday = 0;
  for (const u of usage ?? []) {
    const wh = Number(u.wh);
    kwhByRoom.set(u.room_id as string, (kwhByRoom.get(u.room_id as string) ?? 0) + wh);
    kwhToday += wh;
  }

  const roomsOut: SnapshotRoom[] = (rooms ?? []).map((r) => {
    const dev = ((devices ?? []) as SnapshotDevice[])
      .filter((d) => (d as unknown as { room_id: string }).room_id === r.id)
      .map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        watts: Number(d.watts),
        is_on: d.is_on,
        last_changed: d.last_changed,
        position_x: Number(d.position_x),
        position_y: Number(d.position_y),
      }));
    const watts_now = dev.filter((d) => d.is_on).reduce((sum, d) => sum + d.watts, 0);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      devices: dev,
      watts_now,
      kwh_today: (kwhByRoom.get(r.id) ?? 0) / 1000,
    };
  });

  const totalWatts = roomsOut.reduce((sum, room) => sum + room.watts_now, 0);
  const activeAlerts = (alerts ?? []).filter((alert) => !alert.resolved_at) as SnapshotAlert[];
  const resolvedAlerts = (alerts ?? []).filter((alert) => alert.resolved_at) as SnapshotAlert[];

  const minutes = currentMinutesInTz(settings.timezone);
  const withinOfficeHours =
    minutes >= timeStrToMin(settings.office_open) &&
    minutes < timeStrToMin(settings.office_close);

  return {
    rooms: roomsOut,
    totalWatts,
    kwhToday: kwhToday / 1000,
    activeAlerts,
    resolvedAlerts,
    settings,
    withinOfficeHours,
    now: new Date().toISOString(),
  };
}

export async function toggleDeviceState(deviceId: string, is_on: boolean) {
  if (!hasSupabaseConfig()) {
    const state = getMemoryState();
    const device = state.devices.find((entry) => entry.id === deviceId);
    if (!device) throw new Error("Device not found");
    device.is_on = is_on;
    device.last_changed = new Date().toISOString();
    return { ok: true };
  }

  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { error } = await admin.from("devices").update({ is_on, last_changed: nowIso }).eq("id", deviceId);
  if (error) throw new Error(error.message);
  await admin.from("device_state_history").insert({ device_id: deviceId, is_on, changed_at: nowIso });
  return { ok: true };
}

export async function updateSettingsState(data: { office_open: string; office_close: string; long_on_minutes: number }) {
  if (!hasSupabaseConfig()) {
    const state = getMemoryState();
    state.settings = { ...state.settings, ...data };
    return { ok: true };
  }

  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { error } = await admin.from("settings").update({ ...data, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function runSimulatorTick() {
  if (!hasSupabaseConfig()) {
    const state = getMemoryState();
    return runMemoryTick(state, new Date());
  }

  const [{ data: rooms }, { data: devices }, { data: settingsRows }] =
    await Promise.all([
      supabaseAdmin.from("rooms").select("*").order("sort_order"),
      supabaseAdmin.from("devices").select("*"),
      supabaseAdmin.from("settings").select("*").eq("id", 1).limit(1),
    ]);
  if (!rooms || !devices || !settingsRows?.[0]) {
    throw new Error("Missing seed data");
  }
  const settings = settingsRows[0] as Snapshot["settings"];
  const { minutes, date } = (() => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: settings.timezone,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return { minutes: h * 60 + m, date: now };
  })();
  const openMin = timeStrToMin(settings.office_open);
  const closeMin = timeStrToMin(settings.office_close);
  const withinHours = minutes >= openMin && minutes < closeMin;

  const hour = new Date(date);
  hour.setUTCMinutes(0, 0, 0);
  const perRoomWh = new Map<string, number>();
  for (const device of devices as Array<SnapshotDevice & { room_id: string }>) {
    if (!device.is_on) continue;
    perRoomWh.set(device.room_id, (perRoomWh.get(device.room_id) ?? 0) + Number(device.watts) / 60);
  }
  for (const [roomId, wh] of perRoomWh) {
    const { data: existing } = await supabaseAdmin
      .from("hourly_usage")
      .select("id, wh")
      .eq("room_id", roomId)
      .eq("hour", hour.toISOString())
      .maybeSingle();
    if (existing) {
      await supabaseAdmin.from("hourly_usage").update({ wh: Number(existing.wh) + wh }).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("hourly_usage").insert({ room_id: roomId, hour: hour.toISOString(), wh });
    }
  }

  const changes: { id: string; is_on: boolean }[] = [];
  for (const device of devices as Array<SnapshotDevice & { room_id: string }>) {
    const target = pickTargetProb(device.kind, withinHours);
    const toggleChance = withinHours ? 0.08 : 0.12;
    if (Math.random() < toggleChance) {
      const shouldBeOn = Math.random() < target;
      if (shouldBeOn !== device.is_on) changes.push({ id: device.id, is_on: shouldBeOn });
    }
  }
  if (changes.length > 0) {
    const nowIso = date.toISOString();
    for (const change of changes) {
      await supabaseAdmin.from("devices").update({ is_on: change.is_on, last_changed: nowIso }).eq("id", change.id);
      await supabaseAdmin.from("device_state_history").insert({ device_id: change.id, is_on: change.is_on, changed_at: nowIso });
    }
  }

  const { data: activeAlerts } = await supabaseAdmin.from("alerts").select("id, kind, room_id").is("resolved_at", null);
  const activeSet = new Set((activeAlerts ?? []).map((alert) => `${alert.kind}:${alert.room_id ?? ""}`));
  const { data: latestDevices } = await supabaseAdmin.from("devices").select("*");
  const roomsById = new Map((rooms as Array<{ id: string; name: string }>).map((room) => [room.id, room]));
  const byRoom = new Map<string, Array<SnapshotDevice & { room_id: string }>>();
  for (const device of (latestDevices ?? []) as Array<SnapshotDevice & { room_id: string }>) {
    if (!byRoom.has(device.room_id)) byRoom.set(device.room_id, []);
    byRoom.get(device.room_id)!.push(device);
  }

  const newAlerts: { kind: string; room_id: string | null; message: string }[] = [];
  if (!withinHours) {
    for (const [roomId, list] of byRoom) {
      const onDevices = list.filter((device) => device.is_on);
      if (onDevices.length > 0) {
        const key = `after_hours:${roomId}`;
        if (!activeSet.has(key)) {
          const room = roomsById.get(roomId);
          const fans = onDevices.filter((device) => device.kind === "fan").length;
          const lights = onDevices.filter((device) => device.kind === "light").length;
          newAlerts.push({
            kind: "after_hours",
            room_id: roomId,
            message: `${room?.name}: ${fans} fan(s), ${lights} light(s) still ON after office hours.`,
          });
        }
      }
    }
  }

  const cutoff = new Date(date.getTime() - settings.long_on_minutes * 60_000);
  for (const [roomId, list] of byRoom) {
    if (list.every((device) => device.is_on)) {
      const { data: recent } = await supabaseAdmin
        .from("device_state_history")
        .select("device_id, is_on, changed_at")
        .in("device_id", list.map((device) => device.id))
        .order("changed_at", { ascending: false })
        .limit(200);
      const latestOn = new Map<string, string>();
      for (const row of recent ?? []) {
        if (latestOn.has(row.device_id)) continue;
        if (row.is_on) latestOn.set(row.device_id, row.changed_at as string);
      }
      let ok = list.length > 0;
      for (const device of list) {
        const t = latestOn.get(device.id);
        if (!t || new Date(t) > cutoff) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const key = `room_long_on:${roomId}`;
        if (!activeSet.has(key)) {
          const room = roomsById.get(roomId);
          newAlerts.push({
            kind: "room_long_on",
            room_id: roomId,
            message: `${room?.name}: all devices have been ON for over ${settings.long_on_minutes} minutes.`,
          });
        }
      }
    }
  }

  if (newAlerts.length > 0) {
    await supabaseAdmin.from("alerts").insert(newAlerts);
  }

  for (const alert of activeAlerts ?? []) {
    let stillTrue = false;
    if (alert.kind === "after_hours" && !withinHours) {
      const list = byRoom.get(alert.room_id ?? "") ?? [];
      stillTrue = list.some((device) => device.is_on);
    } else if (alert.kind === "room_long_on") {
      const list = byRoom.get(alert.room_id ?? "") ?? [];
      stillTrue = list.length > 0 && list.every((device) => device.is_on);
    }
    if (!stillTrue) {
      await supabaseAdmin.from("alerts").update({ resolved_at: date.toISOString() }).eq("id", alert.id);
    }
  }

  return {
    withinHours,
    toggled: changes.length,
    newAlerts: newAlerts.length,
    tickAt: date.toISOString(),
  };
}
