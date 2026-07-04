// One-time script to register the bot's slash commands with Discord.
// Usage:
//   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... bun run scripts/register-discord-commands.ts
//
// After running, set your app's Interactions Endpoint URL in the Discord
// Developer Portal to:  https://<published-app>.lovable.app/api/public/discord

const APP_ID = process.env.DISCORD_APPLICATION_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!APP_ID || !TOKEN) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN env vars.");
  process.exit(1);
}

const commands = [
  {
    name: "status",
    description: "Snapshot of every room — how many fans/lights are ON.",
  },
  {
    name: "room",
    description: "Status of a specific room.",
    options: [
      {
        name: "name",
        description: "Room slug (drawing, work1, work2)",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "Drawing Room", value: "drawing" },
          { name: "Work Room 1", value: "work1" },
          { name: "Work Room 2", value: "work2" },
        ],
      },
    ],
  },
  {
    name: "usage",
    description: "Current total power draw and today's estimated kWh.",
  },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${APP_ID}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  },
);
if (!res.ok) {
  console.error("Failed:", res.status, await res.text());
  process.exit(1);
}
console.log("Registered commands:", await res.json());
