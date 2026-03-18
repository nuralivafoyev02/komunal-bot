const fs   = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data', 'users.json');
const DEFAULT   = { users: {}, admins: [] };

// ── Read / Write ──────────────────────────────────────────────────────────────

function read() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
      write(DEFAULT);
      return structuredClone(DEFAULT);
    }
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return structuredClone(DEFAULT);
  }
}

function write(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// ── Users ─────────────────────────────────────────────────────────────────────

function getUser(id) {
  return read().users[String(id)] || null;
}

function saveUser(id, user) {
  const db = read();
  db.users[String(id)] = user;
  write(db);
}

function getAllUsers() {
  return read().users;
}

// ── Admins ────────────────────────────────────────────────────────────────────

function isAdmin(id) {
  const db      = read();
  const envList = (process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  return db.admins.includes(Number(id)) || envList.includes(String(id));
}

function addAdmin(id) {
  const db = read();
  if (!db.admins.includes(Number(id))) {
    db.admins.push(Number(id));
    write(db);
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function getStats() {
  const users = Object.values(read().users);
  const totalBalance = users.reduce((acc, u) => {
    return acc + Object.values(u.komunallar || {}).reduce((s, k) => s + Number(k.balance || 0), 0);
  }, 0);

  return {
    total:           users.length,
    withPhone:       users.filter(u => u.phone).length,
    komunalCount:    users.reduce((a, u) => a + Object.keys(u.komunallar || {}).length, 0),
    notificationsOn: users.filter(u => u.notifications !== false).length,
    totalBalance
  };
}

// ── Payments Helper ───────────────────────────────────────────────────────────

function addPayment(userId, komunalId, amount, oldBalance, newBalance, source = 'bot') {
  const user = getUser(userId);
  if (!user || !user.komunallar?.[komunalId]) return false;

  user.komunallar[komunalId].balance = newBalance;
  if (!user.komunallar[komunalId].payments) user.komunallar[komunalId].payments = [];

  user.komunallar[komunalId].payments.push({
    amount:      Math.abs(amount),
    balance:     newBalance,
    date:        new Date().toISOString(),
    type:        newBalance > oldBalance ? 'topup' : 'charge',
    description: `${source} orqali yangilandi`
  });

  saveUser(userId, user);
  return true;
}

module.exports = { read, write, getUser, saveUser, getAllUsers, isAdmin, addAdmin, getStats, addPayment };
