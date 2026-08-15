const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  Events,
  MessageFlags,
} = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const tracker = require('../jobs/tracker');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();

const COMMANDS_DIR = path.join(__dirname, 'commands');

function loadCommands() {
  const files = fs.readdirSync(COMMANDS_DIR).filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const command = require(path.join(COMMANDS_DIR, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      logger.info(`Command dimuat: /${command.data.name}`);
    } else {
      logger.warn(`File command dilewati (format tidak valid): ${file}`);
    }
  }
}

async function registerCommands() {
  const commands = client.commands.map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.discord.token);

  logger.info('Mendaftarkan slash commands ke guild...', { count: commands.length });
  await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), {
    body: commands,
  });
  logger.info('Slash commands berhasil didaftarkan.');
}

function registerHandlers() {
  client.once(Events.ClientReady, async (c) => {
    logger.info(`Bot siap! Login sebagai ${c.user.tag}`);
    tracker.start(client);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({
        content: 'Command tidak dikenali.',
        ephemeral: true,
      });
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error(`Gagal mengeksekusi /${interaction.commandName}.`, {
        error: err.message,
        user: interaction.user.tag,
        channelId: interaction.channelId,
      });
      const message = { embeds: [{ title: 'Terjadi Kesalahan', description: err.message }] };
      try {
        if (!interaction.isRepliable()) return;
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(message);
        } else {
          await interaction.reply({ ...message, flags: MessageFlags.Ephemeral });
        }
      } catch (replyErr) {
        logger.warn(`Gagal membalas /${interaction.commandName} setelah error.`, {
          replyError: replyErr.message,
        });
      }
    }
  });

  client.on(Events.ClientError, (err) => {
    logger.error('Client error.', { error: err.message });
  });
}

async function main() {
  const missing = [];
  if (!config.discord.token) missing.push('DISCORD_TOKEN');
  if (!config.discord.clientId) missing.push('DISCORD_CLIENT_ID');
  if (!config.discord.guildId) missing.push('DISCORD_GUILD_ID');

  if (missing.length > 0) {
    logger.error(
      `Konfigurasi Discord belum lengkap: ${missing.join(', ')}. Salin .env.example menjadi .env dan isi konfigurasi.`
    );
    process.exit(1);
  }

  loadCommands();
  registerHandlers();

  try {
    await registerCommands();
  } catch (err) {
    logger.error('Gagal mendaftarkan commands, lanjut tanpa registrasi ulang.', {
      error: err.message,
    });
  }

  await client.login(config.discord.token);
}

process.on('SIGINT', () => {
  logger.info('Menerima sinyal SIGINT, mematikan bot...');
  tracker.stop();
  client.destroy();
  process.exit(0);
});

main().catch((err) => {
  logger.error('Bot gagal dimulai.', { error: err.message });
  process.exit(1);
});