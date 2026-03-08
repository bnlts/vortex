// ============================================================
//  VORTEX — Module: AFK
//  Répond automatiquement quand on te mentionne
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');

const AfkModule = {

  // Traite les messages entrants quand AFK est actif
  async processIncoming(message) {
    const client = global.client;
    const config = ConfigMgr.get();

    // Vérifier si on est mentionné
    if (!message.mentions.has(client.user.id)) return;
    if (message.author.id === client.user.id) return;

    const afkMessage = config.modules.afk.message || 'Je suis AFK en ce moment.';

    try {
      await message.reply(`💤 **AFK** — ${afkMessage}`);
      logger.info(`Réponse AFK envoyée à ${message.author.tag}`);
    } catch (err) {
      logger.error(`Erreur AFK reply: ${err.message}`);
    }
  },

  // Activer / désactiver l'AFK
  async toggle(message, customMsg) {
    const config    = ConfigMgr.get();
    const newState  = !config.modules.afk.enabled;
    const newMsg    = customMsg || config.modules.afk.message;

    ConfigMgr.updateModule('afk', { enabled: newState, message: newMsg });

    const status = newState ? '✅ AFK activé' : '❌ AFK désactivé';
    logger.info(`${status} — Message: "${newMsg}"`);

    return { enabled: newState, message: newMsg };
  },
};

module.exports = AfkModule;
