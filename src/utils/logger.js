// ============================================================
//  VORTEX — Logger
//  Console VSC = logs importants uniquement (pas de spam)
//  Dashboard = tout en temps réel via socket
// ============================================================

const chalk  = require('chalk');
const moment = require('moment');
const fs     = require('fs');
const path   = require('path');

const LOG_BUFFER = [];
const MAX_LOGS   = 1000;
const LOG_DIR    = path.join(__dirname, '../../logs');
const LOG_FILE   = path.join(LOG_DIR, `${moment().format('YYYY-MM-DD')}.log`);

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Types qui s'affichent dans la console VSC
const CONSOLE_TYPES = new Set(['success', 'error']); // Terminal = connexion Discord uniquement

const COLORS = {
  info    : chalk.cyan,
  success : chalk.greenBright,
  warn    : chalk.yellow,
  error   : chalk.redBright,
  command : chalk.magentaBright,
  snipe   : chalk.blueBright,
  debug   : chalk.gray,
  spy     : chalk.hex('#FF6B9D'),
  system  : chalk.hex('#A78BFA'),
};

const ICONS = {
  info    : '●', success : '✓', warn : '⚠',
  error   : '✗', command : '⚡', snipe : '🎁',
  debug   : '○', spy : '👁', system : '◈',
};

function log(type, message, meta = {}) {
  const timestamp = moment().format('HH:mm:ss');
  const date      = moment().format('YYYY-MM-DD HH:mm:ss');

  // Console VSC — seulement les logs importants
  if (CONSOLE_TYPES.has(type)) {
    const color  = COLORS[type] || chalk.white;
    const icon   = ICONS[type]  || '•';
    const prefix = chalk.gray(`[${timestamp}]`) + ' ' + color(`${icon} [${type.toUpperCase()}]`);
    console.log(`${prefix} ${message}`);
  }

  // Fichier log — tout
  try { fs.appendFileSync(LOG_FILE, `[${date}] [${type.toUpperCase()}] ${message}\n`); } catch(_) {}

  // Buffer mémoire
  const entry = { type, message, timestamp, date, meta, id: Date.now() + Math.random() };
  LOG_BUFFER.unshift(entry);
  if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.pop();

  // Dashboard socket — tout en temps réel
  if (global.io) global.io.emit('log', entry);

  return entry;
}

const logger = {
  info    : (msg, meta) => log('info',    msg, meta),
  success : (msg, meta) => log('success', msg, meta),
  warn    : (msg, meta) => log('warn',    msg, meta),
  error   : (msg, meta) => log('error',   msg, meta),
  command : (msg, meta) => log('command', msg, meta),
  snipe   : (msg, meta) => log('snipe',   msg, meta),
  debug   : (msg, meta) => log('debug',   msg, meta),
  spy     : (msg, meta) => log('spy',     msg, meta),
  system  : (msg, meta) => log('system',  msg, meta),
  getLogs : (limit = 200) => LOG_BUFFER.slice(0, limit),
  clear   : () => { LOG_BUFFER.length = 0; },
};

module.exports = logger;
