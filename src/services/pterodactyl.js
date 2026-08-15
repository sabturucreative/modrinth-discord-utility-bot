const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const { baseUrl, apiKey, serverId } = config.pterodactyl;

function requireConfig() {
  if (!baseUrl || !apiKey || !serverId) {
    throw new Error('Konfigurasi Pterodactyl belum lengkap (PTERODACTYL_URL / API_KEY / SERVER_ID).');
  }
}

function client() {
  return axios.create({
    baseURL: `${baseUrl}/api/client`,
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

async function getServer() {
  requireConfig();
  const { data } = await client().get(`/servers/${serverId}`);
  return data.attributes;
}

async function getResources() {
  requireConfig();
  const { data } = await client().get(`/servers/${serverId}/resources`);
  return data.attributes;
}

async function listDirectory(directory = '/') {
  requireConfig();
  const { data } = await client().get(`/servers/${serverId}/files/list`, {
    params: { directory },
  });
  return data.data.map((entry) => entry.attributes);
}

async function getUploadUrl(directory = '/') {
  requireConfig();
  const { data } = await client().get(`/servers/${serverId}/files/upload`, {
    params: { directory },
  });
  return data.attributes.url;
}

function appendQuery(url, key, value) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

async function uploadFile(buffer, filename, directory = '/') {
  requireConfig();
  const signedUrl = await getUploadUrl(directory);

  const form = new FormData();
  form.append('files', new Blob([buffer], { type: 'application/java-archive' }), filename);
  form.append('directory', directory);

  const uploadUrl = appendQuery(signedUrl, 'directory', directory);

  const response = await axios.post(uploadUrl, form, {
    headers: {
      Accept: 'application/json',
    },
    maxBodyLength: Infinity,
  });

  logger.info(`File berhasil di-upload ke Pterodactyl: ${filename}`, { directory });
  return response.data;
}

async function powerAction(signal) {
  requireConfig();
  const valid = ['start', 'stop', 'restart', 'kill'];
  if (!valid.includes(signal)) {
    throw new Error(`Signal power tidak valid: ${signal}`);
  }
  const { data } = await client().post(`/servers/${serverId}/power`, { signal });
  return data;
}

async function restartServer() {
  return powerAction('restart');
}

async function sendCommand(command) {
  requireConfig();
  const { data } = await client().post(`/servers/${serverId}/commands`, { command });
  return data;
}

async function deleteFile(root, files) {
  requireConfig();
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Daftar file untuk dihapus tidak boleh kosong.');
  }
  const { data } = await client().post(`/servers/${serverId}/files/delete`, {
    root: root || '/',
    files,
  });
  logger.info(`File dihapus dari Pterodactyl: ${files.join(', ')}`, { root: root || '/' });
  return data;
}

async function detectServerLoader() {
  requireConfig();

  const rootFiles = await listDirectory('/');
  const rootNames = rootFiles.map((f) => f.name.toLowerCase());

  const modFiles = await listDirectory('/mods').catch(() => []);
  const modNames = modFiles.map((f) => f.name.toLowerCase());

  const hasAny = (...needles) => rootNames.some((n) => needles.some((x) => n.includes(x)));

  if (rootNames.includes('.fabric') || rootNames.includes('fabric-server-launch.properties') || hasAny('fabric-loader-', 'fabric-api-')) {
    return 'fabric';
  }

  if (modNames.some((n) => n.startsWith('fabric-api-') || n.startsWith('fabric-loader-'))) {
    return 'fabric';
  }

  if (hasAny('paper-', 'paper')) {
    return 'paper';
  }
  if (hasAny('spigot-')) {
    return 'spigot';
  }
  if (hasAny('velocity')) {
    return 'velocity';
  }

  try {
    const libs = await listDirectory('/libraries/net');
    const libNames = libs.map((f) => f.name.toLowerCase());
    if (libNames.includes('neoforged')) return 'neoforge';
    if (libNames.includes('minecraftforge')) return 'forge';
  } catch (err) {
    logger.warn('Gagal membaca /libraries/net saat deteksi loader.', { error: err.message });
  }

  return null;
}

module.exports = {
  getServer,
  getResources,
  listDirectory,
  getUploadUrl,
  uploadFile,
  powerAction,
  restartServer,
  sendCommand,
  deleteFile,
  detectServerLoader,
};