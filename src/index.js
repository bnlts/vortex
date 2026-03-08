'use strict';

const { Client } = require('discord.js-selfbot-v13');
const chalk      = require('chalk');
const path       = require('path');
const fs         = require('fs');

const logger    = require('./utils/logger');
const ConfigMgr = require('./utils/config');
const stats     = require('./utils/stats');

// ── Banner ────────────────────────────────────────────────
console.log(chalk.hex('#58a6ff')(`
  ██╗   ██╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗
  ██║   ██║██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝
  ██║   ██║██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝
  ╚██╗ ██╔╝██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗
   ╚████╔╝ ╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗
    ╚═══╝   ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
`));
console.log(chalk.gray('  v2.0.0 — Advanced Personal Discord Selfbot\n'));

const client = new Client({ checkUpdate: false, readyStatus: false, patchVoice: false });

global.client = client;
global.stats  = stats;
global.logger = logger;

// ── Events ────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
fs.readdirSync(eventsPath).filter(f => f.endsWith('.js')).forEach(file => {
  const event = require(path.join(eventsPath, file));
  if (event.once) client.once(event.name, (...a) => event.execute(...a));
  else            client.on(event.name,   (...a) => event.execute(...a));
});

// ── Rate limit handler ─────────────────────────────────────
client.on('rateLimit', data => {
  logger.warn(`Rate limit: ${data.method} ${data.path} — retry in ${data.timeout}ms`);
  if (global.io) global.io.emit('rate_limit', { path: data.path, timeout: data.timeout, ts: Date.now() });
});

// ── Auto-reconnect ─────────────────────────────────────────
let reconnectAttempts = 0;
const MAX_RECONNECT   = 10;
const RECONNECT_DELAY = [5000, 10000, 15000, 30000, 60000]; // backoff progressif

client.on('disconnect', () => {
  logger.warn('Deconnecte de Discord');
  if (global.io) global.io.emit('bot_disconnected', { ts: Date.now() });
  scheduleReconnect();
});

client.on('error', err => {
  logger.error(`WebSocket error: ${err.message}`);
  scheduleReconnect();
});

function scheduleReconnect() {
  if (!ConfigMgr.isConfigured()) return;
  if (reconnectAttempts >= MAX_RECONNECT) {
    logger.error(`Reconnexion abandonnee apres ${MAX_RECONNECT} tentatives`);
    return;
  }
  const delay = RECONNECT_DELAY[Math.min(reconnectAttempts, RECONNECT_DELAY.length - 1)];
  reconnectAttempts++;
  logger.warn(`Reconnexion dans ${delay / 1000}s (tentative ${reconnectAttempts}/${MAX_RECONNECT})...`);
  if (global.io) global.io.emit('reconnecting', { attempt: reconnectAttempts, delay, ts: Date.now() });

  setTimeout(() => {
    logger.success('Tentative de reconnexion...');
    client.login(ConfigMgr.getToken()).catch(err => {
      logger.error(`Reconnexion echouee: ${err.message}`);
      scheduleReconnect();
    });
  }, delay);
}

// Reset compteur si connexion OK
client.on('ready', () => {
  reconnectAttempts = 0;
  if (global.io) global.io.emit('bot_reconnected', { tag: client.user.tag, ts: Date.now() });
});

// ── Dashboard ─────────────────────────────────────────────
require('../dashboard/server');

// ── Connexion Discord ─────────────────────────────────────
function tryLogin() {
  if (!ConfigMgr.isConfigured()) return;
  client.login(ConfigMgr.getToken()).catch(err => {
    logger.error(`Connexion impossible: ${err.message}`);
  });
}

global.tryLogin = tryLogin;
tryLogin();

// ── Ouvrir le dashboard automatiquement ───────────────────
const { exec } = require('child_process');
const port = ConfigMgr.get().dashboard?.port || 3000;
const url  = `http://localhost:${port}`;

setTimeout(() => {
  const cmd = process.platform === 'win32'
    ? `start ${url}`
    : process.platform === 'darwin'
      ? `open ${url}`
      : `xdg-open ${url}`;
  exec(cmd, () => {});
}, 1500);

// ── Erreurs globales ──────────────────────────────────────
process.on('unhandledRejection', err => {
  // Ignorer silencieusement les rate limits et erreurs Discord connues
  if (err?.code === 429 || err?.message?.includes('rate limit')) return;
  logger.error(`${err?.message || err}`);
  stats.increment('errorsCount');
});
process.on('uncaughtException', err => {
  logger.error(`${err.message}`);
  stats.increment('errorsCount');
});
process.on('SIGINT', () => {
  logger.success('Arret de Vortex');
  client.destroy();
  process.exit(0);
});
