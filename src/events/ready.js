// ============================================================
//  VORTEX — Event: ready
//  Déclenché quand le selfbot est connecté à Discord
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');
const stats     = require('../utils/stats');

module.exports = {
  name : 'ready',
  once : true,

  async execute() {
    const client = global.client;
    const config = ConfigMgr.get();

    logger.success(`Connecté en tant que ${client.user.tag} (${client.user.id})`);
    logger.info(`${client.guilds.cache.size} serveurs • ${client.users.cache.size} utilisateurs en cache`);
    logger.info(`Dashboard disponible sur http://localhost:${config.dashboard.port}`);

    // ── Appliquer le statut custom si activé ─────────────
    const cs = config.modules.customStatus;
    if (cs.enabled) {
      try {
        await client.user.setPresence({
          activities : [{ name: cs.text, type: cs.type }],
          status     : cs.status || 'online',
        });
        logger.success(`Status custom appliqué: "${cs.text}"`);
      } catch (err) {
        logger.error(`Impossible d'appliquer le status: ${err.message}`);
      }
    }

    // ── Informer le dashboard ─────────────────────────────
    const userData = {
      tag        : client.user.tag,
      username   : client.user.username,
      id         : client.user.id,
      avatar     : client.user.displayAvatarURL({ format: 'png', size: 256 }),
      guilds     : client.guilds.cache.size,
      friends    : client.users.cache.filter(u => u.id !== client.user.id).size,
      createdAt  : client.user.createdAt,
    };

    if (global.io) {
      global.io.emit('bot_ready', userData);
      global.io.emit('stats_update', stats.getSummary());
    }

    // Stocker les infos user globalement
    global.botUser = userData;
  },
};
