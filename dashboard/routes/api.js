// ============================================================
//  VORTEX — Routes API
//  Toutes les routes appelées par le dashboard
// ============================================================

const express   = require('express');
const router    = express.Router();
const ConfigMgr = require('../../src/utils/config');
const stats      = require('../../src/utils/stats');
const VipManager = require('../../src/utils/vip');
const logger    = require('../../src/utils/logger');
const moment    = require('moment');

const os = require('os');
const Backup = require('../../src/modules/backup');
const path   = require('path');

// ── GET /api/system ───────────────────────────────────────
router.get('/system', (req, res) => {
  // CPU usage — compare two snapshots 200ms apart
  function cpuPercent() {
    const cpus1 = os.cpus();
    return new Promise(resolve => {
      setTimeout(() => {
        const cpus2 = os.cpus();
        let idle = 0, total = 0;
        cpus2.forEach((cpu, i) => {
          const c1 = cpus1[i].times, c2 = cpu.times;
          const t1 = Object.values(c1).reduce((a,b)=>a+b,0);
          const t2 = Object.values(c2).reduce((a,b)=>a+b,0);
          idle  += c2.idle  - c1.idle;
          total += t2 - t1;
        });
        resolve(Math.round((1 - idle / total) * 100));
      }, 200);
    });
  }

  cpuPercent().then(cpu => {
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const proc     = process.memoryUsage();

    res.json({
      cpu,
      ramUsed    : Math.round(usedMem  / 1024 / 1024),
      ramTotal   : Math.round(totalMem / 1024 / 1024),
      ramPct     : Math.round(usedMem / totalMem * 100),
      procMem    : Math.round(proc.heapUsed / 1024 / 1024),
      platform   : os.platform(),
      arch       : os.arch(),
      hostname   : os.hostname(),
      cpuModel   : os.cpus()[0]?.model?.trim() || 'Unknown',
      cpuCores   : os.cpus().length,
      nodeVer    : process.version,
      uptime     : Math.floor(process.uptime()),
    });
  });
});

// ── GET /api/stats ────────────────────────────────────────
router.get('/stats', (req, res) => {
  const client = global.client;
  res.json({
    ...stats.getSummary(),
    ping   : client?.ws?.ping || 0,
    guilds : client?.guilds?.cache?.size || 0,
    users  : client?.users?.cache?.size || 0,
    tag    : client?.user?.tag || 'Déconnecté',
    avatar : client?.user?.displayAvatarURL({ format: 'png', size: 256 }) || '',
    id     : client?.user?.id || '',
  });
});

// ── GET /api/config ───────────────────────────────────────
router.get('/config', (req, res) => {
  res.json(ConfigMgr.getSafe());
});

// ── POST /api/config/module ───────────────────────────────
// Body: { module: "nitroSniper", data: { enabled: true } }
router.post('/config/module', (req, res) => {
  const { module: moduleName, data } = req.body;
  if (!moduleName || !data) return res.status(400).json({ error: 'Paramètres manquants' });

  try {
    const updated = ConfigMgr.updateModule(moduleName, data);
    logger.info(`Config module mis à jour: ${moduleName}`);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/config/prefix ───────────────────────────────
router.post('/config/prefix', (req, res) => {
  const { prefix } = req.body;
  if (!prefix) return res.status(400).json({ error: 'Préfixe manquant' });
  ConfigMgr.updatePrefix(prefix);
  res.json({ success: true });
});

// ── GET /api/logs ─────────────────────────────────────────
router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  res.json(logger.getLogs(limit));
});

router.delete('/logs', (req, res) => {
  logger.clear();
  res.json({ success: true });
});

// ── GET /api/guilds ───────────────────────────────────────
router.get('/guilds', (req, res) => {
  const client = global.client;
  if (!client) return res.json([]);

  const guilds = client.guilds.cache.map(g => ({
    id          : g.id,
    name        : g.name,
    icon        : g.iconURL({ format: 'png', size: 128 }) || null,
    memberCount : g.memberCount,
    channels    : g.channels.cache.size,
    roles       : g.roles.cache.size,
    ownerId     : g.ownerId,
    boosts      : g.premiumSubscriptionCount,
    boostLevel  : g.premiumTier,
    createdAt   : g.createdAt,
  }));

  res.json(guilds);
});

// ── GET /api/spy/deleted ──────────────────────────────────
router.get('/spy/deleted', (req, res) => {
  res.json(stats.getSection('deletedMessages'));
});

// ── GET /api/spy/edited ───────────────────────────────────
router.get('/spy/edited', (req, res) => {
  res.json(stats.getSection('editedMessages'));
});

// ── GET /api/snipers/nitro ────────────────────────────────
router.get('/snipers/nitro', (req, res) => {
  res.json(stats.getSection('nitroHistory'));
});

// ── GET /api/snipers/giveaway ─────────────────────────────
router.get('/snipers/giveaway', (req, res) => {
  res.json(stats.getSection('giveawayHistory'));
});

// ── GET /api/commands/history ─────────────────────────────
router.get('/commands/history', (req, res) => {
  res.json(stats.getSection('commandHistory'));
});

// ── POST /api/commands/custom ─────────────────────────────
router.post('/commands/custom', (req, res) => {
  const { name, response } = req.body;
  if (!name || !response) return res.status(400).json({ error: 'Paramètres manquants' });
  ConfigMgr.addCustomCommand(name, response);
  res.json({ success: true });
});

// ── DELETE /api/commands/custom/:name ─────────────────────
router.delete('/commands/custom/:name', (req, res) => {
  ConfigMgr.deleteCustomCommand(req.params.name);
  res.json({ success: true });
});

// ── POST /api/blacklist ───────────────────────────────────
router.post('/blacklist', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId manquant' });
  ConfigMgr.blacklistUser(userId);
  res.json({ success: true });
});

