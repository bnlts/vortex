const fs   = require('fs');
const path = require('path');

const CONFIG_PATH  = path.join(__dirname, '../../config.json');
const SECRETS_PATH = path.join(__dirname, '../../secrets.json');

const ConfigManager = {
  get() { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); },

  save(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    if (global.io) global.io.emit('config_updated', ConfigManager.getSafe());
  },

  getSecrets() {
    if (!fs.existsSync(SECRETS_PATH)) {
      const def = { token: '', password: '', configured: false };
      fs.writeFileSync(SECRETS_PATH, JSON.stringify(def, null, 2));
      return def;
    }
    return JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));
  },

  saveSecrets(data) {
    fs.writeFileSync(SECRETS_PATH, JSON.stringify({ ...ConfigManager.getSecrets(), ...data }, null, 2));
  },

  getToken()  { return ConfigManager.getSecrets().token || ''; },
  saveToken(t){ ConfigManager.saveSecrets({ token: t.trim(), configured: true }); },

  hasToken()    { return ConfigManager.getToken().length > 20; },
  hasPassword() { const s = ConfigManager.getSecrets(); return s.password?.length > 0; },
  isConfigured(){ return ConfigManager.hasToken() && ConfigManager.hasPassword(); },

  savePassword(pw) { ConfigManager.saveSecrets({ password: pw.trim() }); },
  checkPassword(pw){ return ConfigManager.getSecrets().password === pw.trim(); },

  updateModule(name, data) {
    const c = ConfigManager.get();
    c.modules[name] = { ...c.modules[name], ...data };
    ConfigManager.save(c); return c.modules[name];
  },
  updatePrefix(p)  { const c = ConfigManager.get(); c.prefix = p; ConfigManager.save(c); },
  addCustomCommand(n, r) { const c = ConfigManager.get(); c.customCommands[n.toLowerCase()] = r; ConfigManager.save(c); },
  deleteCustomCommand(n) { const c = ConfigManager.get(); delete c.customCommands[n.toLowerCase()]; ConfigManager.save(c); },
  blacklistUser(id)   { const c = ConfigManager.get(); if(!c.blacklist.users.includes(id)){ c.blacklist.users.push(id); ConfigManager.save(c); } },
  unblacklistUser(id) { const c = ConfigManager.get(); c.blacklist.users = c.blacklist.users.filter(u=>u!==id); ConfigManager.save(c); },
  getSafe()        { return ConfigManager.get(); },
  isBlacklisted(id){ return ConfigManager.get().blacklist.users.includes(id); },
};

module.exports = ConfigManager;
