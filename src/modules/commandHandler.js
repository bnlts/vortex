// ============================================================
//  VORTEX — Command Handler
//  Traite toutes les commandes Discord du selfbot
// ============================================================

const logger    = require('../utils/logger');
const ConfigMgr = require('../utils/config');
const stats     = require('../utils/stats');
const AfkModule = require('./afk');
const Backup    = require('./backup');
const moment    = require('moment');
const VipManager  = require('../utils/vip');
const { analyzeToken } = require('./tokeninfo');

const CommandHandler = {

  async execute(message, command, args, config) {
    stats.increment('commandsUsed');

    const entry = { command, args, timestamp: Date.now(), time: moment().format('HH:mm:ss') };
    stats.push('commandHistory', entry);
    if (global.io) global.io.emit('command_used', entry);

    logger.command(`Commande: ${config.prefix}${command} [${args.join(', ')}]`);

    // ── Blacklist check ───────────────────────────────────
    if (VipManager.isBlacklisted(message.author.id)) return;

    // ── Chercher dans les commandes custom d'abord ────────
    if (config.customCommands[command]) {
      return message.edit(config.customCommands[command]).catch(() => {});
    }

    // ── Commandes intégrées ───────────────────────────────
    switch (command) {

      // ─ help ─────────────────────────────────────────────
      case 'help': {
        const p = config.prefix;
        return message.edit([
          '```',
          '⚡ VORTEX — Commandes',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          '',
          '📊 INFO',
          `  ${p}info          → Infos du selfbot`,
          `  ${p}stats         → Statistiques complètes`,
          `  ${p}ping          → Latence WebSocket`,
          `  ${p}uptime        → Temps de fonctionnement`,
          '',
          '👤 PROFIL',
          `  ${p}avatar [@]    → Avatar en HD`,
          `  ${p}userinfo [@]  → Infos utilisateur`,
          `  ${p}serverinfo    → Infos serveur`,
          `  ${p}status [txt]  → Changer le statut`,
          '',
          '🛠️ UTILITAIRES',
          `  ${p}purge [n]     → Supprimer tes messages`,
          `  ${p}say [msg]     → Envoyer un message`,
          `  ${p}dm [id] [msg] → Envoyer un DM`,
          `  ${p}copy          → Copier l'ID du message`,
          '',
          '🔧 MODULES',
          `  ${p}afk [msg]     → Toggle mode AFK`,
          `  ${p}sniper        → Toggle Nitro Sniper`,
          `  ${p}giveaway      → Toggle Giveaway Joiner`,
          '',
          '⚙️ CONFIG',
          `  ${p}config        → Voir la config`,
          `  ${p}reload        → Recharger la config`,
          `  ${p}prefix [x]   → Changer le préfixe`,
          '',
          '💾 BACKUP',
          `  ${p}backup        → Backup complet (JSON)`,
          `  ${p}backuplist    → Lister les backups`,
          `  ${p}backupclean [n] → Garder N backups`,
          '',
          `Dashboard: http://localhost:${config.dashboard.port}`,
          '```',
        ].join('\n')).catch(() => {});
      }

      // ─ info ─────────────────────────────────────────────
      case 'info': {
        const client   = global.client;
        const uptime   = moment.duration(Date.now() - stats.startTime).humanize();
        return message.edit([
          '```',
          '⚡ VORTEX v2.0.0',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━',
          `Compte   : ${client.user.tag}`,
          `ID       : ${client.user.id}`,
          `Uptime   : ${uptime}`,
          `Ping     : ${client.ws.ping}ms`,
          `Serveurs : ${client.guilds.cache.size}`,
          `Préfixe  : ${config.prefix}`,
          '```',
        ].join('\n')).catch(() => {});
      }

      // ─ stats ────────────────────────────────────────────
      case 'stats': {
        const s = stats.getSummary();
        return message.edit([
          '```',
          '⚡ Statistiques Vortex',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          `Messages reçus  : ${s.messagesReceived}`,
          `Messages envoyés: ${s.messagesSent}`,
          `Commandes       : ${s.commandsUsed}`,
          `Nitro sniped    : ${s.nitroSniped}`,
          `Nitro échoués   : ${s.nitroFailed}`,
          `Giveaways       : ${s.giveawaysJoined}`,
          `Msgs supprimés  : ${s.deletedCount}`,
          `Msgs édités     : ${s.editedCount}`,
          '```',
        ].join('\n')).catch(() => {});
      }

      // ─ ping ─────────────────────────────────────────────
      case 'ping': {
        const client = global.client;
        const start  = Date.now();
        await message.edit('⏳').catch(() => {});
        const diff   = Date.now() - start;
        return message.edit(`\`⚡ Ping: ${diff}ms | WS: ${client.ws.ping}ms\``).catch(() => {});
      }

      // ─ uptime ───────────────────────────────────────────
      case 'uptime': {
        const uptime = moment.duration(Date.now() - stats.startTime).humanize();
        return message.edit(`\`⏱️ Uptime: ${uptime}\``).catch(() => {});
      }

      // ─ avatar ───────────────────────────────────────────
      case 'avatar': {
        const target = message.mentions.users.first() || message.author;
        const url    = target.displayAvatarURL({ format: 'png', size: 4096 });
        return message.edit(`**Avatar de ${target.username}**\n${url}`).catch(() => {});
      }

      // ─ userinfo ─────────────────────────────────────────
      case 'userinfo': {
        const target  = message.mentions.users.first() || message.author;
        const member  = message.guild?.members.cache.get(target.id);
        return message.edit([
          '```',
          `👤 ${target.tag}`,
          '━━━━━━━━━━━━━━━━━━━━━━━━',
          `ID      : ${target.id}`,
          `Créé le : ${moment(target.createdAt).format('DD/MM/YYYY')}`,
          `Rejoint : ${member ? moment(member.joinedAt).format('DD/MM/YYYY') : 'N/A'}`,
          `Bot     : ${target.bot ? 'Oui' : 'Non'}`,
          `Badges  : ${target.flags?.toArray().join(', ') || 'Aucun'}`,
          '```',
        ].join('\n')).catch(() => {});
      }

      // ─ serverinfo ───────────────────────────────────────
      case 'serverinfo': {
        const guild = message.guild;
        if (!guild) return message.edit('`❌ Pas dans un serveur`').catch(() => {});
        return message.edit([
          '```',
          `🏠 ${guild.name}`,
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          `ID          : ${guild.id}`,
          `Membres     : ${guild.memberCount}`,
          `Salons      : ${guild.channels.cache.size}`,
          `Rôles       : ${guild.roles.cache.size}`,
          `Emojis      : ${guild.emojis.cache.size}`,
          `Boosts      : ${guild.premiumSubscriptionCount}`,
          `Boost Level : ${guild.premiumTier}`,
          `Créé le     : ${moment(guild.createdAt).format('DD/MM/YYYY')}`,
          '```',
        ].join('\n')).catch(() => {});
      }

      // ─ purge ────────────────────────────────────────────
      case 'purge': {
        const amount   = Math.min(parseInt(args[0]) || 5, 50);
        const messages = await message.channel.messages.fetch({ limit: 100 });
        const mine     = [...messages.values()]
          .filter(m => m.author.id === message.author.id)
          .slice(0, amount);

        await message.delete().catch(() => {});
        let deleted = 0;
        for (const msg of mine) {
          await msg.delete().catch(() => {});
          deleted++;
          await new Promise(r => setTimeout(r, 350)); // Anti-ratelimit
        }
        logger.info(`Purge: ${deleted} messages supprimés`);
        return;
      }

      // ─ say ──────────────────────────────────────────────
      case 'say': {
        const text = args.join(' ');
        if (!text) return message.edit('`❌ Usage: .say [message]`').catch(() => {});
        await message.delete().catch(() => {});
        return message.channel.send(text).catch(() => {});
      }

      // ─ dm ───────────────────────────────────────────────
      case 'dm': {
        const [targetId, ...rest] = args;
        const text   = rest.join(' ');
        const client = global.client;
        try {
          const user = await client.users.fetch(targetId);
          const dm   = await user.createDM();
          await dm.send(text);
          return message.edit(`\`✅ DM envoyé à ${user.tag}\``).catch(() => {});
        } catch (err) {
          return message.edit(`\`❌ Erreur: ${err.message}\``).catch(() => {});
        }
      }

      // ─ status ───────────────────────────────────────────
      case 'status': {
        const client = global.client;
        const text   = args.join(' ');
        if (!text) return message.edit('`❌ Usage: .status [texte]`').catch(() => {});
        try {
          await client.user.setPresence({ activities: [{ name: text, type: 'PLAYING' }] });
          ConfigMgr.updateModule('customStatus', { enabled: true, text });
          return message.edit(`\`✅ Status: ${text}\``).catch(() => {});
        } catch (err) {
          return message.edit(`\`❌ Erreur: ${err.message}\``).catch(() => {});
        }
      }

      // ─ afk ──────────────────────────────────────────────
      case 'afk': {
        const customMsg = args.join(' ');
        const result    = await AfkModule.toggle(message, customMsg || null);
        return message.edit(`\`${result.enabled ? '💤 AFK activé' : '✅ AFK désactivé'} — "${result.message}"\``).catch(() => {});
      }

      // ─ sniper ───────────────────────────────────────────
      case 'sniper': {
        const cfg  = ConfigMgr.get().modules.nitroSniper;
        const next = !cfg.enabled;
        ConfigMgr.updateModule('nitroSniper', { enabled: next });
        return message.edit(`\`${next ? '✅ Nitro Sniper activé' : '❌ Nitro Sniper désactivé'}\``).catch(() => {});
      }

      // ─ giveaway ─────────────────────────────────────────
      case 'giveaway': {
        const cfg  = ConfigMgr.get().modules.giveawayJoiner;
        const next = !cfg.enabled;
        ConfigMgr.updateModule('giveawayJoiner', { enabled: next });
        return message.edit(`\`${next ? '✅ Giveaway Joiner activé' : '❌ Giveaway Joiner désactivé'}\``).catch(() => {});
      }

      // ─ config ───────────────────────────────────────────
      case 'config': {
        const cfg = ConfigMgr.get();
        const m   = cfg.modules;
        return message.edit([
          '```',
          '⚙️ Config Vortex',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          `Préfixe       : ${cfg.prefix}`,
          `Nitro Sniper  : ${m.nitroSniper.enabled ? 'ON' : 'OFF'}`,
          `Giveaway      : ${m.giveawayJoiner.enabled ? 'ON' : 'OFF'}`,
          `AFK           : ${m.afk.enabled ? 'ON' : 'OFF'}`,
          `Spy Deleted   : ${m.spyDeleted.enabled ? 'ON' : 'OFF'}`,
          `Spy Edited    : ${m.spyEdited.enabled ? 'ON' : 'OFF'}`,
          `Custom Status : ${m.customStatus.enabled ? 'ON' : 'OFF'}`,
          '```',
        ].join('\n')).catch(() => {});
      }

      // ─ reload ───────────────────────────────────────────
      case 'reload': {
        return message.edit('`✅ Config rechargée (automatique)`').catch(() => {});
      }

      // ─ backup ───────────────────────────────────────────
      case 'backup': {
        await message.edit('`⏳ Génération du backup en cours...`').catch(() => {});
        try {
          const { backup, filename, fileSizeKb } = await Backup.generate();
          const b  = backup;
          const s  = b.stats.session;
          const g  = b.guilds || [];
          const dm = b.dmChannels || [];

          // Auto-cleanup: garder 10 backups max
          const cleaned = Backup.cleanup(10);

          return message.edit([
            '```',
            '✅ VORTEX — BACKUP COMPLET',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '',
            '📁 FICHIER',
            `  Nom     : ${filename}`,
            `  Taille  : ${fileSizeKb} KB`,
            `  Dossier : ./backups/`,
            '',
            '👤 COMPTE',
            `  Tag     : ${b.account?.tag || 'N/A'}`,
            `  ID      : ${b.account?.id || 'N/A'}`,
            `  Nitro   : ${b.account?.nitro != null ? (b.account.nitro > 0 ? `Tier ${b.account.nitro}` : 'Non') : 'N/A'}`,
            '',
            '🌐 RÉSEAU',
            `  Serveurs       : ${g.length}`,
            `  Membres totaux : ${g.reduce((a, x) => a + (x.memberCount || 0), 0).toLocaleString()}`,
            `  DMs en cache   : ${dm.length}`,
            `  Salons indexés : ${g.reduce((a, x) => a + (x.channelList?.length || 0), 0)}`,
            '',
            '📊 SESSION',
            `  Durée          : ${s.durationHuman}`,
            `  Msgs reçus     : ${s.messagesReceived}`,
            `  Msgs envoyés   : ${s.messagesSent}`,
            `  Commandes      : ${s.commandsUsed}`,
            `  Nitro sniped   : ${s.nitroSniped} (${s.nitroSuccessRate})`,
            `  Giveaways      : ${s.giveawaysJoined}`,
            `  Ghost pings    : ${s.ghostPings}`,
            '',
            '🔧 SYSTÈME',
            `  OS      : ${b.system.platform} ${b.system.arch}`,
            `  Node.js : ${b.system.nodeVer}`,
            `  RAM     : ${b.system.procMem} utilisés`,
            '',
            '📋 HISTORIQUES INCLUS',
            `  Nitro snipes     : ${b.stats.history.nitroSnipes.length}`,
            `  Giveaways        : ${b.stats.history.giveaways.length}`,
            `  Msgs supprimés   : ${b.stats.history.deletedMessages.length}`,
            `  Msgs édités      : ${b.stats.history.editedMessages.length}`,
            `  Ghost pings      : ${b.stats.history.ghostPings.length}`,
            `  Commandes        : ${b.stats.history.commands.length}`,
            `  Logs récents     : ${b.logs?.length || 0}`,
            ...(cleaned > 0 ? ['', `🗑️ ${cleaned} vieux backup(s) supprimé(s) automatiquement`] : []),
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `Généré le ${moment().format('DD/MM/YYYY à HH:mm:ss')}`,
            '```',
          ].join('\n')).catch(() => {});
        } catch (err) {
          logger.error(`Backup échoué: ${err.message}`);
          return message.edit(`\`❌ Backup échoué: ${err.message}\``).catch(() => {});
        }
      }

      // ─ backuplist ────────────────────────────────────────
      case 'backuplist': {
        const list = Backup.list();
        if (!list.length) return message.edit('`📭 Aucun backup trouvé — utilise .backup pour en créer un`').catch(() => {});
        return message.edit([
          '```',
          `📦 BACKUPS VORTEX (${list.length})`,
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          ...list.map((b, i) => `  ${i + 1}. ${b.name}\n     ${b.size} — ${b.created}`),
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          `Dossier: ./backups/`,
          '```',
        ].join('\n')).catch(() => {});
      }

      // ─ backupclean ───────────────────────────────────────
      case 'backupclean': {
        const keep    = parseInt(args[0]) || 5;
        const deleted = Backup.cleanup(keep);
        return message.edit(`\`🗑️ ${deleted} backup(s) supprimé(s) — ${keep} gardé(s)\``).catch(() => {});
      }

      // ─ prefix ───────────────────────────────────────────
      case 'prefix': {
        const newPrefix = args[0];
        if (!newPrefix) return message.edit('`❌ Usage: .prefix [x]`').catch(() => {});
        ConfigMgr.updatePrefix(newPrefix);
        return message.edit(`\`✅ Préfixe changé: ${newPrefix}\``).catch(() => {});
      }



      // ─ Commande inconnue ─────────────────────────────────
      default: {
        // Silencieux — pas d'erreur pour les commandes inconnues
        return;
      }
    }
  },
};

module.exports = CommandHandler;