// ── DELETE /api/blacklist/:id ─────────────────────────────
router.delete('/blacklist/:id', (req, res) => {
  ConfigMgr.unblacklistUser(req.params.id);
  res.json({ success: true });
});

// ── POST /api/status ──────────────────────────────────────
router.post('/status', async (req, res) => {
  const {
    text, type, status, enabled,
    appId,
    details, state,
    largeImage, largeText, smallImage, smallText,
    btn1Label, btn1Url, btn2Label, btn2Url,
    startTimestamp, endTimestamp,
  } = req.body;

  try {
    const client = global.client;
    ConfigMgr.updateModule('customStatus', req.body);

    if (client && enabled) {
      // Activité de base
      const activity = {
        name    : text    || 'Vortex',
        type    : type    || 'PLAYING',
      };

      // Détails & état
      if (details) activity.details = details;
      if (state)   activity.state   = state;

      // App ID → vrai RPC custom (images + boutons)
      if (appId && appId.trim()) {
        activity.application_id = appId.trim();
      }

      // Assets images
      if (largeImage || smallImage) {
        activity.assets = {};
        if (largeImage) { activity.assets.large_image = largeImage; if (largeText) activity.assets.large_text = largeText; }
        if (smallImage) { activity.assets.small_image = smallImage; if (smallText) activity.assets.small_text = smallText; }
      }

      // Boutons — discord.js-selfbot-v13 rejette la présence entière avec des boutons URL
      // On les stocke dans la config mais on ne les envoie pas à Discord
      // (affichage uniquement dans la preview dashboard)

      // Timestamps
      if (startTimestamp) activity.startTimestamp = parseInt(startTimestamp);
      if (endTimestamp)   activity.endTimestamp   = parseInt(endTimestamp);

      await client.user.setPresence({
        activities : [activity],
        status     : status || 'online',
      });

    } else if (client) {
      await client.user.setPresence({
        activities : [],
        status     : status || 'online',
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/send ────────────────────────────────────────
router.post('/send', async (req, res) => {
  const { channelId, content } = req.body;
  const client = global.client;
  try {
    const channel = client.channels.cache.get(channelId);
    if (!channel) return res.status(404).json({ error: 'Salon introuvable' });
    await channel.send(content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── GET /api/stats/daily ──────────────────────────────────
router.get('/stats/daily', (req, res) => {
  res.json(stats.getDailyHistory());
});

// ── GET /api/friends ──────────────────────────────────────
router.get('/friends', async (req, res) => {
  const client = global.client;
  if (!client) return res.json({ friends: [], pending: [], blocked: [] });
  try {
    // discord.js-selfbot-v13 expose les relations via client.relationships
    const relationships = client.relationships?.cache || new Map();
    const friends  = [];
    const pending  = [];
    const blocked  = [];
    const incoming = [];

    for (const [userId, type] of relationships) {
      let user = null;
      try { user = await client.users.fetch(userId); } catch (_) { user = client.users.cache.get(userId); }
      const entry = {
        id       : userId,
        tag      : user?.tag || 'Unknown#0000',
        username : user?.username || 'Unknown',
        avatar   : user?.displayAvatarURL({ format: 'png', size: 64 }) || null,
        bot      : user?.bot || false,
      };
      // type: 1=friend, 2=blocked, 3=pending outgoing, 4=pending incoming
      if      (type === 1) friends.push(entry);
      else if (type === 2) blocked.push(entry);
      else if (type === 3) pending.push({ ...entry, direction: 'outgoing' });
      else if (type === 4) incoming.push({ ...entry, direction: 'incoming' });
    }
    res.json({ friends, pending: [...pending, ...incoming], blocked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/friends/remove ──────────────────────────────
router.post('/friends/remove', async (req, res) => {
  const { userId } = req.body;
  const client = global.client;
  try {
    await client.relationships.deleteRelationship(userId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/friends/block ───────────────────────────────
router.post('/friends/block', async (req, res) => {
  const { userId } = req.body;
  const client = global.client;
  try {
    await client.relationships.block(userId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/friends/unblock ─────────────────────────────
router.post('/friends/unblock', async (req, res) => {
  const { userId } = req.body;
  const client = global.client;
  try {
    await client.relationships.deleteRelationship(userId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/dms ──────────────────────────────────────────
router.get('/dms', async (req, res) => {
  const client = global.client;
  if (!client) return res.json([]);
  try {
    // Récupérer les DMChannels du cache
    const dms = client.channels.cache
      .filter(c => c.type === 'DM')
      .map(c => {
        const recipient = c.recipient;
        const lastMsg   = c.messages?.cache?.last();
        return {
          channelId    : c.id,
          userId       : recipient?.id || null,
          tag          : recipient?.tag || 'Unknown',
          username     : recipient?.username || 'Unknown',
          avatar       : recipient?.displayAvatarURL({ format: 'png', size: 64 }) || null,
          bot          : recipient?.bot || false,
          lastMessage  : lastMsg ? {
            content   : lastMsg.content?.substring(0, 100) || '',
            authorId  : lastMsg.author?.id,
            timestamp : lastMsg.createdAt?.toISOString(),
          } : null,
          lastActivity : c.messages?.cache?.last()?.createdAt?.toISOString() || null,
        };
      })
      .sort((a, b) => {
        const ta = a.lastActivity ? new Date(a.lastActivity) : 0;
        const tb = b.lastActivity ? new Date(b.lastActivity) : 0;
        return tb - ta;
      });
    res.json(dms);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/dms/:channelId/messages ─────────────────────
router.get('/dms/:channelId/messages', async (req, res) => {
  const client = global.client;
  if (!client) return res.json([]);
  try {
    const channel = client.channels.cache.get(req.params.channelId);
    if (!channel || channel.type !== 'DM') return res.status(404).json({ error: 'DM introuvable' });
    const msgs = await channel.messages.fetch({ limit: 50 });
    const result = msgs.map(m => ({
      id         : m.id,
      content    : m.content || '',
      authorId   : m.author?.id,
      authorTag  : m.author?.tag,
      authorAvatar: m.author?.displayAvatarURL({ format: 'png', size: 32 }) || null,
      timestamp  : m.createdAt?.toISOString(),
      attachments: m.attachments?.size || 0,
      embeds     : m.embeds?.length || 0,
      mine       : m.author?.id === client.user?.id,
    })).reverse();
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/dms/:channelId/send ────────────────────────
router.post('/dms/:channelId/send', async (req, res) => {
  const { content } = req.body;
  const client = global.client;
  try {
    const channel = client.channels.cache.get(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel introuvable' });
    await channel.send(content);
    stats.increment('messagesSent');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  CREATOR PANEL ROUTES
//  Protégées par mot de passe owner séparé
// ═══════════════════════════════════════════════════════════

// requireOwner — vérifie la session isOwner (activée via URL secrète)
function requireOwner(req, res, next) {
  if (!req.session?.isOwner) return res.status(403).json({ error: 'Accès refusé' });
  next();
}









// ── VIP Keys ──────────────────────────────────────────────
router.get('/creator/keys', requireOwner, (req, res) => {
  res.json(VipManager.listKeys());
});

router.post('/creator/keys/create', requireOwner, (req, res) => {
  const { label, durationDays } = req.body;
  const key = VipManager.createKey(label || '', parseInt(durationDays) || 30);
  res.json(key);
});

router.delete('/creator/keys/:key', requireOwner, (req, res) => {
  const ok = VipManager.revokeKey(req.params.key);
  res.json({ success: ok });
});

// ── VIP Activation (par le user lui-même) ─────────────────
router.post('/vip/activate', (req, res) => {
  const { key } = req.body;
  const client  = global.client;
  const userId  = client?.user?.id;
  if (!userId) return res.status(400).json({ error: 'Bot non connecté' });
  const result = VipManager.activateKey(key, userId);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ success: true, entry: result.entry });
});

router.get('/vip/status', (req, res) => {
  const client  = global.client;
  const userId  = client?.user?.id;
  if (!userId) return res.json({ vip: false, isOwner: false });
  const isOwner = VipManager.isOwner(userId);
  const info    = VipManager.getVipInfo(userId);
  const hasVip  = isOwner || (!!info && !info.expired);
  res.json({
    vip     : hasVip,
    isOwner : isOwner,
    info    : isOwner
      ? { key: 'OWNER', expiresAt: null, permanent: true, daysLeft: null }
      : (info || null),
  });
});

// ── Blacklist ──────────────────────────────────────────────
router.get('/creator/blacklist', requireOwner, (req, res) => {
  res.json(VipManager.listBlacklist());
});

router.post('/creator/blacklist/add', requireOwner, (req, res) => {
  const { userId, reason } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId requis' });
  VipManager.blacklist(userId, reason || '');
  res.json({ success: true });
});

router.delete('/creator/blacklist/:userId', requireOwner, (req, res) => {
  VipManager.unblacklist(req.params.userId);
  res.json({ success: true });
});

// ── POST /api/tokeninfo ───────────────────────────────────
router.post('/tokeninfo', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });
  // Vérifier VIP
  const client = global.client;
  const myId   = client?.user?.id;
  if (!VipManager.isVip(myId)) return res.status(403).json({ error: 'VIP requis' });
  try {
    const { analyzeToken } = require('../../src/modules/tokeninfo');
    const info = await analyzeToken(token);
    res.json(info);
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/username/check ──────────────────────────────
router.post('/username/check', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username requis' });
  const client = global.client;
  const myId   = client?.user?.id;
  if (!VipManager.isVip(myId)) return res.status(403).json({ error: 'VIP requis' });
  if (!client) return res.status(400).json({ error: 'Bot non connecté' });
  try {
    // Tenter de fetch le user par username — si 404 = dispo
    const result = await fetch(`https://discord.com/api/v10/users/@me`, {
      headers: { Authorization: require('../../src/utils/config').getToken() }
    });
    // Vérifier via search si le pseudo existe
    const searchRes = await fetch(`https://discord.com/api/v10/unique-username/check-username-taken`, {
      method: 'POST',
      headers: {
        Authorization: require('../../src/utils/config').getToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username }),
    });
    if (searchRes.ok) {
      const data = await searchRes.json();
      res.json({ username, taken: data.taken });
    } else {
      res.json({ username, taken: null, error: 'Impossible de vérifier' });
    }
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/username/change ─────────────────────────────
router.post('/username/change', async (req, res) => {
  const { username } = req.body;
  const client = global.client;
  if (!client) return res.status(400).json({ error: 'Bot non connecté' });
  const myId = client?.user?.id;
  if (!VipManager.isVip(myId)) return res.status(403).json({ error: 'VIP requis' });
  try {
    await client.user.edit({ username });
    res.json({ success: true, username });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ── GET /api/setup/status ─────────────────────────────────
// Vérifier si le token est configuré (pas besoin d'auth)
router.get('/setup/status', (req, res) => {
  res.json({ configured: ConfigMgr.isConfigured() });
});

// ── POST /api/setup/token ─────────────────────────────────
// Sauvegarder le token depuis le dashboard (pas besoin d'auth)
router.post('/setup/token', async (req, res) => {
  const { token } = req.body;
  if (!token || token.trim().length < 20) {
    return res.status(400).json({ error: 'Token invalide' });
  }

  try {
    ConfigMgr.saveToken(token.trim());
    logger.success('Token sauvegardé via le dashboard');

    // Tenter la connexion Discord immédiatement
    if (global.tryLogin) {
      setTimeout(() => global.tryLogin(), 500);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/setup/reconnect ─────────────────────────────
// Reconnecter avec le token actuel
router.post('/setup/reconnect', (req, res) => {
  if (global.tryLogin) {
    global.tryLogin();
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'tryLogin non disponible' });
  }
});

// ── BACKUP ROUTES ────────────────────────────────────────
const backup = require('../../src/modules/backup');
const fs_bk  = require('fs');

// Lister tous les backups + actifs
router.get('/backups', (req, res) => {
  const list   = backup.listBackups();
  const active = backup.getActiveBackups();
  res.json({ list, active });
});

// Serveurs disponibles pour backup
router.get('/backups/guilds', (req, res) => {
  const client = global.client;
  if (!client) return res.json([]);
  const guilds = client.guilds.cache.map(g => ({
    id       : g.id,
    name     : g.name,
    icon     : g.iconURL({ format: 'png', size: 64 }) || null,
    memberCount: g.memberCount,
    channels : g.channels.cache.size,
  }));
  res.json(guilds);
});

// État d'un backup par backupId
router.get('/backups/status/:backupId', (req, res) => {
  const s = backup.getBackupStatus(req.params.backupId);
  res.json(s || { status: 'idle' });
});

// Lancer un backup (options granulaires)
router.post('/backups/start', (req, res) => {
  const { guildId, options } = req.body;
  if (!guildId) return res.status(400).json({ error: 'guildId manquant' });
  res.json({ success: true, message: 'Backup démarré' });
  backup.backupGuild(guildId, options || {})
    .catch(err => logger.error(`Backup: ${err.message}`));
});

// Stopper un backup
router.post('/backups/stop', (req, res) => {
  const { backupId } = req.body;
  if (!backupId) return res.status(400).json({ error: 'backupId manquant' });
  const stopped = backup.stopBackup(backupId);
  res.json({ success: stopped });
});

// Supprimer un backup
router.delete('/backups/:backupId', (req, res) => {
  try {
    backup.deleteBackup(req.params.backupId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Télécharger un backup ZIP
router.get('/backups/:backupId/download', (req, res) => {
  const zipPath = require('path').join(backup.BACKUP_DIR, `${req.params.backupId}.zip`);
  if (!fs_bk.existsSync(zipPath)) return res.status(404).json({ error: 'Introuvable' });
  res.download(zipPath, `${req.params.backupId}.zip`);
});

// Lire une section (guild / roles / channels / members / emojis / invites)
router.get('/backups/:backupId/data/:section', (req, res) => {
  try {
    const data = backup.readBackupSection(req.params.backupId, req.params.section);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Infos complètes d'un backup (summary)
router.get('/backups/:backupId/info', (req, res) => {
  const summaryPath = require('path').join(backup.BACKUP_DIR, `${req.params.backupId}.summary.json`);
  if (!fs_bk.existsSync(summaryPath)) return res.status(404).json({ error: 'Introuvable' });
  try { res.json(JSON.parse(fs_bk.readFileSync(summaryPath, 'utf8'))); }
  catch (err) { res.status(500).json({ error: err.message }); }
});


// ── GET /api/stats/daily ──────────────────────────────────
router.get('/stats/daily', (req, res) => {
  res.json(stats.getDailyHistory());
});

// ── GET /api/friends ──────────────────────────────────────
router.get('/friends', async (req, res) => {
  const client = global.client;
  if (!client) return res.json({ friends: [], pending: [], blocked: [] });
  try {
    // discord.js-selfbot-v13 expose les relations via client.relationships
    const relationships = client.relationships?.cache || new Map();
    const friends  = [];
    const pending  = [];
    const blocked  = [];
    const incoming = [];

    for (const [userId, type] of relationships) {
      let user = null;
      try { user = await client.users.fetch(userId); } catch (_) { user = client.users.cache.get(userId); }
      const entry = {
        id       : userId,
        tag      : user?.tag || 'Unknown#0000',
        username : user?.username || 'Unknown',
        avatar   : user?.displayAvatarURL({ format: 'png', size: 64 }) || null,
        bot      : user?.bot || false,
      };
      // type: 1=friend, 2=blocked, 3=pending outgoing, 4=pending incoming
      if      (type === 1) friends.push(entry);
      else if (type === 2) blocked.push(entry);
      else if (type === 3) pending.push({ ...entry, direction: 'outgoing' });
      else if (type === 4) incoming.push({ ...entry, direction: 'incoming' });
    }
    res.json({ friends, pending: [...pending, ...incoming], blocked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/friends/remove ──────────────────────────────
router.post('/friends/remove', async (req, res) => {
  const { userId } = req.body;
  const client = global.client;
  try {
    await client.relationships.deleteRelationship(userId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/friends/block ───────────────────────────────
router.post('/friends/block', async (req, res) => {
  const { userId } = req.body;
  const client = global.client;
  try {
    await client.relationships.block(userId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/friends/unblock ─────────────────────────────
router.post('/friends/unblock', async (req, res) => {
  const { userId } = req.body;
  const client = global.client;
  try {
    await client.relationships.deleteRelationship(userId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/dms ──────────────────────────────────────────
router.get('/dms', async (req, res) => {
  const client = global.client;
  if (!client) return res.json([]);
  try {
    // Récupérer les DMChannels du cache
    const dms = client.channels.cache
      .filter(c => c.type === 'DM')
      .map(c => {
        const recipient = c.recipient;
        const lastMsg   = c.messages?.cache?.last();
        return {
          channelId    : c.id,
          userId       : recipient?.id || null,
          tag          : recipient?.tag || 'Unknown',
          username     : recipient?.username || 'Unknown',
          avatar       : recipient?.displayAvatarURL({ format: 'png', size: 64 }) || null,
          bot          : recipient?.bot || false,
          lastMessage  : lastMsg ? {
            content   : lastMsg.content?.substring(0, 100) || '',
            authorId  : lastMsg.author?.id,
            timestamp : lastMsg.createdAt?.toISOString(),
          } : null,
          lastActivity : c.messages?.cache?.last()?.createdAt?.toISOString() || null,
        };
      })
      .sort((a, b) => {
        const ta = a.lastActivity ? new Date(a.lastActivity) : 0;
        const tb = b.lastActivity ? new Date(b.lastActivity) : 0;
        return tb - ta;
      });
    res.json(dms);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/dms/:channelId/messages ─────────────────────
router.get('/dms/:channelId/messages', async (req, res) => {
  const client = global.client;
  if (!client) return res.json([]);
  try {
    const channel = client.channels.cache.get(req.params.channelId);
    if (!channel || channel.type !== 'DM') return res.status(404).json({ error: 'DM introuvable' });
    const msgs = await channel.messages.fetch({ limit: 50 });
    const result = msgs.map(m => ({
      id         : m.id,
      content    : m.content || '',
      authorId   : m.author?.id,
      authorTag  : m.author?.tag,
      authorAvatar: m.author?.displayAvatarURL({ format: 'png', size: 32 }) || null,
      timestamp  : m.createdAt?.toISOString(),
      attachments: m.attachments?.size || 0,
      embeds     : m.embeds?.length || 0,
      mine       : m.author?.id === client.user?.id,
    })).reverse();
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/dms/:channelId/send ────────────────────────
router.post('/dms/:channelId/send', async (req, res) => {
  const { content } = req.body;
  const client = global.client;
  try {
    const channel = client.channels.cache.get(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel introuvable' });
    await channel.send(content);
    stats.increment('messagesSent');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── POST /api/tokeninfo ───────────────────────────────────


// ── POST /api/username/check ──────────────────────────────
router.post('/username/check', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username requis' });
  const client = global.client;
  if (!client) return res.status(400).json({ error: 'Bot non connecté' });
  try {
    // Tenter de fetch le user par username — si 404 = dispo
    const result = await fetch(`https://discord.com/api/v10/users/@me`, {
      headers: { Authorization: require('../../src/utils/config').getToken() }
    });
    // Vérifier via search si le pseudo existe
    const searchRes = await fetch(`https://discord.com/api/v10/unique-username/check-username-taken`, {
      method: 'POST',
      headers: {
        Authorization: require('../../src/utils/config').getToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username }),
    });
    if (searchRes.ok) {
      const data = await searchRes.json();
      res.json({ username, taken: data.taken });
    } else {
      res.json({ username, taken: null, error: 'Impossible de vérifier' });
    }
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/username/change ─────────────────────────────
router.post('/username/change', async (req, res) => {
  const { username } = req.body;
  const client = global.client;
  if (!client) return res.status(400).json({ error: 'Bot non connecté' });
  try {
    await client.user.edit({ username });
    res.json({ success: true, username });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
