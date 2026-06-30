/* public/app.js — tiny API client + shared front-end helpers. */
'use strict';

const Api = {
  async req(path, opts) {
    opts = opts || {};
    const res = await fetch('/api' + path, Object.assign({
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    }, opts));
    // Any protected call that 401s means the session expired -> back to login.
    if (res.status === 401) { location.href = 'login.html'; throw new Error('unauthenticated'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'error'), { status: res.status, data });
    return data;
  },
  get(p) { return this.req(p); },
  post(p, body) { return this.req(p, { method: 'POST', body: JSON.stringify(body || {}) }); },
  del(p) { return this.req(p, { method: 'DELETE' }); }
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Pretty labels for the pipeline stages.
const STAGE_LABEL = {
  check_measure: 'Check-measure', drafting: 'Drafting', review: 'Review',
  client_signoff: 'Client sign-off', production: 'Production', install: 'Install',
  maintenance: 'Maintenance', complete: 'Complete'
};
const STAGE_ORDER = ['check_measure', 'drafting', 'review', 'client_signoff', 'production', 'install', 'maintenance', 'complete'];
// Fallback colour when a job has no assignee to colour by.
const STAGE_COLOR = {
  check_measure: '#6b7280', drafting: '#4a86e8', review: '#a142f4', client_signoff: '#7c3aed',
  production: '#e8710a', install: '#0f9d9d', maintenance: '#34a853', complete: '#9aa0aa'
};

async function logout() {
  try { await Api.post('/auth/logout'); } catch (_) {}
  location.href = 'login.html';
}
