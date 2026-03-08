// ============================================================
//  VORTEX — Module: Auto Reply
//  Répond automatiquement dans les DMs ou partout
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');

// Anti-spam: ne pas répondre 2x au même utilisateur dans 30s
const cooldowns = new Map();
const COOLDOWN  = 30_000;

const AutoReply = {

  async process(message) {
    const client = global.client;
    const config = ConfigMgr.get();
    const cfg    = config.modules.autoReply;

    // Seulement les DMs si onlyDMs est activé
    if (cfg.onlyDMs && message.channel.type !== 'DM') return;

    // Pas de réponse aux bots
    if (message.author.bot) return;

    // Cooldown anti-spam
    const lastReply = cooldowns.get(message.author.id);
    if (lastReply && Date.now() - lastReply < COOLDOWN) return;

    try {
      await message.reply(cfg.message || 'Je suis occupé.');
      cooldowns.set(message.author.id, Date.now());
      logger.info(`AutoReply envoyé à ${message.author.tag}`);
    } catch (err) {
      logger.error(`AutoReply erreur: ${err.message}`);
    }
  },
};

module.exports = AutoReply;
