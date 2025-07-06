require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/student-collab-hub')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Models
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }]
}).pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 8);
  }
  next();
}).method('generateAuthToken', function() {
  return jwt.sign({ _id: this._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
}));

const Group = mongoose.model('Group', new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}));

const CalendarEvent = mongoose.model('CalendarEvent', new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  dueDate: Date,
  completed: { type: Boolean, default: false },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}));

const Poll = mongoose.model('Poll', new mongoose.Schema({
  question: { type: String, required: true },
  options: [{
    text: { type: String, required: true },
    votes: { type: Number, default: 0 },
    voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  closesAt: Date
}));

// Middleware
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded._id });
    
    if (!user) throw new Error();
    
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).send({ error: 'Please authenticate' });
  }
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = new User({ username, email, password });
    await user.save();
    const token = user.generateAuthToken();
    res.status(201).send({ user, token });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) throw new Error('Invalid login credentials');
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('Invalid login credentials');
    
    const token = user.generateAuthToken();
    res.send({ user, token });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Group Routes
app.post('/api/groups', verifyToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    const group = new Group({
      name,
      description,
      members: [req.user._id],
      createdBy: req.user._id
    });
    await group.save();
    
    // Add group to user's groups
    await User.findByIdAndUpdate(req.user._id, {
      $push: { groups: group._id }
    });
    
    res.status(201).send(group);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get('/api/groups', verifyToken, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id });
    res.send(groups);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Calendar Routes
app.post('/api/calendar', verifyToken, async (req, res) => {
  try {
    const { title, description, start, end, groupId } = req.body;
    const event = new CalendarEvent({
      title, description, start, end,
      group: groupId,
      createdBy: req.user._id
    });
    await event.save();
    res.status(201).send(event);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get('/api/calendar/group/:groupId', verifyToken, async (req, res) => {
  try {
    const events = await CalendarEvent.find({ group: req.params.groupId });
    res.send(events);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.put('/api/calendar/:id', verifyToken, async (req, res) => {
  try {
    const event = await CalendarEvent.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      req.body,
      { new: true }
    );
    if (!event) throw new Error('Event not found or unauthorized');
    res.send(event);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.delete('/api/calendar/:id', verifyToken, async (req, res) => {
  try {
    const event = await CalendarEvent.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });
    if (!event) throw new Error('Event not found or unauthorized');
    res.send(event);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Task Routes
app.post('/api/tasks', verifyToken, async (req, res) => {
  try {
    const { title, description, dueDate, groupId, assignedTo } = req.body;
    const task = new Task({
      title, description, dueDate,
      group: groupId,
      assignedTo,
      createdBy: req.user._id
    });
    await task.save();
    res.status(201).send(task);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get('/api/tasks/group/:groupId', verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find({ group: req.params.groupId })
      .populate('assignedTo', 'username')
      .populate('createdBy', 'username');
    res.send(tasks);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.put('/api/tasks/:id', verifyToken, async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      req.body,
      { new: true }
    );
    if (!task) throw new Error('Task not found or unauthorized');
    res.send(task);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.delete('/api/tasks/:id', verifyToken, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });
    if (!task) throw new Error('Task not found or unauthorized');
    res.send(task);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Poll Routes
app.post('/api/polls', verifyToken, async (req, res) => {
  try {
    const { question, options, groupId, closesAt } = req.body;
    const formattedOptions = options.map(opt => ({ text: opt }));
    
    const poll = new Poll({
      question,
      options: formattedOptions,
      group: groupId,
      closesAt,
      createdBy: req.user._id
    });
    await poll.save();
    res.status(201).send(poll);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get('/api/polls/group/:groupId', verifyToken, async (req, res) => {
  try {
    const polls = await Poll.find({ group: req.params.groupId })
      .populate('createdBy', 'username');
    res.send(polls);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.post('/api/polls/:id/vote', verifyToken, async (req, res) => {
  try {
    const { optionIndex } = req.body;
    const poll = await Poll.findById(req.params.id);
    
    if (!poll) throw new Error('Poll not found');
    if (poll.closesAt && new Date(poll.closesAt) < new Date()) {
      throw new Error('This poll has closed');
    }
    
    const option = poll.options[optionIndex];
    if (!option) throw new Error('Invalid option');
    
    // Check if user already voted
    const hasVoted = option.voters.some(voter => voter.equals(req.user._id));
    if (hasVoted) throw new Error('You have already voted in this poll');
    
    option.votes += 1;
    option.voters.push(req.user._id);
    await poll.save();
    
    res.send(poll);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.delete('/api/polls/:id', verifyToken, async (req, res) => {
  try {
    const poll = await Poll.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });
    if (!poll) throw new Error('Poll not found or unauthorized');
    res.send(poll);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
