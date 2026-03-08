// ============================================================
//  VORTEX — Event: messageCreate
//  Gère TOUS les messages: commandes + modules actifs
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');
const stats     = require('../utils/stats');

// Import de tous les modules
const NitroSniper    = require('../modules/nitroSniper');
const GiveawayJoiner = require('../modules/giveawayJoiner');
const AfkModule      = require('../modules/afk');
const AutoReply      = require('../modules/autoReply');
const CommandHandler = require('../modules/commandHandler');

module.exports = {
  name : 'messageCreate',
  once : false,

  async execute(message) {
    const client = global.client;
    const config = ConfigMgr.get();

    // ── Compteur global ───────────────────────────────────
    stats.increment('messagesReceived');

    // ── Modules qui tournent sur tous les messages ────────

    // Nitro Sniper (tourne sur les messages des AUTRES)
    if (message.author.id !== client.user.id) {
      if (config.modules.nitroSniper.enabled) {
        await NitroSniper.process(message);
      }
      if (config.modules.giveawayJoiner.enabled) {
        await GiveawayJoiner.process(message);
      }
      if (config.modules.afk.enabled) {
        await AfkModule.processIncoming(message);
      }
      if (config.modules.autoReply.enabled) {
        await AutoReply.process(message);
      }
    }

    // ── Commandes (uniquement MES messages) ───────────────
    if (message.author.id !== client.user.id) return;

    stats.increment('messagesSent');

    // Vérifier que c'est une commande
    const prefix = config.prefix;
    if (!message.content.startsWith(prefix)) return;

    // Parser la commande
    const raw     = message.content.slice(prefix.length).trim();
    const args    = raw.split(/ +/);
    const command = args.shift().toLowerCase();

    if (!command) return;

    // Lancer le handler de commandes
    await CommandHandler.execute(message, command, args, config);
  },
};
