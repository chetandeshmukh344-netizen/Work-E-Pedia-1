const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API catch-all: serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/workepedia')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['college', 'mentor', 'intern'], required: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For interns
  workHours: { type: Number, default: 8 },
  startTime: { type: String, default: '09:30' },
  wifiIP: { type: String, default: '192.168.1.50' },
  location: {
    lat: { type: Number, default: 28.6139 },
    lng: { type: Number, default: 77.2090 },
    label: { type: String, default: 'New Delhi HQ' }
  },
  privateKey: { type: String },
  firstLogin: { type: Boolean, default: false },
  breaksUsed: { type: Number, default: 0 },
  idleLogouts: { type: Number, default: 0 },
  warningShown: { type: Boolean, default: false },
  attendance: {
    type: Map,
    of: new mongoose.Schema({
      status: String,
      in: String,
      out: String,
      hours: Number,
      remarks: String,
      late: Boolean,
      breakStart: String
    }, { _id: false })
  }
});

const notificationSchema = new mongoose.Schema({
  internId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  time: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// Middleware: Auth
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Unauthorized' });
  next();
};

// Routes
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Note: In a real app, use bcrypt.compare. For now, simple check if migration isn't done.
    if (user.password !== password) return res.status(401).json({ error: 'Invalid password' });
    
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '24h' });
    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// College: Add Mentor
app.post('/api/mentors', authenticate, authorize(['college']), async (req, res) => {
  try {
    const { name, username, password } = req.body;
    const user = new User({ name, username, password, role: 'mentor' });
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: 'Could not create mentor' });
  }
});

// Mentor: Add Intern
app.post('/api/interns', authenticate, authorize(['mentor']), async (req, res) => {
  try {
    const { name, username, password, hours, start, ip, lat, lng, loc } = req.body;
    const intern = new User({
      name, username, password, role: 'intern',
      mentor: req.user.id,
      workHours: hours,
      startTime: start,
      wifiIP: ip,
      location: { lat, lng, label: loc }
    });
    await intern.save();
    res.status(201).json(intern);
  } catch (err) {
    res.status(400).json({ error: 'Could not create mentor' });
  }
});

// Attendance: Mark
app.post('/api/attendance', authenticate, authorize(['intern']), async (req, res) => {
  const { date, record } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user.attendance) user.attendance = {};
    user.attendance.set(date, record);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Notifications
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const query = req.user.role === 'mentor' 
      ? { internId: { $in: (await User.find({ mentor: req.user.id })).map(i => i._id) } }
      : { internId: req.user.id };
    const notes = await Notification.find(query).sort({ time: -1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/notifications/:id/read', authenticate, async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { read: true });
  res.json({ success: true });
});

// Seed default college user
const seedCollege = async () => {
  const exists = await User.findOne({ username: 'college' });
  if (!exists) {
    await User.create({
      username: 'college',
      password: 'college123',
      name: 'College Admin',
      role: 'college'
    });
    console.log('Seeded college admin');
  }
};
seedCollege();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
