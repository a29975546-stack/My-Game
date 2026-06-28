import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = Number(process.env.PORT || 3000);
const SUPPORT_URL = process.env.SUPPORT_URL || '';
const DATA_FILE = new URL('./data.json', import.meta.url);

if (!BOT_TOKEN) console.warn('BOT_TOKEN is missing. Fill tg/.env before running payments.');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PRODUCTS = {
  skip_level_1: { title: 'Пропуск уровня', description: 'Мгновенно пройти сложный уровень', amount: 15, grant: { skipTokens: 1 } },
  skip_level_3: { title: '3 пропуска уровня', description: 'Три полезных пропуска для сложных уровней', amount: 39, grant: { skipTokens: 3 } },
  revive_1: { title: 'Спасение', description: 'Продолжить попытку без проигрыша', amount: 10, grant: { revives: 1 } },
  premium_30d: { title: 'Premium на 30 дней', description: 'Без рекламы + ежедневный бонус', amount: 149, grant: { premiumDays: 30 } },
};

function emptyDb() {
  return { users: {}, orders: {}, leaderboard: [] };
}

function readDb() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return emptyDb(); }
}

function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function verifyInitData(initData) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN_MISSING');
  if (!initData) throw new Error('INIT_DATA_MISSING');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('HASH_MISSING');
  params.delete('hash');
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hash, 'hex'))) throw new Error('BAD_INIT_DATA');
  const authDate = Number(params.get('auth_date') || 0) * 1000;
  if (!authDate || Date.now() - authDate > 2 * 24 * 60 * 60 * 1000) throw new Error('INIT_DATA_EXPIRED');
  const user = JSON.parse(params.get('user') || '{}');
  if (!user.id) throw new Error('USER_MISSING');
  return user;
}

function getUser(db, user) {
  const id = String(user.id);
  db.users[id] ||= {
    userId: user.id,
    username: user.username || '',
    firstName: user.first_name || '',
    premiumUntil: 0,
    skipTokens: 0,
    revives: 0,
    coins: 0,
    invitedBy: null,
    referrals: 0,
    bestScore: 0,
    lastDaily: '',
    purchases: [],
  };
  db.users[id].username = user.username || db.users[id].username;
  db.users[id].firstName = user.first_name || db.users[id].firstName;
  return db.users[id];
}

function applyGrant(profile, grant) {
  if (grant.skipTokens) profile.skipTokens += grant.skipTokens;
  if (grant.revives) profile.revives += grant.revives;
  if (grant.premiumDays) profile.premiumUntil = Math.max(Date.now(), profile.premiumUntil || 0) + grant.premiumDays * 86400000;
}

async function tgApi(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || method);
  return data.result;
}

app.get('/health', (_, res) => res.json({ ok: true }));

app.post('/api/me', (req, res) => {
  try {
    const user = verifyInitData(req.body.initData);
    const db = readDb();
    const profile = getUser(db, user);
    const startParam = String(req.body.startParam || '');
    if (!profile.invitedBy && startParam.startsWith('ref_')) {
      const inviterId = startParam.slice(4);
      if (inviterId && inviterId !== String(user.id) && db.users[inviterId]) {
        profile.invitedBy = inviterId;
        profile.coins += 100;
        db.users[inviterId].coins += 150;
        db.users[inviterId].referrals += 1;
      }
    }
    writeDb(db);
    res.json(profile);
  } catch (err) { res.status(401).json({ error: err.message }); }
});

app.post('/api/create-invoice', async (req, res) => {
  try {
    const user = verifyInitData(req.body.initData);
    const product = PRODUCTS[req.body.productId];
    if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
    const db = readDb();
    getUser(db, user);
    const orderId = crypto.randomUUID();
    const payload = `${req.body.productId}:${user.id}:${orderId}`;
    db.orders[orderId] = { orderId, userId: user.id, productId: req.body.productId, payload, paid: false, createdAt: Date.now() };
    writeDb(db);
    const invoiceLink = await tgApi('createInvoiceLink', {
      title: product.title,
      description: product.description,
      payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: product.title, amount: product.amount }],
    });
    res.json({ invoiceLink });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/consume-skip', (req, res) => {
  try {
    const user = verifyInitData(req.body.initData);
    const db = readDb();
    const profile = getUser(db, user);
    if (profile.skipTokens <= 0) return res.status(400).json({ ok: false, error: 'NO_SKIP_TOKENS' });
    profile.skipTokens -= 1;
    writeDb(db);
    res.json({ ok: true, skipTokens: profile.skipTokens });
  } catch (err) { res.status(401).json({ error: err.message }); }
});

