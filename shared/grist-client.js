/**
 * Grist AppStore — Client HTTP & API Grist
 * Primitives : transport HTTP (Capacitor/fetch), détection contexte, CRUD Grist
 */

// ─── Détection du contexte d'exécution ───
const IS_CAP   = !!(window.Capacitor?.Plugins?.CapacitorHttp);
const IN_GRIST = typeof grist !== 'undefined' && window.self !== window.top;

// ─── Transport HTTP (Capacitor natif / fetch standard) ───
async function apiFetch(url, opts = {}) {
  if (IS_CAP) {
    const method = opts.method || 'GET';
    let data;
    if (opts.body) { try { data = JSON.parse(opts.body); } catch(_) { data = opts.body; } }
    const r = await window.Capacitor.Plugins.CapacitorHttp.request({
      url, method, headers: opts.headers || {}, data
    });
    const ok = r.status >= 200 && r.status < 400;
    return {
      ok, status: r.status,
      json: async () => r.data,
      text: async () => typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
    };
  }
  return fetch(url, opts);
}

async function apiFormFetch(url, formData, headers = {}) {
  return fetch(url, { method: 'POST', headers, body: formData });
}

// ─── Client Grist (dual-mode : widget natif / REST API) ───
class GristClient {
  constructor(conn = {}) {
    this.url    = (conn.url || '').replace(/\/+$/, '');
    this.apiKey = conn.apiKey || '';
    this.docId  = conn.docId || '';
  }

  update(conn) {
    if (conn.url    != null) this.url    = conn.url.replace(/\/+$/, '');
    if (conn.apiKey != null) this.apiKey = conn.apiKey;
    if (conn.docId  != null) this.docId  = conn.docId;
  }

  get configured() { return !!(this.url && this.apiKey && this.docId); }
  get baseUrl()    { return this.url + '/api'; }
  get headers()    { return { 'Authorization': 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' }; }

  async test() {
    if (!this.configured) return false;
    try {
      const r = await apiFetch(this.baseUrl + '/docs/' + this.docId + '/tables', { headers: this.headers });
      return r.ok;
    } catch(_) { return false; }
  }

  async listTables() {
    if (IN_GRIST) return await grist.docApi.listTables();
    const r = await apiFetch(this.baseUrl + '/docs/' + this.docId + '/tables', { headers: this.headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()).tables?.map(t => t.id) || [];
  }

  async listColumns(tableId) {
    if (IN_GRIST) {
      const d = await grist.docApi.fetchTable(tableId);
      return Object.keys(d).filter(k => !k.startsWith('_') && k !== 'id' && k !== 'manualSort');
    }
    const r = await apiFetch(
      this.baseUrl + '/docs/' + this.docId + '/tables/' + tableId + '/columns',
      { headers: this.headers }
    );
    const d = await r.json();
    return (d.columns || []).map(c => c.id).filter(id => id !== 'manualSort');
  }

  async ensureTable(tableId, fields, widgetOptions) {
    try {
      const tables = await this.listTables();
      if (tables.includes(tableId)) return 'exists';

      if (IN_GRIST) {
        const colDefs = fields.map(f => {
          const col = { id: f.id, type: f.type, label: f.label };
          if (widgetOptions && widgetOptions[f.id]) {
            col.widgetOptions = JSON.stringify(widgetOptions[f.id]);
          }
          return col;
        });
        await grist.docApi.applyUserActions([['AddTable', tableId, colDefs]]);
      } else {
        const columns = fields.map(f => ({ id: f.id, fields: { label: f.label, type: f.type } }));
        const r = await apiFetch(
          this.baseUrl + '/docs/' + this.docId + '/tables',
          { method: 'POST', headers: this.headers, body: JSON.stringify({ tables: [{ id: tableId, columns }] }) }
        );
        if (!r.ok) throw new Error('HTTP ' + r.status);
      }
      return 'created';
    } catch(e) {
      console.warn('ensureTable error:', e);
      return 'error';
    }
  }

  async pushRecords(tableId, records) {
    if (!records.length) return true;
    const body = { records: records.map(r => ({ fields: r.fields || r })) };
    const r = await apiFetch(
      this.baseUrl + '/docs/' + this.docId + '/tables/' + tableId + '/records',
      { method: 'POST', headers: this.headers, body: JSON.stringify(body) }
    );
    return r.ok;
  }

  async updateRecords(tableId, records) {
    if (!records.length) return true;
    const body = { records: records.map(r => ({ id: r.id, fields: r.fields })) };
    const r = await apiFetch(
      this.baseUrl + '/docs/' + this.docId + '/tables/' + tableId + '/records',
      { method: 'PATCH', headers: this.headers, body: JSON.stringify(body) }
    );
    return r.ok;
  }

  async fetchRecords(tableId, options = {}) {
    let url = this.baseUrl + '/docs/' + this.docId + '/tables/' + tableId + '/records';
    const params = [];
    if (options.filter) params.push('filter=' + encodeURIComponent(JSON.stringify(options.filter)));
    if (options.sort)   params.push('sort=' + encodeURIComponent(options.sort));
    if (options.limit)  params.push('limit=' + options.limit);
    if (params.length)  url += '?' + params.join('&');
    const r = await apiFetch(url, { headers: this.headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    return d.records || [];
  }

  async uploadAttachment(tableId, recordId, colId, file) {
    const form = new FormData();
    form.append('upload', file);
    const r = await apiFormFetch(
      this.baseUrl + '/docs/' + this.docId + '/attachments',
      form, { 'Authorization': 'Bearer ' + this.apiKey }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const attId = data[0];
    await this.updateRecords(tableId, [{ id: recordId, fields: { [colId]: ['L', attId] } }]);
    return attId;
  }
}
