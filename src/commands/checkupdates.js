const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const modrinth = require('../services/modrinth');
const pterodactyl = require('../services/pterodactyl');
const { COLOR, formatFileSize, errorEmbed } = require('../utils/embeds');
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

const FILE_EXTENSIONS = ['.jar', '.zip', '.mcaddon', '.mcpack'];

const SELECT_ID = 'cu_select';
const UPDATE_ALL_ID = 'cu_update_all';
const CANCEL_ID = 'cu_cancel';
const RESTART_ID = 'cu_restart';

const data = new SlashCommandBuilder()
  .setName('checkupdates')
  .setDescription('Cek update semua mod terpasang dan update langsung dari Modrinth.')
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('Jenis file (default: mods)')
      .addChoices(...TYPE_OPTIONS)
  );

function chunkLines(lines, max = 950) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    const add = line.length + 1;
    if (current.length > 0 && length + add > max) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(line);
    length += add;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function addChunkedField(embed, name, lines) {
  const chunks = chunkLines(lines);
  chunks.forEach((chunk, index) => {
    const label = index === 0 ? name : `${name} (lanjutan)`;
    const value = chunk.join('\n');
    embed.addFields({ name: label, value: value.length > 1024 ? `${value.slice(0, 1020)}...` : value });
  });
}

function updatableKey(target) {
  return target.project.slug || target.project.id;
}

async function deleteMatchingFiles(directory, tokens) {
  const files = await pterodactyl.listDirectory(directory);
  const targets = files.filter(
    (f) => f.is_file && tokens.some((t) => t && f.name.toLowerCase().startsWith(t.toLowerCase()))
  );
  if (targets.length === 0) return [];
  await pterodactyl.deleteFile(directory, targets.map((t) => t.name));
  return targets.map((t) => t.name);
}

function attachRestartCollector(message, userId) {
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === userId && i.customId === RESTART_ID,
    time: 120000,
  });

  collector.on('collect', async (i) => {
    await i.deferUpdate();
    await i.editReply({
      components: [],
      embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🔄 Me-restart server...')],
    });
    try {
      await pterodactyl.restartServer();
      await i.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle('✅ Perintah restart terkirim')
            .setDescription('Server sedang restart. Update akan aktif setelah selesai.'),
        ],
      });
    } catch (err) {
      logger.error('Gagal restart server setelah update.', { error: err.message });
      await i.editReply({ embeds: [errorEmbed(err.message)] });
    }
    collector.stop();
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      try {
        await message.edit({ components: [] });
      } catch (err) {
        logger.warn('Gagal menonaktifkan tombol restart.', { error: err.message });
      }
    }
  });
}

async function runUpdates(i, targets, restartCollector) {
  await i.deferUpdate();
  await i.editReply({
    components: [],
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🔄 Mengupdate mod...').setDescription('Mohon tunggu.')],
  });

  const results = [];
  for (const target of targets) {
    try {
      const removed = await deleteMatchingFiles(target.directory, [target.matchToken, target.project.slug]);
      const buffer = await modrinth.downloadFileBuffer(target.newFile.url);
      await pterodactyl.uploadFile(buffer, target.newFile.filename, target.directory);
      results.push({
        ok: true,
        title: target.project.title,
        side: modrinth.sideCategory(target.project).key,
        oldFile: removed[0] || target.filename,
        newFile: target.newFile.filename,
      });
    } catch (err) {
      logger.error('Gagal mengupdate mod.', { project: target.project.slug, error: err.message });
      results.push({ ok: false, title: target.project.title, error: err.message });
    }
  }

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`✅ Update Selesai (${succeeded.length}/${results.length})`)
    .setTimestamp();

  const lines = [];
  for (const r of succeeded) {
    lines.push(`✅ **${r.title}** — \`${r.oldFile}\` → \`${r.newFile}\``);
  }
  for (const r of failed) {
    lines.push(`❌ **${r.title}** — ${r.error}`);
  }
  if (lines.length === 0) {
    embed.setDescription('Tidak ada mod yang diupdate.');
  } else {
    const visible = lines.slice(0, 20);
    const extra = lines.length - visible.length;
    embed.setDescription(visible.join('\n') + (extra > 0 ? `\n... dan ${extra} mod lainnya.` : ''));
  }

  const components = [];
  if (succeeded.length > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(RESTART_ID).setLabel('🔄 Restart Server').setStyle(ButtonStyle.Danger)
      )
    );
  }

  const clientUpdated = succeeded.filter((r) => r.side === 'both');
  if (clientUpdated.length > 0) {
    embed.addFields({
      name: `🧑🤝🧑 Ingatkan pemain update client (${clientUpdated.length})`,
      value: clientUpdated.map((r) => `- **${r.title}**`).join('\n'),
      inline: false,
    });
  }

  if (restartCollector) restartCollector.stop();
  const message = await i.editReply({ embeds: [embed], components });
  if (succeeded.length > 0) attachRestartCollector(message, i.user.id);
}

