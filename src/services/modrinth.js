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

const LOADER_SUFFIXES = ['-fabric', '-forge', '-neoforge', '-quilt', '-paper', '-spigot', '-velocity', '-bukkit'];

function extractSlugToken(filename) {
  let s = filename.replace(/\.(jar|zip|mcaddon|mcpack|mcmeta|datapack)$/i, '').toLowerCase().replace(/_/g, '-');
  s = s.replace(/(?:-fabric|-forge|-neoforge|-quilt|-paper|-spigot|-velocity|-bukkit)+/g, '-');
  const out = [];
  for (const seg of s.split('-')) {
    if (/^v?\d/.test(seg)) break;
    out.push(seg);
  }
  return out.join('-');
}

async function resolveProjectBySlug(candidate) {
  let c = candidate;
  while (c) {
    try {
      return await getProject(c);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        if (!c.includes('-')) return null;
        c = c.slice(0, c.lastIndexOf('-'));
        continue;
      }
      throw err;
    }
  }
  return null;
}

function normalizeProject(p) {
  return {
    id: p.id || p.project_id,
    slug: p.slug,
    title: p.title,
    project_type: p.project_type,
    icon_url: p.icon_url || null,
    client_side: p.client_side || null,
    server_side: p.server_side || null,
  };
}

const projectCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheGet(filename) {
  const hit = projectCache.get(filename);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    projectCache.delete(filename);
    return undefined;
  }
  return hit.value;
}

function cacheSet(filename, value) {
  projectCache.set(filename, { value, ts: Date.now() });
}

function sideCategory(project) {
  const c = project.client_side;
  const s = project.server_side;
  if (!c || !s) return { key: 'unknown', label: '❓', text: 'tidak diketahui' };
  if (s !== 'unsupported' && c === 'unsupported') return { key: 'server', label: '🖥️', text: 'server-only' };
  if (c !== 'unsupported' && s === 'unsupported') return { key: 'client', label: '🧑', text: 'client-only' };
  if (c !== 'unsupported' && s !== 'unsupported') return { key: 'both', label: '🧑🤝🧑', text: 'client+server' };
  return { key: 'unknown', label: '❓', text: 'tidak diketahui' };
}

async function matchProjectByFile(filename) {
  const cached = cacheGet(filename);
  if (cached) return cached;

  const token = extractSlugToken(filename);
  if (!token) return null;

  let match = null;

  const direct = await resolveProjectBySlug(token);
  if (direct) {
    match = { project: normalizeProject(direct), matchToken: token };
  } else {
    try {
      const { hits } = await searchProjects(token, { limit: 1 });
      if (hits && hits.length > 0) {
        match = { project: normalizeProject(hits[0]), matchToken: token };
      }
    } catch (err) {
      logger.warn('Fallback search gagal saat pemetaan file.', { file: filename, error: err.message });
    }
  }

  cacheSet(filename, match);
  return match;
}

function resolveOutdated(project, filename, versions) {
  if (!versions || versions.length === 0) {
    return { status: 'unknown', project, filename, latest: null, newFile: null };
  }

  const latest = pickLatestVersion(versions);
  const latestFile = getPrimaryFile(latest);

  const byFilename = versions.find((v) => v.files && v.files.some((f) => f.filename === filename));
  const installedVersion =
    byFilename || versions.find((v) => filename.toLowerCase().includes(String(v.version_number).toLowerCase()));

  if (!installedVersion) {
    return { status: 'unknown', project, filename, latest, newFile: latestFile };
  }

  if (installedVersion.id === latest.id) {
    return { status: 'current', project, filename, latest, newFile: latestFile, installedVersion };
  }

  const outdated = new Date(installedVersion.date_published) < new Date(latest.date_published);
  return {
    status: outdated ? 'updatable' : 'current',
    project,
    filename,
    latest,
    newFile: latestFile,
    installedVersion,
  };
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
  extractSlugToken,
  matchProjectByFile,
  resolveOutdated,
  sideCategory,
};