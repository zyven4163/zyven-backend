const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const users = {}; // Stores user info, limits, status
let globalShutdown = false;

const ADMIN_EMAIL = 'zyven4163@gmail.com';

// Root route
app.get('/', (req, res) => {
  res.json({ status: 'Zyven Backend is running successfully!' });
});

// 1. Direct Login / Bypass OTP (Instantly logs in using TikTok username & email)
app.post('/api/send-otp', async (req, res) => {
  const { email, username } = req.body;
  if (!email || !username) {
    return res.status(400).json({ message: 'Email and TikTok username required' });
  }

  // Register or fetch user immediately without sending an email
  if (!users[email]) {
    users[email] = {
      id: email,
      email,
      username: username || 'User',
      dailyLimit: 5,
      usedToday: 0,
      banned: false,
      kickedUntil: null
    };
  }

  console.log(`[DIRECT LOGIN] User ${username} (${email}) logged in successfully.`);
  res.json({ message: 'Logged in successfully', success: true, user: users[email] });
});

// 2. Verify OTP Endpoint (Kept just in case your frontend still calls it, instantly succeeds)
app.post('/api/verify-otp', (req, res) => {
  const { email } = req.body;
  if (users[email]) {
    return res.json({ success: true, user: users[email] });
  }
  res.status(400).json({ message: 'User not found, please login again' });
});

// 3. Telegram Verification Step
app.post('/api/check-telegram', (req, res) => {
  const { email } = req.body;
  const user = users[email];

  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ success: true, user });
});

// 4. Main Tool Usage API
app.post('/api/use-method', (req, res) => {
  const { email } = req.body;

  if (globalShutdown && email !== ADMIN_EMAIL) {
    return res.status(503).json({ message: 'System is currently down for maintenance.' });
  }

  const user = users[email];
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.banned) return res.status(403).json({ message: 'Your account is banned.' });

  if (user.kickedUntil && new Date() < new Date(user.kickedUntil)) {
    return res.status(403).json({ message: `Account suspended until ${user.kickedUntil}` });
  }

  if (user.usedToday >= user.dailyLimit && email !== ADMIN_EMAIL) {
    return res.status(429).json({ message: 'Daily limit reached.' });
  }

  user.usedToday += 1;
  res.json({ success: true, usedToday: user.usedToday, remaining: user.dailyLimit - user.usedToday });
});

// 5. Admin Panel APIs
app.get('/api/admin/users', (req, res) => {
  res.json({ users: Object.values(users), globalShutdown });
});

app.post('/api/admin/set-limit', (req, res) => {
  const { userId, limit } = req.body;
  if (users[userId]) {
    users[userId].dailyLimit = parseInt(limit, 10);
    return res.json({ success: true });
  }
  res.status(404).json({ message: 'User not found' });
});

app.post('/api/admin/kick', (req, res) => {
  const { userId, hours } = req.body;
  if (users[userId]) {
    const kickDate = new Date();
    kickDate.setHours(kickDate.getHours() + parseInt(hours, 10));
    users[userId].kickedUntil = kickDate;
    return res.json({ success: true });
  }
  res.status(404).json({ message: 'User not found' });
});

app.post('/api/admin/ban', (req, res) => {
  const { userId } = req.body;
  if (users[userId]) {
    users[userId].banned = true;
    return res.json({ success: true });
  }
  res.status(404).json({ message: 'User not found' });
});

app.post('/api/admin/shutdown', (req, res) => {
  const { status } = req.body;
  globalShutdown = status === 'disabled';
  res.json({ success: true, globalShutdown });
});

module.exports = app;
