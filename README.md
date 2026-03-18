# ⚡ Komunal Bot

O'zbekiston kommunal to'lovlarini kuzatish uchun Telegram bot. Balanslar, ogohlantirishlar, statistika va Telegram Mini App.

---

## 📦 Texnologiyalar

| Qatlam       | Texnologiya                        |
|--------------|------------------------------------|
| Bot          | Node.js · Telegraf v4              |
| Web server   | Express.js                         |
| Mini App     | HTML · CSS · JavaScript · Chart.js |
| Ma'lumotlar  | JSON fayl (keyinchalik DB ga ko'chirish oson) |
| Scheduler    | node-cron                          |

---

## 📁 Fayl strukturasi

```
komunal-bot/
├── bot.js           ← Asosiy bot mantiqi (Telegraf)
├── server.js        ← Express web server + REST API
├── db.js            ← JSON ma'lumotlar bazasi yordamchisi
├── package.json
├── .env.example     ← Sozlamalar shabloni
├── data/
│   └── users.json   ← Foydalanuvchilar ma'lumotlari
├── miniapp/
│   └── index.html   ← Telegram Mini App (dashboard)
└── README.md
```

---

## 🚀 O'rnatish

### 1. Loyihani klonlash
```bash
git clone <repo-url>
cd komunal-bot
npm install
```

### 2. Muhit o'zgaruvchilari
```bash
cp .env.example .env
```
`.env` faylini oching va to'ldiring:
```env
BOT_TOKEN=7123456789:AAF...          # @BotFather dan olingan token
ADMIN_IDS=123456789                  # Telegram ID (virgul bilan bir nechtasi)
MINI_APP_URL=http://localhost:3000/miniapp   # local test uchun
PORT=3000
```

### 3. Bot tokenini olish
1. Telegramda **@BotFather** ga yozing
2. `/newbot` buyrug'ini yuboring
3. Bot nomi va username kiriting
4. Token nusxalab `.env` ga joylashtiring

### 4. Admin ID ni topish
- Telegramda **@userinfobot** ga `/start` yuboring — u sizning ID ingizni ko'rsatadi
- Yoki **@getidsbot** ishlatishingiz mumkin

---

## ▶️ Ishga tushirish

### Preview (deploy qilmasdan test qilish)