async function execute(interaction) {
  await interaction.deferReply();

  const type = interaction.options.getString('type') || 'mods';
  const directory = TYPE_DIRECTORY[type];

  try {
    const [loader, mcVersion, files] = await Promise.all([
      pterodactyl.detectServerLoader(),
      pterodactyl.detectMcVersion(),
      pterodactyl.listDirectory(directory),
    ]);

    const jars = files.filter(
      (f) => f.is_file && FILE_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
    );

    if (jars.length === 0) {
      return interaction.editReply({ embeds: [errorEmbed(`Tidak ada file di \`${directory}\`.`)] });
    }

    const versionOptions = {};
    if (loader) versionOptions.loaders = [loader];
    if (mcVersion) versionOptions.gameVersions = [mcVersion];

    const updatable = [];
    const current = [];
    const unknown = [];

    for (const file of jars) {
      try {
        const match = await modrinth.matchProjectByFile(file.name);
        if (!match) {
          unknown.push(file.name);
          continue;
        }
        const versions = await modrinth.getProjectVersions(match.project.id, versionOptions);
        const result = modrinth.resolveOutdated(match.project, file.name, versions);
        if (result.status === 'updatable' && result.newFile) {
          updatable.push({ ...result, directory, matchToken: match.matchToken });
        } else if (result.status === 'current') {
          current.push(match.project.title);
        } else {
          unknown.push(file.name);
        }
      } catch (err) {
        logger.warn('Gagal mengecek satu file.', { file: file.name, error: err.message });
        unknown.push(file.name);
      }
    }

    const label = type === 'resourcepacks' ? 'Resource Pack' : type === 'datapacks' ? 'Datapack' : type === 'plugins' ? 'Plugin' : 'Mod';
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`🔎 Hasil Cek Update ${label} (${jars.length} file)`)
      .setDescription(
        `Loader terdeteksi: \`${loader || 'tidak diketahui'}\`${mcVersion ? ` · MC \`${mcVersion}\`` : ''}`
      )
      .setFooter({ text: `Direktori: ${directory}` });

    if (updatable.length > 0) {
      addChunkedField(
        embed,
        `🔄 Ada Update (${updatable.length})`,
        updatable.map((u, i) => {
          const from = u.installedVersion ? u.installedVersion.version_number : u.filename;
          const side = modrinth.sideCategory(u.project);
          return `${i + 1}. **${u.project.title}** — \`${from}\` → \`${u.latest.version_number}\` (${formatFileSize(u.newFile.size)}) ${side.label}`;
        })
      );
    }

    const clientMods = updatable.filter((u) => modrinth.sideCategory(u.project).key === 'both');
    if (clientMods.length > 0) {
      addChunkedField(
        embed,
        `🧑🤝🧑 Wajib Update Client (${clientMods.length})`,
        clientMods.map((u) => `- **${u.project.title}** (${modrinth.sideCategory(u.project).text})`)
      );
    }

    if (current.length > 0) {
      addChunkedField(embed, `✅ Terbaru (${current.length})`, current.map((t) => `- ${t}`));
    }

    if (unknown.length > 0) {
      const visibleUnknown = unknown.slice(0, 12);
      const extraUnknown = unknown.length - visibleUnknown.length;
      addChunkedField(
        embed,
        `❓ Tidak Terkenal (${unknown.length})`,
        visibleUnknown.map((n) => `- \`${n}\``).concat(extraUnknown > 0 ? [`... dan ${extraUnknown} file lain`] : [])
      );
    }

    embed.addFields({
      name: 'Catatan',
      value: 'File yang "Tidak Terkenal" kemungkinan bukan dari Modrinth (CurseForge/manual).',
      inline: false,
    });

    if (updatable.length === 0) {
      return interaction.editReply({ embeds: [embed] });
    }

    const components = [];
    if (updatable.length <= 25) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder('Pilih mod yang akan di-update')
        .setMinValues(1)
        .setMaxValues(Math.min(updatable.length, 25))
        .addOptions(
          updatable.map((u, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${i + 1}. ${u.project.title}`)
              .setDescription(`${u.latest.version_number} · ${formatFileSize(u.newFile.size)} · ${modrinth.sideCategory(u.project).text}`)
              .setValue(updatableKey(u))
          )
        );
      components.push(new ActionRowBuilder().addComponents(select));
    }

    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(UPDATE_ALL_ID).setLabel('🔄 Update Semua').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(CANCEL_ID).setLabel('Batal').setStyle(ButtonStyle.Secondary)
      )
    );

    await interaction.editReply({ embeds: [embed], components });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: (i) =>
        i.user.id === interaction.user.id && [SELECT_ID, UPDATE_ALL_ID, CANCEL_ID].includes(i.customId),
      time: 120000,
    });

    collector.on('collect', async (i) => {
      if (i.customId === CANCEL_ID) {
        collector.stop();
        return i.update({ components: [], embeds: [new EmbedBuilder().setColor(COLOR).setTitle('Dibatalkan')] });
      }

      let targets;
      if (i.customId === SELECT_ID) {
        const selected = new Set(i.values);
        targets = updatable.filter((u) => selected.has(updatableKey(u)));
      } else {
        targets = updatable;
      }

      await runUpdates(i, targets, collector);
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'time') {
        try {
          await interaction.editReply({ components: [] });
        } catch (err) {
          logger.warn('Gagal menonaktifkan komponen setelah timeout.', { error: err.message });
        }
      }
    });
  } catch (err) {
    logger.error('Gagal menjalankan /checkupdates.', { type, error: err.message });
    await interaction.editReply({ embeds: [errorEmbed(err.message)] });
  }
}

module.exports = { data, execute };