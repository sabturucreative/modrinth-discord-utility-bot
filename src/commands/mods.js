const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pterodactyl = require('../services/pterodactyl');
const modrinth = require('../services/modrinth');
const { COLOR, formatFileSize, errorEmbed } = require('../utils/embeds');
const { mapLimit } = require('../utils/promises');
const logger = require('../utils/logger');

const TYPE_OPTIONS = [
  { name: 'Mods', value: 'mods' },
  { name: 'Plugins', value: 'plugins' },
  { name: 'Datapacks', value: 'datapacks' },
  { name: 'Resource Packs', value: 'resourcepacks' },
];

const TYPE_DIRECTORY = {
  mods: '/mods',
  plugins: '/plugins',
  datapacks: '/datapacks',
  resourcepacks: '/resourcepacks',
};

const MAX_FILES = 60;

const FILE_EXTENSIONS = ['.jar', '.zip', '.mcaddon', '.mcpack', '.mcmeta', '.datapack'];

const data = new SlashCommandBuilder()
  .setName('mods')
  .setDescription('Tampilkan daftar file yang terpasang di server (mods/plugins/datapacks).')
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('Jenis file (default: mods)')
      .addChoices(...TYPE_OPTIONS)
  );

async function execute(interaction) {
  await interaction.deferReply();

  const type = interaction.options.getString('type') || 'mods';
  const directory = TYPE_DIRECTORY[type];

  try {
    let files;
    try {
      files = await pterodactyl.listDirectory(directory);
    } catch (err) {
      if (err.response && err.response.status === 500) {
        return interaction.editReply({
          embeds: [
            errorEmbed(
              `Direktori \`${directory}\` tidak ditemukan di server, atau belum bisa diakses.` +
                (type === 'plugins' ? ' Server ini tampaknya bukan server plugin (Paper/Spigot).' : '')
            ),
          ],
        });
      }
      throw err;
    }

    const entries = files
      .filter((f) => f.is_file)
      .filter((f) => FILE_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (entries.length === 0) {
      return interaction.editReply({
        embeds: [
          errorEmbed(`Tidak ada file yang terpasang di \`${directory}\`.`),
        ],
      });
    }

    const label = type === 'resourcepacks' ? 'Resource Pack' : type === 'datapacks' ? 'Datapack' : type === 'plugins' ? 'Plugin' : 'Mod';
    const visible = entries.slice(0, MAX_FILES);
    const totalSize = entries.reduce((sum, f) => sum + (f.size || 0), 0);

    const categorized = await mapLimit(entries, 6, async (file) => {
      try {
        const match = await modrinth.matchProjectByFile(file.name);
        if (!match) return { file, category: { key: 'unknown', label: '[?]', text: 'tidak dikenal' } };
        return { file, category: modrinth.sideCategory(match.project) };
      } catch (err) {
        logger.warn('Gagal mengkategorikan file.', { file: file.name, error: err.message });
        return { file, category: { key: 'unknown', label: '[?]', text: 'tidak dikenal' } };
      }
    });

    const counts = categorized.reduce(
      (acc, item) => {
        acc[item.category.key] = (acc[item.category.key] || 0) + 1;
        return acc;
      },
      { server: 0, client: 0, both: 0, unknown: 0 }
    );

    const visibleMap = new Map(visible.map((f) => [f.name, f]));
    const lines = categorized
      .filter((item) => visibleMap.has(item.file.name))
      .map((item) => `- \`${item.file.name}\` (${formatFileSize(item.file.size)}) ${item.category.label}`);

    let description = lines.join('\n');
    if (entries.length > MAX_FILES) {
      description += `\n... dan ${entries.length - MAX_FILES} file lainnya.`;
    }
    if (description.length > 4096) {
      description = `${description.slice(0, 4000)}...\n(daftar terpotong karena terlalu panjang)`;
    }

    const summary = [
      `🖥️ server-only ${counts.server}`,
      `🎮 client-only ${counts.client}`,
      `🤝 client+server ${counts.both}`,
      `[?] tak dikenal ${counts.unknown}`,
    ].join(' · ');

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`📦 Daftar ${label} (${entries.length})`)
      .setDescription(description)
      .addFields(
        {
          name: 'Kategori Side',
          value: summary,
          inline: true,
        },
        {
          name: 'Total Ukuran',
          value: formatFileSize(totalSize),
          inline: true,
        }
      )
      .setFooter({
        text: `Direktori: ${directory} · 🖥️ server-only | 🎮 client-only | 🤝 client+server | [?] bukan dari Modrinth`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Gagal menjalankan /mods.', {
      type,
      error: err.message,
    });
    await interaction.editReply({ embeds: [errorEmbed(err.message)] });
  }
}

module.exports = { data, execute };