**Terminal 1 — Server (Mini App + API):**
```bash
npm run preview
# yoki: node server.js
```
Brauzerda oching: [http://localhost:3000/miniapp?userId=TEST_USER](http://localhost:3000/miniapp?userId=TEST_USER)

**Terminal 2 — Bot:**
```bash
npm run dev
# yoki: node bot.js
```

### Ikkisini birga ishga tushirish
```bash
npm run both
```

---

## 📱 Telegram Mini App ni sinab ko'rish (local)

Telegram Mini App Telegram ichida HTTPS talab qiladi. Local test uchun **ngrok** ishlatiladi:

```bash
# ngrok o'rnatish (bir marta)
npm install -g ngrok

# Tunnel ochish
ngrok http 3000
```

Ngrok sizga `https://xxxx.ngrok.io` URL beradi.

`.env` da `MINI_APP_URL` ni yangilang:
```env
MINI_APP_URL=https://xxxx.ngrok.io/miniapp
```

Botni qayta ishga tushiring va `📱 Mini App ochish` tugmasini bosing.

---

## 🤖 Bot buyruqlari

### Foydalanuvchi uchun

| Buyruq / Tugma          | Vazifasi                              |
|-------------------------|---------------------------------------|
| `/start`                | Ro'yxatdan o'tish / boshlash          |
| `/cancel`               | Joriy amalni bekor qilish             |
| `/help`                 | Yordam                                |
| 💰 **Balanslarim**      | Barcha kommunallar va balanslar       |
| 📊 **Statistika**       | Jami balans va to'lovlar              |
| ➕ **Komunal qo'shish** | Yangi kommunal ulash                  |
| 🔔 **Bildirishnomalar** | Ogohlantirishlarni yoqish/o'chirish   |
| 📱 **Mini App**         | Vizual dashboard ochish               |

### Admin uchun

| Buyruq           | Vazifasi                                    |
|------------------|---------------------------------------------|
| `/admin`         | Admin panel ko'rsatish                      |
| `/message`       | Barcha foydalanuvchilarga xabar yuborish    |
| `/users`         | Foydalanuvchilar ro'yxati                   |
| `/stats`         | Bot statistikasi                            |
| `/alert`         | Qo'lda past balanslarni tekshirish          |
| `/setadmin <id>` | Yangi admin qo'shish                        |

#### `/message` — Broadcast turlari
Admin `/message` yuborganidan keyin quyidagilardan birini yuborishi mumkin:
- 📝 Matn (HTML teglari qo'llab-quvvatlanadi)
- 🖼️ Rasm (izoh bilan yoki izohsiz)
- 🎬 Video
- 🎥 GIF (animation)
- 📄 Hujjat / fayl

---

## ⚡ Kommunal turlari

| ID         | Nom                | Emoji |
|------------|--------------------|-------|
| `elektr`   | Elektr energiya    | ⚡    |
| `gaz`      | Gaz                | 🔥    |
| `suv`      | Suv                | 💧    |
| `internet` | Internet           | 🌐    |
| `issiqlik` | Issiqlik           | 🌡️   |
| `axlat`    | Axlat yig'ish      | 🗑️   |

---

## 🌐 REST API

Server `http://localhost:3000` da ishlaydi.

| Method | Endpoint                                        | Tavsif                    |
|--------|-------------------------------------------------|---------------------------|
| GET    | `/api/user/:userId`                             | Foydalanuvchi ma'lumotlari|
| POST   | `/api/user/:userId/komunal/:komunalId/balance`  | Balansni yangilash        |
| POST   | `/api/user/:userId/komunal`                     | Yangi kommunal qo'shish   |
| GET    | `/api/user/:userId/payments`                    | To'lovlar tarixi          |
| GET    | `/api/stats`                                    | Bot statistikasi          |
| GET    | `/health`                                       | Server holati             |

### Namuna: balans yangilash
```bash
curl -X POST http://localhost:3000/api/user/123456789/komunal/elektr/balance \
  -H "Content-Type: application/json" \
  -d '{"balance": 75000}'
```

---

## 📊 Ma'lumotlar strukturasi (`data/users.json`)

```json
{
  "users": {
    "123456789": {
      "userId": 123456789,
      "chatId": 123456789,
      "username": "username",
      "firstName": "Ism",
      "phone": "+998901234567",
      "registeredAt": "2025-01-01T00:00:00.000Z",
      "notifications": true,
      "komunallar": {
        "elektr": {
          "id": "elektr",
          "name": "Elektr energiya",
          "emoji": "⚡",
          "balance": 50000,
          "accountId": "1234567890",
          "minAlert": 10000,
          "payments": [
            {
              "amount": 45000,
              "balance": 50000,
              "date": "2025-01-15T10:30:00.000Z",
              "type": "topup",
              "description": "Bot orqali yangilandi"
            }
          ],
          "addedAt": "2025-01-01T00:00:00.000Z"
        }
      }
    }
  },
  "admins": [123456789]
}
```

---

## 🔔 Avtomatik ogohlantirishlar

Bot har kuni **soat 09:00** da (Toshkent vaqti) barcha foydalanuvchilarning balanslarini tekshiradi.

Agar birorta kommunal `minAlert` chegarasidan past bo'lsa — foydalanuvchiga Telegram xabar yuboriladi.

Bildirishnomalar `🔔 Bildirishnomalar` tugmasi orqali o'chirib/yoqish mumkin.

---

## 🚢 Deploy qilish

### Railway (tavsiya)
```bash
# railway.app da account oching
npm install -g @railway/cli
railway login
railway init
railway up
```

Muhit o'zgaruvchilarini Railway dashboard orqali qo'ying.

### VPS (Ubuntu)
```bash
# PM2 o'rnatish
npm install -g pm2

# Bot va serverni ishga tushirish
pm2 start bot.js --name komunal-bot
pm2 start server.js --name komunal-server
pm2 save
pm2 startup
```

### Render.com
1. GitHub ga push qiling
2. render.com da "Web Service" yarating
3. Build command: `npm install`
4. Start command: `node server.js`
5. Alohida "Background Worker" sifatida `node bot.js` ni ham qo'ying
6. Muhit o'zgaruvchilarini qo'ying

---

## 🔮 Kelajakdagi rejalar

- [ ] **To'lov tizimi** — Click / Payme / Uzum orqali to'g'ridan-to'g'ri to'lash
- [ ] **Real vaqt sinxronizatsiya** — kommunal provayderlar API bilan ulanish
- [ ] **PostgreSQL / MongoDB** — JSON fayldan real bazaga ko'chirish
- [ ] **Chek scanner** — to'lov chekini skanerlash va balansni auto yangilash
- [ ] **Oilaviy hisob** — bir oilaning barcha a'zolari uchun umumiy dashboard
- [ ] **Eksport** — Excel / PDF hisobot yuklash
- [ ] **Web admin panel** — bot boshqaruvi uchun alohida web interfeys

---

## 🛠️ Muammolar va yechimlar

**"Bot javob bermayapti"**
→ `.env` da `BOT_TOKEN` to'g'ri ekanligini tekshiring

**"Mini App yuklanmayapti"**
→ `node server.js` ishlab turganligini tekshiring

**"Mini App Telegram ichida ishlamayapti"**
→ `MINI_APP_URL` HTTPS bo'lishi kerak. ngrok ishlatib ko'ring.

**"Admin buyruqlari ishlamayapti"**
→ `.env` da `ADMIN_IDS` ga o'z Telegram ID ingizni yozing

---

## 📄 Litsenziya

MIT — erkin foydalaning, o'zgartiring, tarqating.
