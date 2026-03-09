// ============================================================
//  VORTEX — TokenInfo (feature VIP)
//  Analyse complète d'un token Discord
// ============================================================
'use strict';

const moment = require('moment');

const BADGE_MAP = {
  DISCORD_EMPLOYEE             : 'Staff Discord',
  PARTNERED_SERVER_OWNER       : 'Partenaire',
  HYPESQUAD_EVENTS             : 'HypeSquad Events',
  BUGHUNTER_LEVEL_1            : 'Bug Hunter Lv1',
  BUGHUNTER_LEVEL_2            : 'Bug Hunter Lv2',
  HOUSE_BRAVERY                : 'HypeSquad Bravery',
  HOUSE_BRILLIANCE             : 'HypeSquad Brilliance',
  HOUSE_BALANCE                : 'HypeSquad Balance',
  EARLY_SUPPORTER              : 'Early Supporter',
  VERIFIED_BOT_DEVELOPER       : 'Dev Bot Vérifié',
  DISCORD_CERTIFIED_MODERATOR  : 'Modérateur Certifié',
  ACTIVE_DEVELOPER             : 'Développeur Actif',
};

const NITRO_MAP = {
  0 : 'Aucun',
  1 : 'Nitro Classic',
  2 : 'Nitro',
  3 : 'Nitro Basic',
};

async function analyzeToken(token) {
  // Fetch /users/@me
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: {
      Authorization : token,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  const user = await res.json();

  // Fetch billing (peut échouer si pas le bon scope)
  let nitroType = user.premium_type || 0;

  // Décoder l'ID pour la date de création
  const idBigInt    = BigInt(user.id);
  const discordEpoch = 1420070400000n;
  const createdMs   = Number((idBigInt >> 22n) + discordEpoch);
  const createdAt   = new Date(createdMs);

  // Flags → badges
  const flags  = user.public_flags || 0;
  const badges = Object.entries(BADGE_MAP)
    .filter(([, , bit]) => bit ? (flags & bit) !== 0 : false);

  // On parse les flags manuellement
  const FLAG_BITS = {
    DISCORD_EMPLOYEE            : 1 << 0,
    PARTNERED_SERVER_OWNER      : 1 << 1,
    HYPESQUAD_EVENTS            : 1 << 2,
    BUGHUNTER_LEVEL_1           : 1 << 3,
    HOUSE_BRAVERY               : 1 << 6,
    HOUSE_BRILLIANCE            : 1 << 7,
    HOUSE_BALANCE               : 1 << 8,
    EARLY_SUPPORTER             : 1 << 9,
    BUGHUNTER_LEVEL_2           : 1 << 14,
    VERIFIED_BOT_DEVELOPER      : 1 << 17,
    DISCORD_CERTIFIED_MODERATOR : 1 << 18,
    ACTIVE_DEVELOPER            : 1 << 22,
  };

  const userBadges = Object.entries(FLAG_BITS)
    .filter(([, bit]) => (flags & bit) !== 0)
    .map(([name]) => BADGE_MAP[name] || name);

  // Masquer l'email
  const email = user.email
    ? user.email.replace(/(.{2}).*(@.*)/, '$1***$2')
    : null;

  // Token type
  const tokenType = token.startsWith('Bot ') ? 'Bot' : 'User';

  return {
    valid       : true,
    tokenType,
    id          : user.id,
    username    : user.username,
    tag         : user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : user.username,
    globalName  : user.global_name || null,
    avatar      : user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
      : `https://cdn.discordapp.com/embed/avatars/${Number(user.id) % 5}.png`,
    email,
    phone       : user.phone ? '•••••••••' : null,
    mfa         : user.mfa_enabled || false,
    verified    : user.verified || false,
    nitro       : NITRO_MAP[nitroType] || 'Aucun',
    nitroType,
    badges      : userBadges,
    flags,
    bot         : user.bot || false,
    system      : user.system || false,
    createdAt   : createdAt.toISOString(),
    createdHuman: moment(createdAt).format('DD/MM/YYYY'),
    accountAge  : moment(createdAt).fromNow(true),
    locale      : user.locale || null,
  };
}

module.exports = { analyzeToken };
