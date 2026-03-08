// ============================================================
//  VORTEX — Event: messageDelete
//  Capture les messages supprimés (spy)
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');
const stats     = require('../utils/stats');
const moment    = require('moment');

module.exports = {
  name : 'messageDelete',
  once : false,

  async execute(message) {
    const config = ConfigMgr.get();

    if (!config.modules.spyDeleted.enabled) return;
    if (!message.content) return; // Message non en cache

    const client = global.client;

    // Ignorer ses propres messages
    if (message.author?.id === client.user.id) return;

    // Ignorer les bots si option activée
    if (config.modules.spyDeleted.ignoreBots && message.author?.bot) return;

    const entry = {
      content   : message.content,
      author    : message.author?.tag || 'Inconnu',
      authorId  : message.author?.id || '0',
      avatar    : message.author?.displayAvatarURL({ format: 'png', size: 64 }) || '',
      channel   : message.channel?.name || 'DM',
      channelId : message.channel?.id || '',
      guild     : message.guild?.name || 'DM',
      guildId   : message.guild?.id || '',
      timestamp : Date.now(),
      time      : moment().format('HH:mm:ss'),
      attachments: message.attachments?.size || 0,
    };

    stats.push('deletedMessages', entry);

    logger.spy(`Message supprimé — ${entry.author} dans #${entry.channel}: "${entry.content.substring(0, 80)}"`);

    // Émettre au dashboard
    if (global.io) global.io.emit('message_deleted', entry);
  },
};
