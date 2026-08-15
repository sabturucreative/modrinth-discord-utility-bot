const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const COLOR = config.constants.modrinthColor;
const ERROR_COLOR = config.constants.errorColor;

function formatNumber(n) {
  if (n == null) return 'N/A';
  return new Intl.NumberFormat('en-US').format(n);
}

function formatDownloads(n) {
  if (n == null) return 'N/A';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function projectEmbed(project, extra = {}) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(project.title)
    .setURL(`https://modrinth.com/${project.project_type}/${project.slug || project.id}`)
    .setDescription(project.description ? project.description.slice(0, 2048) : null)
    .setFooter({ text: `Project ID: ${project.id}` });

  if (project.icon_url) embed.setThumbnail(project.icon_url);
  if (project.gallery && project.gallery.length > 0) {
    embed.setImage(project.gallery[0].url);
  }

  const author = Array.isArray(project.author) ? project.author.join(', ') : project.author || 'N/A';
  embed.addFields(
    { name: 'Downloads', value: formatDownloads(project.downloads), inline: true },
    { name: 'Author', value: author.slice(0, 100) || 'N/A', inline: true },
    { name: 'Followers', value: formatNumber(project.follows), inline: true }
  );

  if (project.loaders && project.loaders.length > 0) {
    embed.addFields({ name: 'Loaders', value: project.loaders.map((l) => `\`${l}\``).join(' ').slice(0, 1000), inline: false });
  }

  if (project.game_versions && project.game_versions.length > 0) {
    const versions = project.game_versions.slice(0, 10);
    embed.addFields({ name: 'MC Versions', value: versions.map((v) => `\`${v}\``).join(' '), inline: false });
  }

  if (extra.latestVersion) {
    embed.addFields({
      name: 'Latest Version',
      value: `\`${extra.latestVersion.version_number}\` · ${extra.latestVersion.version_type || 'release'}`,
      inline: false,
    });
  }

  return embed;
}

function searchResultsEmbed(hits, query, totalHits) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`Hasil pencarian: "${query}"`)
    .setDescription(
      hits.length === 0
        ? 'Tidak ada hasil ditemukan.'
        : `Menampilkan ${hits.length} dari ${formatNumber(totalHits)} hasil.`
    );

  hits.slice(0, 5).forEach((hit, index) => {
    const author = Array.isArray(hit.author) ? hit.author.join(', ') : hit.author || 'N/A';
    const line = [
      `> ${hit.description ? hit.description.slice(0, 160) : 'Tanpa deskripsi'}`,
      `**Downloads:** ${formatDownloads(hit.downloads)} · **Author:** ${author} · **Type:** ${hit.project_type || 'mod'}`,
      `**ID:** \`${hit.slug || hit.project_id}\``,
    ].join('\n');
    embed.addFields({ name: `${index + 1}. ${hit.title}`, value: line });
  });

  return embed;
}

function formatFileSize(bytes) {
  if (!bytes) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function errorEmbed(message) {
  return new EmbedBuilder()
    .setColor(ERROR_COLOR)
    .setTitle('Terjadi Kesalahan')
    .setDescription(message || 'Operasi gagal, coba lagi nanti.');
}

module.exports = {
  COLOR,
  ERROR_COLOR,
  formatNumber,
  formatDownloads,
  formatFileSize,
  projectEmbed,
  searchResultsEmbed,
  errorEmbed,
};