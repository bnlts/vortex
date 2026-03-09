// ============================================================
//  VORTEX — Module: Giveaway Joiner
//  Rejoint automatiquement les giveaways détectés
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');
const stats     = require('../utils/stats');
const moment    = require('moment');

const GiveawayJoiner = {

  async process(message) {
    const config = ConfigMgr.get();

    // Détecter un giveaway: 🎉 dans le message ou embed
    const hasEmoji   = message.content?.includes('🎉');
    const hasEmbed   = message.embeds?.some(e =>
      e.description?.includes('🎉') || e.title?.toLowerCase().includes('giveaway')
    );

    if (!hasEmoji && !hasEmbed) return;

    // Vérifier qu'il y a une réaction 🎉 disponible
    const giveawayReaction = message.reactions?.cache?.get('🎉');
    if (!giveawayReaction) return;

    const delay = config.modules.giveawayJoiner.delay || 500;
    await new Promise(r => setTimeout(r, delay));

    try {
      await message.react('🎉');

      const entry = {
        guild     : message.guild?.name || 'Inconnu',
        guildId   : message.guild?.id || '',
        channel   : message.channel?.name || 'Inconnu',
        channelId : message.channel?.id || '',
        messageId : message.id,
        host      : message.author?.tag || 'Inconnu',
        timestamp : Date.now(),
        time      : moment().format('HH:mm:ss'),
      };

      stats.increment('giveawaysJoined');
      stats.push('giveawayHistory', entry);

      logger.success(`Giveaway rejoint dans ${entry.guild} #${entry.channel}`);
      if (global.io) global.io.emit('giveaway_joined', entry);

    } catch (err) {
      logger.error(`Impossible de rejoindre le giveaway: ${err.message}`);
    }
  },
};

module.exports = GiveawayJoiner;
