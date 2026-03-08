// ============================================================
//  VORTEX — Event: messageUpdate
//  Capture les messages édités (spy)
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');
const stats     = require('../utils/stats');
const moment    = require('moment');

module.exports = {
  name : 'messageUpdate',
  once : false,

  async execute(oldMessage, newMessage) {
    const config = ConfigMgr.get();

    if (!config.modules.spyEdited.enabled) return;
    if (!oldMessage.content || !newMessage.content) return;
    if (oldMessage.content === newMessage.content) return; // Pas de vrai changement

    const client = global.client;

    if (newMessage.author?.id === client.user.id) return;
    if (config.modules.spyEdited.ignoreBots && newMessage.author?.bot) return;

    const entry = {
      before    : oldMessage.content,
      after     : newMessage.content,
      author    : newMessage.author?.tag || 'Inconnu',
      authorId  : newMessage.author?.id || '0',
      avatar    : newMessage.author?.displayAvatarURL({ format: 'png', size: 64 }) || '',
      channel   : newMessage.channel?.name || 'DM',
      channelId : newMessage.channel?.id || '',
      guild     : newMessage.guild?.name || 'DM',
      guildId   : newMessage.guild?.id || '',
      url       : newMessage.url || '',
      timestamp : Date.now(),
      time      : moment().format('HH:mm:ss'),
    };

    stats.push('editedMessages', entry);

    logger.spy(`Message édité — ${entry.author} dans #${entry.channel}`);

    if (global.io) global.io.emit('message_edited', entry);
  },
};
