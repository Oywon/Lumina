// Discord endpoint for slash commands plus demo-friendly !commands.
// Register bot in Discord Developer Portal -> Interactions Endpoint URL:
//   https://<your-project>.lovable.app/api/public/discord
import { createFileRoute } from "@tanstack/react-router";

const encoder = new TextEncoder();

function hex2buf(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return buf;
}

async function verifySignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hex2buf(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const data = encoder.encode(timestamp + body);
    return await crypto.subtle.verify("Ed25519", key, hex2buf(signatureHex), data);
  } catch (err) {
    console.error("[discord] signature verify error", err);
    return false;
  }
}

async function humanize(prompt: string, fallback: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return fallback;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 2200);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are the office electricity assistant bot. Reply in ONE short, friendly paragraph (max 3 sentences). No greetings, no markdown headings, no lists unless the user asked. Speak like a helpful coworker updating the boss on Discord. Use the DATA JSON exactly — do not invent numbers.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 220,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return fallback;
    const j = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = j.choices?.[0]?.message?.content?.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

function reply(content: string) {
  return Response.json({ type: 4, data: { content } });
}

function parseCommand(content: string) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("!")) return null;
  const [command, ...rest] = trimmed.slice(1).split(/\s+/);
  return { command: command.toLowerCase(), args: rest.filter(Boolean) };
}

function getRoomSlugFromOptions(options: { name: string; value: unknown }[] = [], fallback?: string) {
  const direct = options.find((option) => option.name === "name")?.value;
  if (typeof direct === "string" && direct.trim()) return direct.toLowerCase();
  const positional = options.find((option) => option.name === "value")?.value;
  if (typeof positional === "string" && positional.trim()) return positional.toLowerCase();
  if (typeof fallback === "string" && fallback.trim()) return fallback.toLowerCase();
  return "";
}

async function handleCommand(name: string, options: { name: string; value: unknown }[] = []) {
  const { loadSnapshot } = await import("@/lib/office-data.server");
  const snap = await loadSnapshot();

  if (name === "status") {
    const summary = snap.rooms.map((room) => {
      const fansOn = room.devices.filter((device) => device.kind === "fan" && device.is_on).length;
      const lightsOn = room.devices.filter((device) => device.kind === "light" && device.is_on).length;
      return `${room.name}: ${fansOn} fan(s) ON, ${lightsOn} light(s) ON`;
    });
    const fallback = `${summary.join(" • ")}. Total: ${Math.round(snap.totalWatts)}W.`;
    const prompt = `Give the boss a friendly office status update. DATA: ${JSON.stringify({
      rooms: snap.rooms.map((room) => ({
        name: room.name,
        fansOn: room.devices.filter((device) => device.kind === "fan" && device.is_on).length,
        lightsOn: room.devices.filter((device) => device.kind === "light" && device.is_on).length,
        wattsNow: Math.round(room.watts_now),
      })),
      totalWatts: Math.round(snap.totalWatts),
      withinOfficeHours: snap.withinOfficeHours,
    })}`;
    return reply(await humanize(prompt, fallback));
  }

  if (name === "room") {
    const slug = getRoomSlugFromOptions(options);
    const room = snap.rooms.find((entry) => entry.slug === slug || entry.name.toLowerCase() === slug);
    if (!room) return reply("I don't know that room. Try: drawing, work1, work2.");
    const fansOn = room.devices.filter((device) => device.kind === "fan" && device.is_on);
    const lightsOn = room.devices.filter((device) => device.kind === "light" && device.is_on);
    const fallback = `${room.name}: ${fansOn.length}/2 fans ON, ${lightsOn.length}/3 lights ON. That's ${Math.round(room.watts_now)}W right now (${room.kwh_today.toFixed(2)} kWh today).`;
    const prompt = `Give a short status for one room. DATA: ${JSON.stringify({
      room: room.name,
      fansOn: fansOn.length,
      lightsOn: lightsOn.length,
      wattsNow: Math.round(room.watts_now),
      kwhToday: Number(room.kwh_today.toFixed(2)),
    })}`;
    return reply(await humanize(prompt, fallback));
  }

  if (name === "usage") {
    const perRoom = snap.rooms
      .map((room) => `${room.name} ${Math.round(room.watts_now)}W / ${room.kwh_today.toFixed(2)} kWh`)
      .join(", ");
    const fallback = `Total power right now: ${Math.round(snap.totalWatts)}W. Today's estimated usage: ${snap.kwhToday.toFixed(2)} kWh. Breakdown — ${perRoom}.`;
    const prompt = `Report office power usage in one short paragraph. DATA: ${JSON.stringify({
      totalWatts: Math.round(snap.totalWatts),
      kwhToday: Number(snap.kwhToday.toFixed(2)),
      perRoom: snap.rooms.map((room) => ({
        name: room.name,
        wattsNow: Math.round(room.watts_now),
        kwhToday: Number(room.kwh_today.toFixed(2)),
      })),
    })}`;
    return reply(await humanize(prompt, fallback));
  }

  return reply(`Unknown command: ${name}`);
}

