// ============================================================
//  VORTEX — Backup Engine v3
//  Backup granulaire complet — 100% géré dashboard
// ============================================================
'use strict';

const fs       = require('fs');
const path     = require('path');
const archiver = require('archiver');
const moment   = require('moment');
const logger   = require('../utils/logger');

const BACKUP_DIR = path.join(__dirname, '../../backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const activeBackups = new Map();

function emit(event, data) { if (global.io) global.io.emit(event, data); }

function emitProgress(backupId, label, pct, extra = {}) {
  const d = { backupId, label, pct: Math.round(Math.min(pct, 99)), ts: Date.now(), ...extra };
  activeBackups.set(backupId, { ...(activeBackups.get(backupId) || {}), ...d });
  emit('backup_progress', d);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchMessages(channel, limit = 500) {
  const messages = [];
  let lastId = null;
  try {
    while (messages.length < limit) {
      const toFetch = Math.min(100, limit - messages.length);
      const opts = { limit: toFetch };
      if (lastId) opts.before = lastId;
      const batch = await channel.messages.fetch(opts);
      if (!batch.size) break;
      batch.forEach(m => messages.push({
        id: m.id, author: m.author?.tag || 'Unknown', authorId: m.author?.id || '',
        authorAvatar: m.author?.displayAvatarURL({ format: 'png', size: 64 }) || '',
        content: m.content || '',
        attachments: [...m.attachments.values()].map(a => ({ name: a.name, url: a.url, size: a.size, contentType: a.contentType })),
        embeds: m.embeds?.length || 0,
        reactions: [...(m.reactions?.cache?.values() || [])].map(r => ({ emoji: r.emoji.name, count: r.count })),
        timestamp: m.createdAt?.toISOString(), edited: m.editedAt?.toISOString() || null,
        pinned: m.pinned, type: m.type,
      }));
      lastId = batch.last()?.id;
      await sleep(300);
    }
  } catch (_) {}
  return messages.reverse();
}

async function backupGuild(guildId, options = {}) {
  const client = global.client;
  if (!client) throw new Error('Client Discord non connecté');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error(`Serveur introuvable: ${guildId}`);

  const opts = {
    guildInfo   : options.guildInfo    !== false,
    roles       : options.roles        !== false,
    channels    : options.channels     !== false,
    members     : options.members      !== false,
    emojis      : options.emojis       !== false,
    invites     : options.invites      !== false,
    messages    : options.messages     !== false,
    messageLimit: options.messageLimit || 500,
  };

  const startedAt = Date.now();
  const backupId  = `${guild.name.replace(/[^a-zA-Z0-9]/g, '_')}_${moment().format('YYYY-MM-DD_HH-mm-ss')}`;
  const backupPath = path.join(BACKUP_DIR, backupId);
  fs.mkdirSync(backupPath, { recursive: true });

  const totalSteps = ['guildInfo','roles','channels','members','emojis','invites','messages','zip'].filter(
    s => s === 'zip' || s === 'guildInfo' || opts[s]
  ).length;

  activeBackups.set(backupId, {
    status: 'running', startedAt, backupId,
    guildName: guild.name, guildId, guildIcon: guild.iconURL({ format: 'png', size: 64 }) || null,
    opts, totalSteps, pct: 0,
  });

  emit('backup_started', {
    backupId, guildId, guildName: guild.name,
    guildIcon: guild.iconURL({ format: 'png', size: 64 }) || null, opts,
  });
  logger.success(`Backup démarré: ${guild.name} [${backupId}]`);

  const data = {
    meta: { backupId, guildId, backupDate: new Date().toISOString(), vortexVersion: '2.0.0', options: opts },
    guild: {}, roles: [], channels: [], members: [], emojis: [], stickers: [], invites: [], messages: {},
  };

  let stepIdx = 0;

  try {
    // INFOS SERVEUR
    emitProgress(backupId, '🏠 Informations du serveur...', ++stepIdx / totalSteps * 100 * .25);
    await guild.fetch();
    data.guild = {
      id: guild.id, name: guild.name, description: guild.description,
      icon: guild.iconURL({ format: 'png', size: 512 }) || null,
      banner: guild.bannerURL({ format: 'png', size: 1024 }) || null,
      splash: guild.splashURL({ format: 'png', size: 1024 }) || null,
      ownerId: guild.ownerId,
      ownerTag: (await client.users.fetch(guild.ownerId).catch(() => null))?.tag || 'Unknown',
      memberCount: guild.memberCount, maxMembers: guild.maximumMembers,
      verificationLevel: guild.verificationLevel, explicitContentFilter: guild.explicitContentFilter,
      mfaLevel: guild.mfaLevel, premiumTier: guild.premiumTier,
      premiumCount: guild.premiumSubscriptionCount, vanityUrl: guild.vanityURLCode,
      preferredLocale: guild.preferredLocale, features: [...(guild.features || [])],
      nsfwLevel: guild.nsfwLevel, createdAt: guild.createdAt?.toISOString(),
    };

    // RÔLES
    if (opts.roles) {
      emitProgress(backupId, '🎭 Backup des rôles...', ++stepIdx / totalSteps * 100 * .45);
      const roles = await guild.roles.fetch();
      data.roles = roles.map(r => ({
        id: r.id, name: r.name, color: r.hexColor, hoist: r.hoist,
        position: r.position, permissions: r.permissions.toArray(),
        permBitfield: r.permissions.bitfield.toString(),
        managed: r.managed, mentionable: r.mentionable,
        icon: r.iconURL() || null, unicodeEmoji: r.unicodeEmoji,
        createdAt: r.createdAt?.toISOString(), memberCount: r.members?.size || 0,
      })).sort((a, b) => b.position - a.position);
    }

    // SALONS
    let fetchedChannels = null;
    if (opts.channels || opts.messages) {
      emitProgress(backupId, '💬 Backup des salons...', ++stepIdx / totalSteps * 100 * .55);
      fetchedChannels = await guild.channels.fetch();
      if (opts.channels) {
        data.channels = fetchedChannels.map(c => {
          if (!c) return null;
          return {
            id: c.id, name: c.name, type: c.type, position: c.position,
            parentId: c.parentId, parentName: c.parent?.name || null,
            createdAt: c.createdAt?.toISOString(), nsfw: c.nsfw || false,
            topic: c.topic || null, bitrate: c.bitrate || null,
            userLimit: c.userLimit || null, slowmode: c.rateLimitPerUser || 0,
            permissionOverwrites: [...(c.permissionOverwrites?.cache?.values() || [])].map(p => ({
              id: p.id, type: p.type, allow: p.allow?.toArray() || [], deny: p.deny?.toArray() || [],
            })),
          };
        }).filter(Boolean).sort((a, b) => (a.position || 0) - (b.position || 0));
      }
    }

    // MEMBRES
    if (opts.members) {
      emitProgress(backupId, '👥 Backup des membres...', ++stepIdx / totalSteps * 100 * .65);
      try {
        const members = await guild.members.fetch({ time: 30000 });
        data.members = members.map(m => ({
          id: m.id, tag: m.user?.tag || 'Unknown', username: m.user?.username || '',
          nickname: m.nickname || null,
          avatar: m.user?.displayAvatarURL({ format: 'png', size: 64 }) || '',
          roles: m.roles.cache.map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
          joinedAt: m.joinedAt?.toISOString(), createdAt: m.user?.createdAt?.toISOString(),
          bot: m.user?.bot || false, premiumSince: m.premiumSince?.toISOString() || null,
        }));
      } catch (_) {
        data.members = guild.members.cache.map(m => ({
          id: m.id, tag: m.user?.tag || 'Unknown', nickname: m.nickname || null,
          roles: m.roles.cache.map(r => ({ id: r.id, name: r.name })),
          joinedAt: m.joinedAt?.toISOString(), bot: m.user?.bot || false,
        }));
      }
    }

    // EMOJIS & STICKERS
    if (opts.emojis) {
      emitProgress(backupId, '😀 Emojis & stickers...', ++stepIdx / totalSteps * 100 * .72);
      const emojis = await guild.emojis.fetch();
      data.emojis = emojis.map(e => ({
        id: e.id, name: e.name, url: e.url, animated: e.animated,
        managed: e.managed, createdAt: e.createdAt?.toISOString(),
      }));
      try {
        const stickers = await guild.stickers.fetch();
        data.stickers = stickers.map(s => ({ id: s.id, name: s.name, description: s.description, url: s.url, format: s.format }));
      } catch (_) {}
    }

    // INVITATIONS
    if (opts.invites) {
      emitProgress(backupId, '🔗 Invitations...', ++stepIdx / totalSteps * 100 * .77);
      try {
        const invites = await guild.invites.fetch();
        data.invites = invites.map(i => ({
          code: i.code, url: i.url, inviter: i.inviter?.tag || 'Unknown',
          channel: i.channel?.name || '', uses: i.uses, maxUses: i.maxUses,
          temporary: i.temporary, createdAt: i.createdAt?.toISOString(),
        }));
      } catch (_) {}
    }

    // MESSAGES
    if (opts.messages && fetchedChannels) {
      const textChannels = fetchedChannels.filter(c => c && (c.type === 'GUILD_TEXT' || c.type === 0) && c.viewable);
      let done = 0;
      for (const [cId, channel] of textChannels) {
        if (activeBackups.get(backupId)?.status === 'stopped') break;
        const pct = 77 + (done / Math.max(textChannels.size, 1)) * 17;
        emitProgress(backupId, `💬 #${channel.name} (${done + 1}/${textChannels.size})`, pct, {
          currentChannel: channel.name, channelsDone: done, channelsTotal: textChannels.size,
        });
        const msgs = await fetchMessages(channel, opts.messageLimit);
        if (msgs.length > 0) data.messages[cId] = { name: channel.name, messages: msgs };
        done++;
        await sleep(150);
      }
      stepIdx++;
    }

    // ZIP
    emitProgress(backupId, '📦 Compression ZIP...', 95);
    fs.writeFileSync(path.join(backupPath, 'backup.json'), JSON.stringify(data, null, 2));
    const zipPath = path.join(BACKUP_DIR, `${backupId}.zip`);
    await createZip(backupPath, zipPath);
    fs.rmSync(backupPath, { recursive: true, force: true });

    const totalMessages = Object.values(data.messages).reduce((a, c) => a + c.messages.length, 0);
    const sizeMb   = Math.round(fs.statSync(zipPath).size / 1024 / 1024 * 100) / 100;
    const duration = Math.round((Date.now() - startedAt) / 1000);

    const summary = {
      backupId, guildName: guild.name, guildId,
      guildIcon: guild.iconURL({ format: 'png', size: 64 }) || null,
      date: new Date().toISOString(), options: opts,
      stats: {
        roles: data.roles.length, channels: data.channels.length,
        members: data.members.length, emojis: data.emojis.length,
        stickers: data.stickers.length, invites: data.invites.length,
        messages: totalMessages, channelsWithMessages: Object.keys(data.messages).length,
      },
      duration, sizeMb,
    };

    fs.writeFileSync(path.join(BACKUP_DIR, `${backupId}.summary.json`), JSON.stringify(summary, null, 2));
    activeBackups.set(backupId, { status: 'done', pct: 100, ...summary });
    emit('backup_complete', summary);
    logger.success(`✓ Backup: ${guild.name} — ${totalMessages} msgs, ${data.members.length} membres, ${sizeMb}MB, ${duration}s`);
    return summary;

  } catch (err) {
    activeBackups.set(backupId, { status: 'error', error: err.message, backupId, guildId, guildName: guild.name });
    emit('backup_error', { backupId, guildId, error: err.message });
    logger.error(`Backup échoué [${backupId}]: ${err.message}`);
    try { fs.rmSync(backupPath, { recursive: true, force: true }); } catch (_) {}
    throw err;
  }
}

function createZip(sourceDir, zipPath) {
  return new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 7 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.summary.json'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf8')); } catch { return null; } })
      .filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch { return []; }
}

