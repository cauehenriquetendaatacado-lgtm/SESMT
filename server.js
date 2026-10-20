'use strict';
const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const path = require('path');
const { createPgStore, createFileStore } = require('./store');

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const DAYS = 30;

if (!APP_PASSWORD) {
  // O app tem dados pessoais (nomes e chapas): nunca sobe sem senha.
  console.error('ERRO: defina a variável de ambiente APP_PASSWORD (senha de acesso ao dashboard).');
  process.exit(1);
}
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('sesmt:' + APP_PASSWORD).digest('hex');

/* ---------- sessão por cookie assinado ---------- */
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const makeToken = () => { const exp = String(Date.now() + DAYS * 864e5); return exp + '.' + sign(exp); };
function validToken(tok) {
  if (!tok || !tok.includes('.')) return false;
  const [exp, sig] = tok.split('.');
  const good = Buffer.from(sign(exp)), got = Buffer.from(sig || '');
  return good.length === got.length && crypto.timingSafeEqual(good, got) && Number(exp) > Date.now();
}
const cookieOf = (req, name) => {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
};
const setCookie = (req, res, val, maxAge) =>
  res.setHeader('Set-Cookie', `sesmt_sess=${encodeURIComponent(val)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}` + (req.secure ? '; Secure' : ''));
const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

/* limite simples de tentativas de login por IP */
const tries = new Map();
function blocked(ip) {
  const t = tries.get(ip);
  if (!t || Date.now() - t.t > 10 * 60e3) return false;
  return t.n >= 8;
}
function fail(ip) {
  const t = tries.get(ip);
  if (!t || Date.now() - t.t > 10 * 60e3) tries.set(ip, { n: 1, t: Date.now() });
  else t.n++;
}

/* ---------- armazenamento ---------- */
let store;
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const url = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    keepAlive: true,
  });
  pool.on('error', (e) => console.error('pg idle client error:', e.message)); // Neon derruba conexões ociosas
  store = createPgStore(pool);
} else {
  store = createFileStore(path.join(__dirname, 'data.json'));
}

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// arquivos públicos (necessários para instalar o app antes/depois do login)
app.get('/sw.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('application/javascript').sendFile(path.join(__dirname, 'public', 'sw.js'));
});
app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '7d' }));

