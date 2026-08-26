const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Temporary In-Memory Database
const users = {}; // Stores user info, limits, status
const otpStore = {}; // Stores verification codes
let globalShutdown = false;

const ADMIN_EMAIL = 'zyven4163@gmail.com';

// 1. Send OTP Code
app.post('/api/send-otp', (req, res) => {
  const { email, tiktok } = req.body;
  if (!email || !tiktok) return res.status(400).json({ error: 'Email and TikTok handle required' });

  // Generate random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = code;

  console.log(`[OTP SENT] Email: ${email} | Code: ${code}`);
  
  // Note: Integrate Nodemailer here to send actual emails.
  res.json({ message: 'OTP sent successfully' });
});

// 2. Verify OTP Code
app.post('/api/verify-otp', (req, res) => {
  const { email, code } = req.body;

  if (otpStore[email] === code) {
    delete otpStore[email];
    
    // Register user if new
    if (!users[email]) {
      users[email] = {
        email,
        dailyLimit: 5,
        usedToday: 0,
        banned: false,
        kickedUntil: null
      };
    }

    return res.json({ success: true, user: users[email] });
  }

  res.status(400).json({ error: 'Invalid verification code' });
});

// 3. Main Tool API: Check Limits & Patch Video
app.post('/api/patch-video', (req, res) => {
  const { email } = req.body;

  if (globalShutdown && email !== ADMIN_EMAIL) {
    return res.status(503).json({ error: 'System is currently down for maintenance.' });
  }

  const user = users[email];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.banned) return res.status(403).json({ error: 'Your account is banned.' });
  
  if (user.kickedUntil && new Date() < new Date(user.kickedUntil)) {
    return res.status(403).json({ error: `Account suspended until ${user.kickedUntil}` });
  }

  if (user.usedToday >= user.dailyLimit && email !== ADMIN_EMAIL) {
    return res.status(429).json({ error: 'Daily limit reached.' });
  }

  user.usedToday += 1;
  res.json({ success: true, remaining: user.dailyLimit - user.usedToday });
});

// 4. Admin Panel APIs
app.get('/api/admin/users', (req, res) => {
  res.json({ users: Object.values(users), globalShutdown });
});

app.post('/api/admin/set-limit', (req, res) => {
  const { email, limit } = req.body;
  if (users[email]) {
    users[email].dailyLimit = parseInt(limit);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'User not found' });
});

app.post('/api/admin/ban', (req, res) => {
  const { email } = req.body;
  if (users[email]) {
    users[email].banned = true;
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'User not found' });
});

app.post('/api/admin/toggle-shutdown', (req, res) => {
  globalShutdown = req.body.shutdown;
  res.json({ success: true, globalShutdown });
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => console.log(`Zyven Server running on http://localhost:${PORT}`));