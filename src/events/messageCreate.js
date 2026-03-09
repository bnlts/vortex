// ============================================================
//  VORTEX — Event: messageCreate
//  Commandes Discord supprimées — tout via dashboard
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');
const stats     = require('../utils/stats');
const AfkModule = require('../modules/afk');
const VipManager = require('../utils/vip');

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    if (!message.author) return;
    const client = global.client;
    if (!client) return;

    stats.increment('messagesReceived');

    // ── Blacklist check ───────────────────────────────────
    if (VipManager.isBlacklisted(message.author.id)) return;

    // ── AFK auto-reply ────────────────────────────────────
    const config = ConfigMgr.get();
    if (config.modules.afk.enabled &&
        message.author.id !== client.user.id &&
        message.mentions.has(client.user)) {
      const afkMsg = config.modules.afk.message || 'Je suis AFK';
      message.reply(`💤 ${afkMsg}`).catch(() => {});
    }

    // ── Auto-reply ────────────────────────────────────────
    if (config.modules.autoReply?.enabled && message.author.id !== client.user.id) {
      const trigger = config.modules.autoReply.trigger?.toLowerCase();
      if (trigger && message.content.toLowerCase().includes(trigger)) {
        message.reply(config.modules.autoReply.message || '').catch(() => {});
      }
    }

    // ── Spy: messages supprimés/édités sont gérés ailleurs ─
    // ── Log dashboard ─────────────────────────────────────
    if (global.io) {
      global.io.emit('message_received', {
        content   : message.content?.substring(0, 200),
        author    : message.author.tag,
        authorId  : message.author.id,
        channel   : message.channel?.name || 'DM',
        guild     : message.guild?.name || 'DM',
        timestamp : Date.now(),
      });
    }
  },
};