export const Route = createFileRoute("/api/public/discord")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const contentType = request.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          try {
            const body = JSON.parse(rawBody) as {
              type?: number | string;
              data?: { name?: string; options?: { name: string; value: unknown }[] };
              message?: { content?: string };
            };

            if (body.type === 1 || body.type === "1") return Response.json({ type: 1 });
            if (body.type === 2 || body.type === "2") {
              const commandName = body.data?.name ?? "status";
              try {
                return await handleCommand(commandName, body.data?.options ?? []);
              } catch (err) {
                console.error("[discord] handler failed", err);
                return reply("Sorry — I couldn't reach the office data right now.");
              }
            }

            const parsed = parseCommand(body.message?.content ?? "");
            if (parsed) {
              try {
                const mappedOptions = parsed.args.map((value) => ({ name: "value", value })) as Array<{ name: string; value: unknown }>;
                return await handleCommand(parsed.command, mappedOptions);
              } catch (err) {
                console.error("[discord] handler failed", err);
                return reply("Sorry — I couldn't reach the office data right now.");
              }
            }
          } catch {
            // Fall back to a plain-text command if the payload is not valid JSON.
          }
        }

        const parsed = parseCommand(rawBody);
        if (parsed) {
          try {
            const mappedOptions = parsed.args.map((value) => ({ name: "value", value })) as Array<{ name: string; value: unknown }>;
            return await handleCommand(parsed.command, mappedOptions);
          } catch (err) {
            console.error("[discord] handler failed", err);
            return reply("Sorry — I couldn't reach the office data right now.");
          }
        }

        const publicKey = process.env.DISCORD_PUBLIC_KEY;
        if (!publicKey) {
          return new Response("DISCORD_PUBLIC_KEY not configured", { status: 500 });
        }
        const signature = request.headers.get("x-signature-ed25519");
        const timestamp = request.headers.get("x-signature-timestamp");
        if (!signature || !timestamp) {
          return new Response("Missing signature headers", { status: 401 });
        }
        const ok = await verifySignature(publicKey, signature, timestamp, rawBody);
        if (!ok) return new Response("Invalid request signature", { status: 401 });

        const body = JSON.parse(rawBody) as {
          type: number;
          data?: { name: string; options?: { name: string; value: unknown }[] };
        };

        if (body.type === 1) return Response.json({ type: 1 });
        if (body.type === 2 && body.data) {
          try {
            return await handleCommand(body.data.name, body.data.options ?? []);
          } catch (err) {
            console.error("[discord] handler failed", err);
            return reply("Sorry — I couldn't reach the office data right now.");
          }
        }
        return Response.json({ type: 4, data: { content: "Unsupported interaction." } });
      },
    },
  },
});
