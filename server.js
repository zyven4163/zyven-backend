const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// Explicit SMTP Configuration for Gmail to prevent Vercel connection issues
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // false for port 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const users = {}; // Stores user info, limits, status
const otpStore = {}; // Stores verification codes
let globalShutdown = false;

const ADMIN_EMAIL = 'zyven4163@gmail.com';

// 1. Send OTP Code via Real Email
app.post('/api/send-otp', async (req, res) => {
  const { email, username } = req.body;
  if (!email || !username) {
    return res.status(400).json({ message: 'Email and TikTok username required' });
  }

  // Generate random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { code, username };

  const mailOptions = {
    from: `"Zyven Extension" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your Zyven Verification Code',
    text: `Hello ${username},\n\nYour 6-digit verification code is: ${code}\n\nIf you did not request this code, please ignore this email.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[REAL EMAIL SENT] Code ${code} sent to ${email}`);
    res.json({ message: 'OTP sent successfully to email' });
  } catch (err) {
    console.error('[EMAIL ERROR]', err);
    res.status(500).json({ message: 'Failed to send verification email.' });
  }
});

// 2. Verify OTP Code
app.post('/api/verify-otp', (req, res) => {
  const { email, code } = req.body;

  if (otpStore[email] && otpStore[email].code === code) {
    const username = otpStore[email].username;
    delete otpStore[email];

    // Register user if new
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

    return res.json({ success: true, user: users[email] });
  }

  res.status(400).json({ message: 'Invalid verification code' });
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

// Export server for Vercel Serverless
module.exports = app;
