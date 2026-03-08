// ============================================================
//  VORTEX — Module: Nitro Sniper
//  Détecte et claim les codes Nitro automatiquement
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');
const stats     = require('../utils/stats');
const moment    = require('moment');

// Regex pour détecter les codes Nitro / Cadeaux
const GIFT_REGEX = /discord\.gift\/([a-zA-Z0-9]+)|discord\.com\/gifts\/([a-zA-Z0-9]+)/g;

const NitroSniper = {

  async process(message) {
    const config = ConfigMgr.get();

    // Chercher un code cadeau dans le message
    const content = message.content || '';
    const matches = [...content.matchAll(GIFT_REGEX)];
    if (!matches.length) return;

    for (const match of matches) {
      const code = match[1] || match[2];
      if (!code) continue;

      const delay = config.modules.nitroSniper.delay || 0;
      if (delay > 0) await new Promise(r => setTimeout(r, delay));

      await NitroSniper.claim(code, message);
    }
  },

  async claim(code, message) {
    const start = Date.now();

    logger.snipe(`Code détecté: ${code} — de ${message.author?.tag} dans ${message.guild?.name || 'DM'}`);

    try {
      const config = ConfigMgr.get();

      const res = await fetch(`https://discord.com/api/v9/entitlements/gift-codes/${code}/redeem`, {
        method  : 'POST',
        headers : {
          'Authorization' : config.token,
          'Content-Type'  : 'application/json',
        },
        body: JSON.stringify({}),
      });

      const data    = await res.json();
      const elapsed = Date.now() - start;

      const entry = {
        code      : code,
        author    : message.author?.tag || 'Inconnu',
        authorId  : message.author?.id || '0',
        guild     : message.guild?.name || 'DM',
        channel   : message.channel?.name || 'DM',
        elapsed   : elapsed,
        timestamp : Date.now(),
        time      : moment().format('HH:mm:ss'),
        success   : false,
        reason    : '',
      };

      // ── Analyser la réponse ───────────────────────────
      if (data.subscription_plan || data.gift_code_flags !== undefined) {
        entry.success = true;
        entry.plan    = data.subscription_plan?.name || 'Nitro';
        stats.increment('nitroSniped');
        logger.success(`✓ NITRO SNIPED! Code: ${code} | Plan: ${entry.plan} | ${elapsed}ms`);
      } else if (res.status === 400 && data.code === 50050) {
        entry.reason = 'Déjà en possession du Nitro';
        logger.warn(`Code valide mais déjà Nitro: ${code}`);
      } else if (res.status === 404 || data.code === 10038) {
        entry.reason = 'Code invalide ou expiré';
        logger.warn(`Code invalide: ${code}`);
      } else if (res.status === 429) {
        entry.reason = 'Rate limited';
        logger.warn(`Rate limited sur: ${code}`);
      } else {
        entry.reason = data.message || `HTTP ${res.status}`;
        logger.warn(`Échec snipe: ${entry.reason}`);
      }

      if (!entry.success) stats.increment('nitroFailed');

      stats.push('nitroHistory', entry);
      if (global.io) global.io.emit('nitro_snipe', entry);

    } catch (err) {
      logger.error(`Erreur sniper: ${err.message}`);
      stats.increment('nitroFailed');
    }
  },
};

module.exports = NitroSniper;
