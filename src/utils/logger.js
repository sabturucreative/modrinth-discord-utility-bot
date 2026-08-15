const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function ensureLogFile() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function writeToFile(line) {
  try {
    ensureLogFile();
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch (err) {
    // Jangan biarkan kegagalan logging merusak proses utama.
  }
}

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const label = level.toUpperCase().padEnd(5);
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${ts}] ${label} ${message}${metaStr}`;

  const levelValue = LEVELS[level] ?? LEVELS.info;
  if (levelValue >= LEVELS.warn) {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
  writeToFile(line);
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};