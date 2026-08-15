require('dotenv').config();

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    trackChannelId: process.env.DISCORD_TRACK_CHANNEL_ID,
  },
  modrinth: {
    baseUrl: process.env.MODRINTH_BASE_URL || 'https://api.modrinth.com/v2',
    userAgent: process.env.MODRINTH_USER_AGENT || 'UnknownUser/ModrinthDiscordBot/1.0.0 (contact@example.com)',
  },
  pterodactyl: {
    baseUrl: process.env.PTERODACTYL_URL,
    apiKey: process.env.PTERODACTYL_API_KEY,
    serverId: process.env.PTERODACTYL_SERVER_ID,
  },
  tracker: {
    intervalMinutes: parseInt(process.env.TRACKER_INTERVAL_MINUTES, 10) || 120,
  },
  constants: {
    modrinthColor: 0x1bd96a,
    errorColor: 0xed4245,
    accentColor: 0x5865f2,
  },
};

module.exports = config;