app.post('/api/claim-daily', (req, res) => {
  try {
    const user = verifyInitData(req.body.initData);
    const db = readDb();
    const profile = getUser(db, user);
    if (Date.now() > Number(profile.premiumUntil || 0)) return res.status(403).json({ error: 'PREMIUM_REQUIRED' });
    const today = new Date().toISOString().slice(0, 10);
    if (profile.lastDaily === today) return res.status(400).json({ error: 'ALREADY_CLAIMED' });
    profile.lastDaily = today;
    profile.coins += 250;
    writeDb(db);
    res.json({ ok: true, coins: 250, totalCoins: profile.coins });
  } catch (err) { res.status(401).json({ error: err.message }); }
});

app.post('/api/score', (req, res) => {
  try {
    const user = verifyInitData(req.body.initData);
    const score = Math.max(0, Math.floor(Number(req.body.score || 0)));
    const db = readDb();
    const profile = getUser(db, user);
    profile.bestScore = Math.max(profile.bestScore || 0, score);
    db.leaderboard = Object.values(db.users).map(u => ({ userId: u.userId, username: u.username, firstName: u.firstName, bestScore: u.bestScore || 0 })).sort((a, b) => b.bestScore - a.bestScore).slice(0, 50);
    writeDb(db);
    res.json({ ok: true, bestScore: profile.bestScore });
  } catch (err) { res.status(401).json({ error: err.message }); }
});

app.get('/api/leaderboard', (_, res) => {
  const db = readDb();
  res.json({ items: (db.leaderboard || []).slice(0, 20) });
});

app.post('/telegram/webhook', async (req, res) => {
  res.json({ ok: true });
  const update = req.body;
  try {
    if (update.pre_checkout_query) {
      await tgApi('answerPreCheckoutQuery', { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
      return;
    }
    const payment = update.message?.successful_payment;
    if (!payment) return;
    const [productId, userId, orderId] = String(payment.invoice_payload || '').split(':');
    const product = PRODUCTS[productId];
    if (!product) return;
    const db = readDb();
    const profile = getUser(db, { id: userId });
    if (db.orders[orderId]?.paid) return;
    db.orders[orderId] ||= { orderId, userId, productId };
    db.orders[orderId].paid = true;
    db.orders[orderId].chargeId = payment.telegram_payment_charge_id;
    db.orders[orderId].paidAt = Date.now();
    applyGrant(profile, product.grant);
    profile.purchases.push({ productId, orderId, at: Date.now(), chargeId: payment.telegram_payment_charge_id });
    writeDb(db);
  } catch (err) { console.error('webhook error', err); }
});

app.post('/telegram/set-webhook', async (_, res) => {
  try {
    const publicUrl = process.env.PUBLIC_URL;
    if (!publicUrl) throw new Error('PUBLIC_URL_MISSING');
    const result = await tgApi('setWebhook', { url: `${publicUrl.replace(/\/$/, '')}/telegram/webhook` });
    res.json({ ok: true, result });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/telegram/command', async (req, res) => {
  res.json({ ok: true });
  const msg = req.body.message;
  if (!msg?.text || !msg.chat?.id) return;
  if (msg.text.startsWith('/support') || msg.text.startsWith('/paysupport')) {
    await tgApi('sendMessage', { chat_id: msg.chat.id, text: SUPPORT_URL ? `Поддержка: ${SUPPORT_URL}` : 'Напиши владельцу бота для поддержки покупок.' });
  }
});

app.listen(PORT, () => console.log(`Telegram monetization server running on ${PORT}`));
