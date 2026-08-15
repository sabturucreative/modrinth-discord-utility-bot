const { SlashCommandBuilder } = require('discord.js');
const modrinth = require('../services/modrinth');
const { projectEmbed, errorEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('Tampilkan informasi detail sebuah project dari Modrinth.')
  .addStringOption((option) =>
    option
      .setName('project')
      .setDescription('Project ID atau slug (contoh: sodium, AANobbMI)')
      .setRequired(true)
  );

async function execute(interaction) {
  await interaction.deferReply();

  const projectRef = interaction.options.getString('project', true);

  try {
    const project = await modrinth.getProject(projectRef);
    let latestVersion = null;
    try {
      latestVersion = await modrinth.getLatestVersion(project.id);
    } catch (err) {
      logger.warn('Gagal mengambil versi terbaru untuk /info.', {
        project: projectRef,
        error: err.message,
      });
    }

    const embed = projectEmbed(project, { latestVersion });
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Gagal menjalankan /info.', { project: projectRef, error: err.message });
    const message =
      err.response && err.response.status === 404
        ? `Project \`${projectRef}\` tidak ditemukan.`
        : err.message;
    await interaction.editReply({ embeds: [errorEmbed(message)] });
  }
}

module.exports = { data, execute };