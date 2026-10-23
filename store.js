'use strict';
const fs = require('fs');

/* Armazenamento chave-valor (jsonb). Dois backends com a mesma interface:
   - Postgres (Neon) quando DATABASE_URL existe
   - arquivo data.json para testar localmente */

function createPgStore(pool) {
  const iso = (d) => new Date(d).toISOString();
  return {
    kind: 'postgres',
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS sesmt_kv (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    },
    async meta() {
      const { rows } = await pool.query('SELECT key, updated_at FROM sesmt_kv');
      const out = {};
      rows.forEach((r) => (out[r.key] = iso(r.updated_at)));
      return out;
    },
    async get(key) {
      const { rows } = await pool.query('SELECT value, updated_at FROM sesmt_kv WHERE key = $1', [key]);
      return rows[0] ? { value: rows[0].value, updated_at: iso(rows[0].updated_at) } : null;
    },
    async put(key, value) {
      const { rows } = await pool.query(
        `INSERT INTO sesmt_kv (key, value, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
         RETURNING updated_at`,
        [key, JSON.stringify(value)]
      );
      return iso(rows[0].updated_at);
    },
  };
}

function createFileStore(file) {
  let db = {};
  let last = 0;
  const save = () => fs.writeFileSync(file, JSON.stringify(db));
  return {
    kind: 'arquivo (' + file + ')',
    async init() {
      try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { db = {}; }
    },
    async meta() {
      const out = {};
      for (const k in db) out[k] = db[k].updated_at;
      return out;
    },
    async get(key) { return db[key] || null; },
    async put(key, value) {
      last = Math.max(Date.now(), last + 1); // sempre crescente
      const updated_at = new Date(last).toISOString();
      db[key] = { value, updated_at };
      save();
      return updated_at;
    },
  };
}

module.exports = { createPgStore, createFileStore };
