# Modrinth Discord Utility Bot

A Discord bot (Node.js / discord.js v14) to **search**, **remotely install**, and **track updates** for Minecraft mods, plugins, datapacks, and resource packs from [Modrinth](https://modrinth.com), deploying files directly to your server via the [Pterodactyl](https://pterodactyl.io) Client API.

## Features

| Command | Description |
|---|---|
| `/search <query> [loader] [type]` | Search projects on Modrinth and show results with icon, description, downloads, and author. |
| `/info <project>` | Show detailed info about a project plus its latest version. |
| `/track add <project> [loader] [game_version] [server_type]` | Register a project for update tracking. |
| `/track remove <project>` | Remove a project from tracking. |
| `/track list` | List all tracked projects. |
| `/install <project> [type] [loader] [game_version] [restart]` | Download the latest compatible file and upload it to your Pterodactyl server (`/mods`, `/plugins`, `/datapacks`, or `/resourcepacks`). |

Plus an **automatic update tracker** that polls tracked projects every 1-3 hours and posts a notification embed to a configured Discord channel when a new release is published.

## Tech Stack

- **Node.js** 18+ (LTS)
- **discord.js** ^14
- **axios** (Modrinth Labrinth API & Pterodactyl Client API)
- **dotenv** (configuration)

## Project Structure

```text
├── .env.example
├── .github/workflows/ci.yml
├── LICENSE
├── package.json
├── src/
│   ├── index.js               # Discord bot entry point
│   ├── config.js              # Environment variables & constants
│   ├── commands/              # Slash commands
│   │   ├── search.js          # /search <query> [loader] [type]
│   │   ├── info.js            # /info <project>
│   │   ├── track.js           # /track add|remove|list
│   │   └── install.js         # /install <project>
│   ├── services/              # API integration handlers
│   │   ├── modrinth.js        # Modrinth API client
│   │   └── pterodactyl.js     # Pterodactyl API client
│   ├── utils/
│   │   ├── embeds.js          # Rich embed formatters
│   │   └── logger.js          # Console / file logging
│   └── database/
│       ├── index.js           # JSON storage wrapper
│       └── db.json            # Tracked mods data (git-ignored)
└── jobs/
    └── tracker.js             # Background update tracker
```

## Installation

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your configuration:

```bash
cp .env.example .env
```

## Configuration (`.env`)

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your Discord bot token. |
| `DISCORD_CLIENT_ID` | Your Discord application client ID. |
| `DISCORD_GUILD_ID` | ID of the guild where slash commands are registered. |
| `DISCORD_TRACK_CHANNEL_ID` | Channel ID for automatic update notifications. |
| `MODRINTH_USER_AGENT` | Required User-Agent header for all Modrinth API requests, e.g. `YourName/ModrinthDiscordBot/1.0.0 (contact@example.com)`. |
| `PTERODACTYL_URL` | Base URL of your Pterodactyl panel (no trailing slash), e.g. `https://panel.example.com`. |
| `PTERODACTYL_API_KEY` | Pterodactyl **Client API** key (`ptlc_...`) with Files Read/Write permissions. |
| `PTERODACTYL_SERVER_ID` | The server identifier (UUID) you want to deploy files to. |
| `TRACKER_INTERVAL_MINUTES` | Update tracker polling interval in minutes (default: `120`). |

## Usage

Start the bot:

```bash
npm start
# or
npm run dev   # with --watch
```

The slash commands are registered automatically on startup for the configured guild.

```text
/search sodium
/info ferritecore
/track add sodium loader:fabric game_version:1.20.1
/track list
/install ferritecore type:mod loader:fabric game_version:1.20.1 restart:yes
```

## How `/install` Works

```text
[ User in Discord ] -- /install ferritecore
        |
        v
 1. Fetch project metadata & latest compatible version --> [ Modrinth API ]
        |                                                       |
        v <---------------- return direct file URL (.jar) ------+
 2. Download file buffer (.jar)
        |
        v
 3. Request signed upload URL --> [ Pterodactyl Panel ]
        |
        v
 4. Upload file via signed URL -----> File lands in /mods or /plugins
        |
        v
 5. (Optional) Restart server  -> Confirmation embed back to Discord
```

## Important Notes

- Every request to the Modrinth API **must** include the `User-Agent` header. Requests without it are rejected (HTTP 410/403).
- The Pterodactyl API key must be a **Client API** key (starts with `ptlc_`), not an Application key. It needs **Files Read** and **Files Write** permissions (and optionally Power for `/install ... restart:yes`).
- Modrinth limits requests to 300/minute; the built-in tracker interval is designed to stay well below that.

## License

[MIT](./LICENSE)