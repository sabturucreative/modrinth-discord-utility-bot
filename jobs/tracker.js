const { EmbedBuilder } = require('discord.js');
const modrinth = require('../src/services/modrinth');
const db = require('../src/database');
const config = require('../src/config');
const logger = require('../src/utils/logger');
const { formatFileSize } = require('../src/utils/embeds');

let intervalHandle = null;

async function checkProject(client, entry) {
  const versionOptions = {};
  if (entry.loaders && entry.loaders.length > 0) versionOptions.loaders = entry.loaders;
  if (entry.gameVersion) versionOptions.gameVersions = [entry.gameVersion];

  const versions = await modrinth.getProjectVersions(entry.projectId, versionOptions);
  if (!versions || versions.length === 0) return null;

  const latest = modrinth.pickLatestVersion(versions);
  if (!latest) return null;

  const isNew =
    entry.lastVersionId !== latest.id &&
    new Date(latest.date_published) > new Date(entry.lastCheckedAt || 0);

  db.updateTrack(entry.projectId, {
    lastVersionId: latest.id,
    lastVersionNumber: latest.version_number,
    lastCheckedAt: new Date().toISOString(),
  });

  if (!isNew) return null;

  const file = modrinth.getPrimaryFile(latest);
  const embed = new EmbedBuilder()
    .setColor(config.constants.modrinthColor)
    .setTitle(`🆕 Update Baru: ${entry.title || entry.slug || entry.projectId}`)
    .setURL(`https://modrinth.com/${entry.projectType || 'mod'}/${entry.slug || entry.projectId}`)
    .setDescription(`Versi **\`${latest.version_number}\`** baru saja dirilis.`)
    .addFields(
      { name: 'Versi', value: `\`${latest.version_number}\``, inline: true },
      { name: 'Type', value: latest.version_type || 'release', inline: true },
      { name: 'Sebelumnya', value: `\`${entry.lastVersionNumber || 'N/A'}\``, inline: true },
      {
        name: 'Loaders',
        value: (latest.loaders || []).map((l) => `\`${l}\``).join(' ') || 'N/A',
        inline: false,
      },
      {
        name: 'MC Versions',
        value: (latest.game_versions || []).map((v) => `\`${v}\``).join(' ') || 'N/A',
        inline: false,
      }
    )
    .setTimestamp(new Date(latest.date_published));

  if (file) {
    embed.addFields({ name: 'File', value: `\`${file.filename}\` · ${formatFileSize(file.size)}`, inline: false });
  }

  const channelId = entry.channelId || config.discord.trackChannelId;
  if (!channelId) {
    logger.warn('Tidak ada channel untuk notifikasi tracker.', { projectId: entry.projectId });
    return embed;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    logger.warn('Channel notifikasi tracker tidak valid atau tidak ditemukan.', { channelId });
    return embed;
  }

  await channel.send({ embeds: [embed] });
  return embed;
}

async function runTracker(client) {
  const tracked = db.getTracked();
  if (tracked.length === 0) return;

  logger.info('Menjalankan pengecekan update tracker...', { count: tracked.length });

  for (const entry of tracked) {
    try {
      await checkProject(client, entry);
    } catch (err) {
      logger.error('Gagal mengecek update tracker.', {
        projectId: entry.projectId,
        error: err.message,
      });
    }
  }
}

function start(client) {
  const minutes = config.tracker.intervalMinutes;
  const ms = Math.max(1, minutes) * 60 * 1000;

  if (intervalHandle) {
    clearInterval(intervalHandle);
  }

  logger.info(`Tracker dimulai, interval ${minutes} menit.`);
  runTracker(client);
  intervalHandle = setInterval(() => runTracker(client), ms);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { start, stop, runTracker, checkProject };