/* login */
const loginPage = (msg) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar – Dashboard SESMT</title>
<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#1f3a6e">
<link rel="icon" type="image/png" href="/icons/icon-192.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6fa;font:15px system-ui,sans-serif;color:#1b2433}
form{background:#fff;border:1px solid #e1e6ee;border-radius:12px;padding:28px;width:min(340px,88vw);box-shadow:0 4px 18px #0001}
h1{font-size:18px;margin:0 0 4px;color:#1f3a6e}p{margin:0 0 16px;color:#6b778c;font-size:13px}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cfd6e2;border-radius:8px;font-size:15px}
button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#e8590c;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
.e{color:#e03131;font-size:13px;margin-top:10px}
@media(prefers-color-scheme:dark){body{background:#0f1520;color:#e8edf5}form{background:#18212f;border-color:#2a3649}input{background:#0f1520;color:#e8edf5;border-color:#2a3649}}</style></head>
<body><form method="post" action="/login"><img src="/icons/logo-tenda.png" alt="Tenda Atacado" style="display:block;height:64px;margin:0 auto 14px;border-radius:8px"><h1>Dashboard SESMT</h1><p>Tenda Atacado · acesso restrito</p>
<input type="password" name="senha" placeholder="Senha" autofocus autocomplete="current-password" required>
<button>Entrar</button>${msg ? `<div class="e">${msg}</div>` : ''}</form></body></html>`;

app.get('/login', (req, res) => {
  if (validToken(cookieOf(req, 'sesmt_sess'))) return res.redirect('/');
  res.setHeader('Cache-Control', 'no-store');
  res.send(loginPage(''));
});
app.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
  const ip = req.ip;
  if (blocked(ip)) return res.status(429).send(loginPage('Muitas tentativas. Aguarde alguns minutos.'));
  if (same(req.body.senha || '', APP_PASSWORD)) {
    tries.delete(ip);
    setCookie(req, res, makeToken(), DAYS * 86400);
    return res.redirect('/');
  }
  fail(ip);
  res.status(401).send(loginPage('Senha incorreta.'));
});
app.post('/logout', (req, res) => { setCookie(req, res, '', 0); res.json({ ok: true }); });

/* tudo daqui para baixo exige sessão */
app.use((req, res, next) => {
  if (validToken(cookieOf(req, 'sesmt_sess'))) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'não autenticado' });
  res.redirect('/login');
});

app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

/* API de estado: chave "sesmt*" -> JSON */
const KEY = /^sesmt[A-Za-z0-9_]{0,60}$/;
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'erro no servidor' }); });

app.get('/api/meta', wrap(async (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(await store.meta()); }));
app.get('/api/state/:key', wrap(async (req, res) => {
  if (!KEY.test(req.params.key)) return res.status(400).json({ error: 'chave inválida' });
  const r = await store.get(req.params.key);
  if (!r) return res.status(404).json({ error: 'não encontrado' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(r);
}));
app.put('/api/state/:key', express.json({ limit: '40mb' }), wrap(async (req, res) => {
  if (!KEY.test(req.params.key)) return res.status(400).json({ error: 'chave inválida' });
  if (!req.body || !('value' in req.body)) return res.status(400).json({ error: 'sem value' });
  res.json({ updated_at: await store.put(req.params.key, req.body.value) });
}));

/* migração única: traz os dados que estavam só no navegador (arquivo antigo) para o servidor */
app.get('/migrar', (_req, res) => res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Migrar dados</title>
<style>body{font:15px system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1b2433}
code,textarea{font:12px monospace}textarea{width:100%;height:160px}pre{background:#f1f3f7;padding:10px;border-radius:8px;overflow:auto;white-space:pre-wrap}
button{padding:9px 16px;border:0;border-radius:8px;background:#e8590c;color:#fff;font-weight:600;cursor:pointer}</style></head><body>
<h2>Migrar dados do arquivo antigo</h2>
<p>1) Abra o <b>dashboard antigo</b> (o .html que você usava) no mesmo navegador de sempre, aperte <b>F12</b> → aba <b>Console</b>, cole o código abaixo e dê Enter. Ele copia seus dados para a área de transferência:</p>
<pre id="snip">copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('sesmt')).map(k=>[k,JSON.parse(localStorage.getItem(k))]))))</pre>
<p>2) Cole aqui o resultado (Ctrl+V) e envie. Isto <b>substitui</b> no servidor as chaves coladas.</p>
<textarea id="t" placeholder="Cole o JSON aqui"></textarea><p><button onclick="go()">Enviar para o servidor</button> <span id="s"></span></p>
<p><a href="/">← voltar ao dashboard</a></p>
<script>async function go(){const s=document.getElementById('s');let o;try{o=JSON.parse(document.getElementById('t').value)}catch(e){s.textContent='JSON inválido.';return}
let n=0;for(const k of Object.keys(o)){if(!/^sesmt[A-Za-z0-9_]{0,60}$/.test(k))continue;const r=await fetch('/api/state/'+k,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:o[k]})});if(!r.ok){s.textContent='Falhou em '+k+' (HTTP '+r.status+').';return}n++}
s.textContent=n+' item(ns) enviados. Abra o dashboard para conferir.'}</script></body></html>`));

store.init().then(() => {
  app.listen(PORT, () => console.log(`Dashboard SESMT na porta ${PORT} · armazenamento: ${store.kind}`));
}).catch((e) => { console.error('Falha ao iniciar o armazenamento:', e); process.exit(1); });
