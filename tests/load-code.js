'use strict';
/*
 * Loads apps-script/Code.gs into a Node vm sandbox with the Google Apps Script
 * service globals stubbed, so the pure helper functions can be unit-tested
 * without the GAS runtime. (Same approach as the upstream kitchen dashboard.)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function pad(n) { return String(n).padStart(2, '0'); }

function loadCode(opts) {
  opts = opts || {};
  const props = opts.scriptProperties || {};
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

  const sandbox = {
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) })
    },
    Session: { getScriptTimeZone: () => opts.timeZone || 'Australia/Sydney' },
    Utilities: {
      // Only the 'yyyy-MM-dd' shape the code uses is needed.
      formatDate: (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    },
    Logger: { log: () => {} },
    console, JSON, Math, Date, RegExp, parseInt, parseFloat, decodeURIComponent
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'Code.gs' });
  return sandbox;
}

module.exports = { loadCode };
