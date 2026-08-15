const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const http = axios.create({
  baseURL: config.modrinth.baseUrl,
  timeout: 30000,
  headers: {
    'User-Agent': config.modrinth.userAgent,
    Accept: 'application/json',
  },
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response && error.response.status;
    if (status === 410 || status === 403) {
      logger.error('Modrinth memblokir request (kemungkinan User-Agent tidak valid).', {
        status,
        userAgent: config.modrinth.userAgent,
      });
    }
    return Promise.reject(error);
  }
);

async function searchProjects(query, options = {}) {
  const { limit = 5, index = 'relevance', facets = [] } = options;
  const params = {
    query,
    limit,
    index,
  };
  if (facets && facets.length > 0) {
    params.facets = JSON.stringify(facets);
  }
  const { data } = await http.get('/search', { params });
  return data;
}

async function getProject(idOrSlug) {
  const { data } = await http.get(`/project/${encodeURIComponent(idOrSlug)}`);
  return data;
}

async function getProjectVersions(idOrSlug, options = {}) {
  const { loaders = [], gameVersions = [] } = options;
  const params = { include_changelog: false };
  if (loaders.length > 0) params.loaders = JSON.stringify(loaders);
  if (gameVersions.length > 0) params.game_versions = JSON.stringify(gameVersions);
  const { data } = await http.get(`/project/${encodeURIComponent(idOrSlug)}/version`, { params });
  return data;
}

async function getVersion(idOrSlug, versionNumber) {
  const { data } = await http.get(`/project/${encodeURIComponent(idOrSlug)}/version/${encodeURIComponent(versionNumber)}`);
  return data;
}

async function getVersionById(versionId) {
  const { data } = await http.get(`/version/${encodeURIComponent(versionId)}`);
  return data;
}

function pickLatestVersion(versions, options = {}) {
  const { versionType = 'release' } = options;
  const sorted = [...versions].sort((a, b) => new Date(b.date_published) - new Date(a.date_published));
  const preferred = sorted.find((v) => v.version_type === versionType);
  return preferred || sorted[0] || null;
}

async function getLatestVersion(idOrSlug, options = {}) {
  const versions = await getProjectVersions(idOrSlug, options);
  return pickLatestVersion(versions, options);
}

function getPrimaryFile(version) {
  if (!version.files || version.files.length === 0) return null;
  return version.files.find((f) => f.primary) || version.files[0];
}

async function downloadFileBuffer(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    headers: {
      'User-Agent': config.modrinth.userAgent,
    },
  });
  return Buffer.from(response.data);
}

module.exports = {
  searchProjects,
  getProject,
  getProjectVersions,
  getVersion,
  getVersionById,
  getLatestVersion,
  pickLatestVersion,
  getPrimaryFile,
  downloadFileBuffer,
};