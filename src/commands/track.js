const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const modrinth = require('../services/modrinth');
const pterodactyl = require('../services/pterodactyl');
const db = require('../database');
const { errorEmbed, COLOR } = require('../utils/embeds');
const logger = require('../utils/logger');

const LOADER_CHOICES = [
  { name: 'Fabric', value: 'fabric' },
  { name: 'Forge', value: 'forge' },
  { name: 'NeoForge', value: 'neoforge' },
  { name: 'Quilt', value: 'quilt' },
  { name: 'Paper', value: 'paper' },
  { name: 'Velocity', value: 'velocity' },
  { name: 'Spigot', value: 'spigot' },
];

const data = new SlashCommandBuilder()
  .setName('track')
  .setDescription('Kelola daftar mod yang dipantau untuk notifikasi update.')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Daftarkan mod untuk dipantau update-nya.')
      .addStringOption((option) =>
        option.setName('project').setDescription('Project ID atau slug').setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('loader')
          .setDescription('Filter loader (opsional)')
          .addChoices(...LOADER_CHOICES)
      )
      .addStringOption((option) =>
        option.setName('game_version').setDescription('Versi Minecraft (opsional, contoh: 1.20.1)')
      )
      .addStringOption((option) =>
        option
          .setName('server_type')
          .setDescription('Jenis server (default: mods)')
          .addChoices({ name: 'Mods', value: 'mods' }, { name: 'Plugins', value: 'plugins' })
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Hapus mod dari daftar pantauan.')
      .addStringOption((option) =>
        option.setName('project').setDescription('Project ID atau slug').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Tampilkan semua mod yang sedang dipantau.')
  );

async function handleAdd(interaction) {
  await interaction.deferReply();

  const projectRef = interaction.options.getString('project', true);
  let loader = interaction.options.getString('loader');
  const gameVersion = interaction.options.getString('game_version');
  const serverType = interaction.options.getString('server_type') || 'mods';

  if (!loader) {
    try {
      loader = await pterodactyl.detectServerLoader();
    } catch (err) {
      logger.warn('Gagal mendeteksi loader server saat /track add.', { error: err.message });
    }
  }

  try {
    const project = await modrinth.getProject(projectRef);

    const versionOptions = {};
    if (loader) versionOptions.loaders = [loader];
    if (gameVersion) versionOptions.gameVersions = [gameVersion];

    let latestVersion = null;
    try {
      latestVersion = await modrinth.getLatestVersion(project.id, versionOptions);
    } catch (err) {
      logger.warn('Gagal mengambil versi terbaru saat /track add.', {
        project: projectRef,
        error: err.message,
      });
    }

    const entry = db.addTrack({
      projectId: project.id,
      slug: project.slug,
      title: project.title,
      projectType: project.project_type || 'mod',
      loaders: loader ? [loader] : [],
      gameVersion: gameVersion || null,
      serverType,
      channelId: interaction.channel ? interaction.channel.id : null,
      lastVersionId: latestVersion ? latestVersion.id : null,
      lastVersionNumber: latestVersion ? latestVersion.version_number : null,
      lastCheckedAt: new Date().toISOString(),
      addedAt: new Date().toISOString(),
    });

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('Mod Ditambahkan ke Pantauan')
      .setDescription(`**${entry.title}** (\`${entry.slug || entry.projectId}\`) sekarang dipantau.`)
      .addFields(
        { name: 'Loader', value: loader || 'Semua', inline: true },
        { name: 'MC Version', value: gameVersion || 'Semua', inline: true },
        { name: 'Server Type', value: serverType, inline: true },
        {
          name: 'Versi Saat Ini',
          value: entry.lastVersionNumber || 'N/A',
          inline: false,
        }
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Gagal menjalankan /track add.', { project: projectRef, error: err.message });
    await interaction.editReply({ embeds: [errorEmbed(err.message)] });
  }
}

async function handleRemove(interaction) {
  await interaction.deferReply();

  const projectRef = interaction.options.getString('project', true);

  const removed = db.removeTrack(projectRef);
  if (!removed) {
    return interaction.editReply({
      embeds: [errorEmbed(`Project \`${projectRef}\` tidak ditemukan dalam daftar pantauan.`)],
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('Mod Dihapus dari Pantauan')
    .setDescription(`**${removed.title || removed.projectId}** (\`${removed.slug || removed.projectId}\`) sudah tidak dipantau.`);

  await interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction) {
  await interaction.deferReply();

  const tracked = db.getTracked();

  if (tracked.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('Daftar Pantauan Kosong')
      .setDescription('Belum ada mod yang dipantau. Gunakan `/track add <project>` untuk menambahkan.');
    return interaction.editReply({ embeds: [embed] });
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`Daftar Mod Dipantau (${tracked.length})`);

  tracked.forEach((entry, index) => {
    embed.addFields({
      name: `${index + 1}. ${entry.title || entry.projectId}`,
      value: [
        `ID: \`${entry.slug || entry.projectId}\``,
        `Versi terakhir: \`${entry.lastVersionNumber || 'N/A'}\``,
        `Loader: ${entry.loaders.length > 0 ? entry.loaders.join(', ') : 'Semua'}`,
        `MC: ${entry.gameVersion || 'Semua'} · Type: ${entry.serverType || 'mods'}`,
      ].join('\n'),
    });
  });

  await interaction.editReply({ embeds: [embed] });
}

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  try {
    switch (subcommand) {
      case 'add':
        return await handleAdd(interaction);
      case 'remove':
        return await handleRemove(interaction);
      case 'list':
        return await handleList(interaction);
      default:
        return interaction.reply({ embeds: [errorEmbed('Subcommand tidak dikenali.')] });
    }
  } catch (err) {
    logger.error('Gagal menjalankan /track.', { subcommand, error: err.message });
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ embeds: [errorEmbed(err.message)] });
    }
    return interaction.reply({ embeds: [errorEmbed(err.message)] });
  }
}

module.exports = { data, execute };