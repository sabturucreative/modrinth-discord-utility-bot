const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DB_PATH = path.join(__dirname, 'db.json');

let db = { tracked: [] };

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tracked)) {
        db = parsed;
      }
    }
  } catch (err) {
    logger.error('Gagal membaca db.json, mulai dari state kosong.', { error: err.message });
    db = { tracked: [] };
  }
  return db;
}

function save() {
  try {
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch (err) {
    logger.error('Gagal menyimpan db.json.', { error: err.message });
    throw err;
  }
}

function getTracked() {
  return db.tracked;
}

function findTrack(projectIdOrSlug) {
  const key = String(projectIdOrSlug).toLowerCase();
  return db.tracked.find(
    (entry) =>
      String(entry.projectId).toLowerCase() === key ||
      (entry.slug && String(entry.slug).toLowerCase() === key)
  );
}

function addTrack(entry) {
  const existing = findTrack(entry.projectId);
  if (existing) {
    throw new Error(`Project sudah terdaftar: ${existing.title || existing.projectId}`);
  }
  db.tracked.push(entry);
  save();
  return entry;
}

function removeTrack(projectIdOrSlug) {
  const key = String(projectIdOrSlug).toLowerCase();
  const index = db.tracked.findIndex(
    (entry) =>
      String(entry.projectId).toLowerCase() === key ||
      (entry.slug && String(entry.slug).toLowerCase() === key)
  );
  if (index === -1) {
    return null;
  }
  const [removed] = db.tracked.splice(index, 1);
  save();
  return removed;
}

function updateTrack(projectIdOrSlug, patch) {
  const entry = findTrack(projectIdOrSlug);
  if (!entry) return null;
  Object.assign(entry, patch);
  save();
  return entry;
}

load();

module.exports = {
  load,
  save,
  getTracked,
  findTrack,
  addTrack,
  removeTrack,
  updateTrack,
};