const { SlashCommandBuilder } = require('discord.js');
const modrinth = require('../services/modrinth');
const { searchResultsEmbed, errorEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

const LOADER_CHOICES = [
  { name: 'Fabric', value: 'fabric' },
  { name: 'Forge', value: 'forge' },
  { name: 'NeoForge', value: 'neoforge' },
  { name: 'Quilt', value: 'quilt' },
  { name: 'Paper', value: 'paper' },
  { name: 'Velocity', value: 'velocity' },
  { name: 'Spigot', value: 'spigot' },
  { name: 'Bukkit', value: 'bukkit' },
  { name: 'BungeeCord', value: 'bungeecord' },
];

const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Cari mod, plugin, atau resource pack di Modrinth.')
  .addStringOption((option) =>
    option.setName('query').setDescription('Kata kunci pencarian').setRequired(true).setMinLength(1)
  )
  .addStringOption((option) =>
    option
      .setName('loader')
      .setDescription('Filter berdasarkan loader (opsional)')
      .addChoices(...LOADER_CHOICES)
  )
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('Jenis project yang dicari (default: mod)')
      .addChoices(
        { name: 'Mod', value: 'mod' },
        { name: 'Plugin', value: 'plugin' },
        { name: 'Datapack', value: 'datapack' },
        { name: 'Resource Pack', value: 'resourcepack' }
      )
  );

async function execute(interaction) {
  await interaction.deferReply();

  const query = interaction.options.getString('query', true);
  const loader = interaction.options.getString('loader');
  const type = interaction.options.getString('type') || 'mod';

  try {
    const facets = [];
    if (loader) facets.push([`categories:${loader}`]);
    facets.push([`project_type:${type}`]);

    const result = await modrinth.searchProjects(query, {
      limit: 5,
      index: 'relevance',
      facets,
    });

    const embed = searchResultsEmbed(result.hits || [], query, result.total_hits || 0);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Gagal menjalankan /search.', { query, loader, error: err.message });
    await interaction.editReply({ embeds: [errorEmbed(err.message)] });
  }
}

module.exports = { data, execute };