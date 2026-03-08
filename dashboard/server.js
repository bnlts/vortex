'use strict';

const express          = require('express');
const { createServer } = require('http');
const { Server }       = require('socket.io');
const path             = require('path');
const session          = require('express-session');

const logger    = require('../src/utils/logger');
const ConfigMgr = require('../src/utils/config');
const stats     = require('../src/utils/stats');

const app    = express();
const server = createServer(app);
const io     = new Server(server, { cors: { origin: '*' }, pingTimeout: 60000 });

global.io = io;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'vortex_2024', resave: false, saveUninitialized: false, cookie: { maxAge: 86400000 } }));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Non authentifié' });
}

// ── Système .owner — Creator Panel ──────────────────────
// Le fichier .owner contient l'ID Discord du propriétaire
// Ce fichier n'est PAS inclus dans le dossier partagé
const fs   = require('fs');

function getOwnerId() {
  try {
    const p = path.join(__dirname, '../owner.txt');
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf8').trim();
  } catch { return null; }
}

function isOwnerConnected() {
  const ownerId = getOwnerId();
  if (!ownerId) return false;
  const client = global.client;
  return client?.user?.id === ownerId;
}

// Vérification périodique — si le bot connecté = owner, on affiche l'URL dans le terminal
let _ownerUrlShown = false;
setInterval(() => {
  if (!_ownerUrlShown && isOwnerConnected()) {
    _ownerUrlShown = true;
    const PORT = ConfigMgr.get().dashboard?.port || 3000;
    logger.success(`[OWNER] Creator Panel → http://localhost:${PORT}/creator-unlock`);
  }
}, 3000);

// Route déverrouillage Creator Panel — sans requireAuth, on crée la session ici
app.get('/creator-unlock', (req, res) => {
  if (!isOwnerConnected()) {
    return res.status(403).send('<h2 style="font-family:sans-serif;padding:40px;color:#f85149">Accès refusé</h2>');
  }
  req.session.authenticated = true;
  req.session.isOwner = true;
  req.session.save(() => res.redirect('/creator'));
});

// Page Creator Panel dédiée
app.get('/creator', (req, res) => {
  if (!req.session.isOwner) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'creator.html'));
});

// ── API: vérifier si session owner ───────────────────────
app.get('/api/owner/status', requireAuth, (req, res) => {
  res.json({ isOwner: !!req.session.isOwner });
});

app.post('/api/owner/logout', requireAuth, (req, res) => {
  req.session.isOwner = false;
  res.json({ success: true });
});

// ── Routes publiques ──────────────────────────────────────
app.get('/api/setup/status', (req, res) => {
  res.json({ hasToken: ConfigMgr.hasToken(), hasPassword: ConfigMgr.hasPassword(), configured: ConfigMgr.isConfigured() });
});

app.post('/api/setup/token', (req, res) => {
  const { token } = req.body;
  if (!token || token.trim().length < 20)
    return res.status(400).json({ success: false, error: 'Token invalide' });
  ConfigMgr.saveToken(token.trim());
  logger.success('Token sauvegardé');
  if (global.tryLogin) setTimeout(() => global.tryLogin(), 800);
  res.json({ success: true });
});

app.post('/api/setup/password', (req, res) => {
  const { password } = req.body;
  if (!password || password.trim().length < 4)
    return res.status(400).json({ success: false, error: 'Mot de passe trop court (min 4 caractères)' });
  if (ConfigMgr.hasPassword())
    return res.status(400).json({ success: false, error: 'Mot de passe déjà configuré' });
  ConfigMgr.savePassword(password.trim());
  logger.success('Mot de passe dashboard créé');
  res.json({ success: true });
});

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (ConfigMgr.checkPassword(password)) {
    req.session.authenticated = true;
    logger.success('Dashboard: connecté');
    res.json({ success: true });
  } else {
    logger.warn('Dashboard: mot de passe incorrect');
    res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
  }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.post('/api/setup/reconnect', (req, res) => {
  if (global.tryLogin) { global.tryLogin(); res.json({ success: true }); }
  else res.status(500).json({ error: 'unavailable' });
});

// ── Routes protégées ──────────────────────────────────────
const apiRoutes = require('./routes/api');
app.use('/api', requireAuth, apiRoutes);

// ── Socket ────────────────────────────────────────────────
io.on('connection', (socket) => {
  if (global.botUser) socket.emit('bot_ready', global.botUser);
  socket.emit('stats_update', stats.getSummary());
  socket.emit('logs_bulk', logger.getLogs(100));
  socket.emit('config_updated', ConfigMgr.getSafe());
});

const PORT = ConfigMgr.get().dashboard?.port || 3000;
server.listen(PORT, () => logger.system(`Dashboard → http://localhost:${PORT}`));

module.exports = { app, io, server };
