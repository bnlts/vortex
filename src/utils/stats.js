// ============================================================
//  VORTEX — Stats Manager
//  Statistiques + historique par jour pour les graphiques
// ============================================================

const moment = require('moment');

// ── Historique par jour (7 derniers jours) ────────────────
function todayKey() { return moment().format('YYYY-MM-DD'); }

function initDayEntry() {
  return { date: todayKey(), messages: 0, commands: 0, nitro: 0, errors: 0 };
}

// Charge ou initialise l'historique journalier
const dailyHistory = (() => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    days.push({ date: moment().subtract(i, 'days').format('YYYY-MM-DD'), messages: 0, commands: 0, nitro: 0, errors: 0 });
  }
  return days;
})();

function getTodayEntry() {
  const key = todayKey();
  let entry = dailyHistory.find(d => d.date === key);
  if (!entry) {
    entry = initDayEntry();
    dailyHistory.push(entry);
    // Garder seulement les 7 derniers jours
    while (dailyHistory.length > 7) dailyHistory.shift();
  }
  return entry;
}

function incrementDaily(field) {
  const entry = getTodayEntry();
  if (field in entry) entry[field]++;
}

// ── Stats principales ─────────────────────────────────────
const stats = {
  startTime        : Date.now(),
  messagesReceived : 0,
  messagesSent     : 0,
  commandsUsed     : 0,
  nitroSniped      : 0,
  nitroFailed      : 0,
  giveawaysJoined  : 0,
  ghostPings       : 0,
  errorsCount      : 0,

  nitroHistory     : [],
  giveawayHistory  : [],
  deletedMessages  : [],
  editedMessages   : [],
  ghostPingHistory : [],
  commandHistory   : [],
  errors           : [],

  push(list, entry, max = 100) {
    this[list].unshift(entry);
    if (this[list].length > max) this[list].pop();
    if (global.io) global.io.emit('stats_update', this.getSummary());
  },

  increment(key) {
    if (key in this) this[key]++;
    // Sync daily history
    if (key === 'messagesSent' || key === 'messagesReceived') incrementDaily('messages');
    if (key === 'commandsUsed')  incrementDaily('commands');
    if (key === 'nitroSniped')   incrementDaily('nitro');
    if (key === 'errorsCount')   incrementDaily('errors');
    if (global.io) global.io.emit('stats_update', this.getSummary());
  },

  getSummary() {
    return {
      startTime        : this.startTime,
      uptime           : Date.now() - this.startTime,
      messagesReceived : this.messagesReceived,
      messagesSent     : this.messagesSent,
      commandsUsed     : this.commandsUsed,
      nitroSniped      : this.nitroSniped,
      nitroFailed      : this.nitroFailed,
      giveawaysJoined  : this.giveawaysJoined,
      ghostPings       : this.ghostPings,
      errorsCount      : this.errorsCount,
      deletedCount     : this.deletedMessages.length,
      editedCount      : this.editedMessages.length,
    };
  },

  getDailyHistory() { return dailyHistory; },
  getSection(section) { return this[section] || []; },
};

module.exports = stats;