function deleteBackup(backupId) {
  ['.zip', '.summary.json'].forEach(ext => {
    const p = path.join(BACKUP_DIR, backupId + ext);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

function stopBackup(backupId) {
  const b = activeBackups.get(backupId);
  if (b?.status === 'running') {
    activeBackups.set(backupId, { ...b, status: 'stopped' });
    emit('backup_stopped', { backupId });
    logger.warn(`Backup stoppé: ${backupId}`);
    return true;
  }
  return false;
}

function getActiveBackups() { return [...activeBackups.values()].filter(b => b.status === 'running'); }
function getBackupStatus(backupId) { return activeBackups.get(backupId) || null; }

function readBackupSection(backupId, section) {
  const AdmZip = require('adm-zip');
  const zipPath = path.join(BACKUP_DIR, `${backupId}.zip`);
  if (!fs.existsSync(zipPath)) throw new Error('Backup introuvable');
  const zip   = new AdmZip(zipPath);
  const entry = zip.getEntry('backup.json');
  if (!entry) throw new Error('backup.json introuvable dans le ZIP');
  const data = JSON.parse(entry.getData().toString('utf8'));
  return data[section] ?? null;
}

module.exports = {
  backupGuild, listBackups, deleteBackup, stopBackup,
  getActiveBackups, getBackupStatus, readBackupSection,
  BACKUP_DIR, activeBackups,
};
