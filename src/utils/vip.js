// ============================================================
//  VORTEX — VIP & Blacklist Manager
//  Fichier chiffré AES-256 — store.dat
//  Contenu illisible sans la clé secrète
// ============================================================
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Clé de chiffrement hardcodée ─────────────────────────
// 32 bytes pour AES-256 — NE PAS MODIFIER après première utilisation
const CIPHER_KEY = crypto
  .createHash('sha256')
  .update('VORTEX_SECRET_KEY_DO_NOT_TOUCH_v2')
  .digest(); // 32 bytes

const STORE_PATH = path.join(__dirname, '../../store.dat');

// ── Chiffrement / Déchiffrement ───────────────────────────
function encrypt(obj) {
  const iv         = crypto.randomBytes(16);
  const cipher     = crypto.createCipheriv('aes-256-cbc', CIPHER_KEY, iv);
  const json       = JSON.stringify(obj);
  const encrypted  = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  // Format: iv(hex):data(hex)
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(raw) {
  const [ivHex, dataHex] = raw.split(':');
  const iv        = Buffer.from(ivHex, 'hex');
  const data      = Buffer.from(dataHex, 'hex');
  const decipher  = crypto.createDecipheriv('aes-256-cbc', CIPHER_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// ── Lecture / Écriture ────────────────────────────────────
function load() {
  if (!fs.existsSync(STORE_PATH)) {
    const def = { keys: [], blacklist: [] };
    fs.writeFileSync(STORE_PATH, encrypt(def));
    return def;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return decrypt(raw);
  } catch {
    // Fichier corrompu ou modifié — reset
    const def = { keys: [], blacklist: [] };
    fs.writeFileSync(STORE_PATH, encrypt(def));
    return def;
  }
}

function save(data) {
  fs.writeFileSync(STORE_PATH, encrypt(data));
}

// ── Génération de clé ─────────────────────────────────────
function generateKey() {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `VORTEX-${seg()}-${seg()}-${seg()}`;
}

const VipManager = {

  // ── Clés VIP ─────────────────────────────────────────────
  createKey(label = '', durationDays = 30) {
    const data  = load();
    const key   = generateKey();
    const entry = {
      key,
      label      : label || 'Sans nom',
      createdAt  : new Date().toISOString(),
      expiresAt  : durationDays > 0
        ? new Date(Date.now() + durationDays * 86400000).toISOString()
        : null, // null = permanent
      activatedBy : null,
      activatedAt : null,
      used        : false,
    };
    data.keys.push(entry);
    save(data);
    return entry;
  },

  activateKey(key, userId) {
    const data  = load();
    const entry = data.keys.find(k => k.key === key);
    if (!entry)     return { ok: false, error: 'Clé invalide' };
    if (entry.used) return { ok: false, error: 'Clé déjà utilisée' };
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date())
                    return { ok: false, error: 'Clé expirée' };
    entry.used        = true;
    entry.activatedBy = userId;
    entry.activatedAt = new Date().toISOString();
    save(data);
    return { ok: true, entry };
  },

  revokeKey(key) {
    const data = load();
    const idx  = data.keys.findIndex(k => k.key === key);
    if (idx === -1) return false;
    data.keys.splice(idx, 1);
    save(data);
    return true;
  },

  listKeys() {
    return load().keys.map(k => ({
      ...k,
      permanent : !k.expiresAt,
      expired   : k.expiresAt ? new Date(k.expiresAt) < new Date() : false,
      daysLeft  : k.expiresAt
        ? Math.max(0, Math.ceil((new Date(k.expiresAt) - Date.now()) / 86400000))
        : null,
    }));
  },

  isOwner(userId) {
    try {
      const p = require('path').join(__dirname, '../../owner.txt');
      if (!require('fs').existsSync(p)) return false;
      const ownerId = require('fs').readFileSync(p, 'utf8').trim();
      return userId === ownerId;
    } catch { return false; }
  },

  isVip(userId) {
    // Le owner a toujours accès VIP sans clé
    if (this.isOwner(userId)) return true;
    const data = load();
    return data.keys.some(k =>
      k.used &&
      k.activatedBy === userId &&
      (!k.expiresAt || new Date(k.expiresAt) > new Date())
    );
  },

  getVipInfo(userId) {
    const data  = load();
    const entry = data.keys.find(k => k.used && k.activatedBy === userId);
    if (!entry) return null;
    return {
      ...entry,
      permanent : !entry.expiresAt,
      expired   : entry.expiresAt ? new Date(entry.expiresAt) < new Date() : false,
      daysLeft  : entry.expiresAt
        ? Math.max(0, Math.ceil((new Date(entry.expiresAt) - Date.now()) / 86400000))
        : null,
    };
  },

  // ── Blacklist ─────────────────────────────────────────────
  blacklist(userId, reason = '') {
    const data = load();
    if (!data.blacklist.find(b => b.id === userId)) {
      data.blacklist.push({ id: userId, reason, addedAt: new Date().toISOString() });
      save(data);
    }
  },

  unblacklist(userId) {
    const data = load();
    data.blacklist = data.blacklist.filter(b => b.id !== userId);
    save(data);
  },

  isBlacklisted(userId) {
    return load().blacklist.some(b => b.id === userId);
  },

  listBlacklist() {
    return load().blacklist;
  },

  getAll() { return load(); },
};

module.exports = VipManager;
