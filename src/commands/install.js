const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const modrinth = require('../services/modrinth');
const pterodactyl = require('../services/pterodactyl');
const { errorEmbed, COLOR, formatFileSize } = require('../utils/embeds');
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

const TYPE_DIRECTORY = {
  mod: '/mods',
  plugin: '/plugins',
  datapack: '/datapacks',
  resourcepack: '/resourcepacks',
};

const data = new SlashCommandBuilder()
  .setName('install')
  .setDescription('Unduh file dari Modrinth dan pasang langsung ke server Pterodactyl.')
  .addStringOption((option) =>
    option
      .setName('project')
      .setDescription('Project ID atau slug (contoh: ferritecore)')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('Jenis file (default: mod)')
      .addChoices(
        { name: 'Mod', value: 'mod' },
        { name: 'Plugin', value: 'plugin' },
        { name: 'Datapack', value: 'datapack' },
        { name: 'Resource Pack', value: 'resourcepack' }
      )
  )
  .addStringOption((option) =>
    option
      .setName('loader')
      .setDescription('Loader target (opsional, auto-detect jika kosong)')
      .addChoices(...LOADER_CHOICES)
  )
  .addStringOption((option) =>
    option.setName('game_version').setDescription('Versi Minecraft (opsional, contoh: 1.20.1)')
  )
  .addStringOption((option) =>
    option.setName('restart').setDescription('Restart server setelah upload (default: false)').addChoices(
      { name: 'Ya', value: 'yes' },
      { name: 'Tidak', value: 'no' }
    )
  );

async function execute(interaction) {
  await interaction.deferReply();

  const projectRef = interaction.options.getString('project', true);
  const type = interaction.options.getString('type') || 'mod';
  let loader = interaction.options.getString('loader');
  const gameVersion = interaction.options.getString('game_version');
  const shouldRestart = interaction.options.getString('restart') === 'yes';
  let loaderDetected = false;

  if (!loader) {
    try {
      const detected = await pterodactyl.detectServerLoader();
      if (detected) {
        loader = detected;
        loaderDetected = true;
      }
    } catch (err) {
      logger.warn('Gagal mendeteksi loader server saat /install.', { error: err.message });
    }
  }

  const directory = TYPE_DIRECTORY[type];

  try {
    const project = await modrinth.getProject(projectRef);

    const versionOptions = {};
    if (loader) versionOptions.loaders = [loader];
    if (gameVersion) versionOptions.gameVersions = [gameVersion];

    const versions = await modrinth.getProjectVersions(project.id, versionOptions);
    if (!versions || versions.length === 0) {
      return interaction.editReply({
        embeds: [
          errorEmbed(
            `Tidak ada versi yang cocok untuk \`${project.title}\`${loader ? ` dengan loader ${loader}` : ''}${gameVersion ? ` untuk MC ${gameVersion}` : ''}.`
          ),
        ],
      });
    }

    const version = modrinth.pickLatestVersion(versions);
    const file = modrinth.getPrimaryFile(version);
    if (!file) {
      return interaction.editReply({
        embeds: [errorEmbed(`Versi \`${version.version_number}\` tidak memiliki file yang bisa diunduh.`)],
      });
    }

    await interaction.editReply({
      content: `⏳ Mengunduh \`${file.filename}\` (${formatFileSize(file.size)}) dari Modrinth...`,
    });

    const buffer = await modrinth.downloadFileBuffer(file.url);

    await interaction.editReply({
      content: `📤 Mengupload \`${file.filename}\` ke \`${directory}\` di server Pterodactyl...`,
    });

    await pterodactyl.uploadFile(buffer, file.filename, directory);

    if (shouldRestart) {
      await interaction.editReply({ content: '🔄 Me-restart server...' });
      await pterodactyl.restartServer();
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('✅ Instalasi Berhasil')
      .setDescription(`**${project.title}** berhasil dipasang ke server.`)
      .addFields(
        { name: 'File', value: `\`${file.filename}\``, inline: true },
        { name: 'Versi', value: `\`${version.version_number}\``, inline: true },
        { name: 'Directory', value: `\`${directory}\``, inline: true },
        {
          name: 'Loader',
          value: `${(version.loaders || []).join(', ') || 'N/A'}${loaderDetected ? ' · auto-detect' : ''}`,
          inline: true,
        },
        {
          name: 'MC Versions',
          value: (version.game_versions || []).map((v) => `\`${v}\``).join(' ') || 'N/A',
          inline: false,
        },
        { name: 'Server Restart', value: shouldRestart ? 'Ya' : 'Tidak', inline: true }
      )
      .setTimestamp();

    if (project.icon_url) embed.setThumbnail(project.icon_url);

    await interaction.editReply({ content: null, embeds: [embed] });
  } catch (err) {
    logger.error('Gagal menjalankan /install.', {
      project: projectRef,
      type,
      loader,
      error: err.message,
    });
    const message =
      err.response && err.response.status === 404
        ? `Project \`${projectRef}\` tidak ditemukan di Modrinth.`
        : err.message;
    await interaction.editReply({ embeds: [errorEmbed(message)] });
  }
}

module.exports = { data, execute };