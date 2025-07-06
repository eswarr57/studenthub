// server.js - Full Stack Student Collaboration Hub

// Required dependencies
const bcrypt = require('bcrypt');  // instead of bcryptjs
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Database connection
mongoose.connect('mongodb://localhost:27017/student_hub', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// Database Models
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  skills: [String],
  interests: [String],
  createdAt: { type: Date, default: Date.now }
});

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dueDate: Date,
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

const PollSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{
    text: { type: String, required: true },
    votes: { type: Number, default: 0 }
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  closesAt: Date
});

const User = mongoose.model('User', UserSchema);
const Task = mongoose.model('Task', TaskSchema);
const Event = mongoose.model('Event', EventSchema);
const Poll = mongoose.model('Poll', PollSchema);

// JWT Secret
const JWT_SECRET = 'your_jwt_secret_key_here';

// Middleware for authentication
const authenticate = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).send('Access denied. No token provided.');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).send('Invalid token.');
  }
};

// API Routes

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, skills, interests } = req.body;
    
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).send('User already registered.');

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    user = new User({
      username,
      email,
      password: hashedPassword,
      skills: skills || [],
      interests: interests || []
    });

    await user.save();

    // Generate token
    const token = jwt.sign({ _id: user._id, username: user.username }, JWT_SECRET);
    
    res.header('Authorization', `Bearer ${token}`).send({
      _id: user._id,
      username: user.username,
      email: user.email,
      skills: user.skills,
      interests: user.interests
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).send('Invalid email or password.');

    // Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).send('Invalid email or password.');

    // Generate token
    const token = jwt.sign({ _id: user._id, username: user.username }, JWT_SECRET);
    
    res.header('Authorization', `Bearer ${token}`).send({
      _id: user._id,
      username: user.username,
      email: user.email,
      skills: user.skills,
      interests: user.interests
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// User Profile
app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.send(user);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Update Profile
app.put('/api/profile', authenticate, async (req, res) => {
  try {
    const { skills, interests } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { skills, interests },
      { new: true }
    ).select('-password');
    
    res.send(user);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Tasks API
app.post('/api/tasks', authenticate, async (req, res) => {
  try {
    const { title, description, assignedTo, dueDate } = req.body;
    const task = new Task({
      title,
      description,
      assignedTo,
      createdBy: req.user._id,
      dueDate
    });
    
    await task.save();
    res.status(201).send(task);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/tasks', authenticate, async (req, res) => {
  try {
    const tasks = await Task.find({
      $or: [
        { createdBy: req.user._id },
        { assignedTo: req.user._id }
      ]
    }).populate('createdBy assignedTo', 'username');
    
    res.send(tasks);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.put('/api/tasks/:id', authenticate, async (req, res) => {
  try {
    const { completed } = req.body;
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, $or: [{ createdBy: req.user._id }, { assignedTo: req.user._id }] },
      { completed },
      { new: true }
    );
    
    if (!task) return res.status(404).send('Task not found or unauthorized.');
    res.send(task);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Calendar Events API
app.post('/api/events', authenticate, async (req, res) => {
  try {
    const { title, description, start, end, participants } = req.body;
    const event = new Event({
      title,
      description,
      start: new Date(start),
      end: new Date(end),
      createdBy: req.user._id,
      participants
    });
    
    await event.save();
    res.status(201).send(event);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/events', authenticate, async (req, res) => {
  try {
    const events = await Event.find({
      $or: [
        { createdBy: req.user._id },
        { participants: req.user._id }
      ]
    }).populate('createdBy participants', 'username');
    
    res.send(events);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Polls API
app.post('/api/polls', authenticate, async (req, res) => {
  try {
    const { question, options, closesAt } = req.body;
    
    const poll = new Poll({
      question,
      options: options.map(option => ({ text: option })),
      createdBy: req.user._id,
      closesAt: new Date(closesAt)
    });
    
    await poll.save();
    res.status(201).send(poll);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/polls', authenticate, async (req, res) => {
  try {
    const polls = await Poll.find({
      closesAt: { $gt: new Date() }
    }).populate('createdBy', 'username');
    
    res.send(polls);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post('/api/polls/:id/vote', authenticate, async (req, res) => {
  try {
    const { optionIndex } = req.body;
    
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).send('Poll not found.');
    
    // Check if user already voted
    if (poll.voters.includes(req.user._id)) {
      return res.status(400).send('You have already voted in this poll.');
    }
    
    // Check if option exists
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      return res.status(400).send('Invalid option.');
    }
    
    // Update vote count and add user to voters
    poll.options[optionIndex].votes += 1;
    poll.voters.push(req.user._id);
    
    await poll.save();
    res.send(poll);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Serve HTML Frontend
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Student Collaboration Hub</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css" rel="stylesheet">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f8f9fa;
        }
        .navbar-brand {
          font-weight: bold;
        }
        .feature-card {
          transition: transform 0.3s;
        }
        .feature-card:hover {
          transform: translateY(-5px);
        }
        .calendar-container {
          background: white;
          border-radius: 10px;
          padding: 20px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .task-item {
          border-left: 4px solid #0d6efd;
        }
        .completed {
          text-decoration: line-through;
          opacity: 0.7;
        }
        .poll-option {
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .poll-option:hover {
          background-color: #f1f1f1;
        }
        .profile-img {
          width: 150px;
          height: 150px;
          object-fit: cover;
        }
      </style>
    </head>
    <body>
      <!-- Navigation -->
      <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
        <div class="container">
          <a class="navbar-brand" href="#">Student Collaboration Hub</a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="navbar-nav me-auto">
              <li class="nav-item">
                <a class="nav-link active" href="#" onclick="showSection('dashboard')">Dashboard</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" onclick="showSection('calendar')">Calendar</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" onclick="showSection('tasks')">Tasks</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" onclick="showSection('polls')">Polls</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" onclick="showSection('profile')">Profile</a>
              </li>
            </ul>
            <div class="d-flex">
              <button id="loginBtn" class="btn btn-outline-light me-2" onclick="showAuthModal('login')">Login</button>
              <button id="registerBtn" class="btn btn-light" onclick="showAuthModal('register')">Register</button>
              <button id="logoutBtn" class="btn btn-outline-light d-none" onclick="logout()">Logout</button>
            </div>
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <div class="container my-4">
        <!-- Dashboard Section -->
        <div id="dashboard-section" class="section">
          <h2 class="mb-4">Dashboard</h2>
          <div class="row">
            <div class="col-md-4 mb-4">
              <div class="card feature-card h-100">
                <div class="card-body">
                  <h5 class="card-title">Upcoming Events</h5>
                  <div id="upcoming-events"></div>
                </div>
              </div>
            </div>
            <div class="col-md-4 mb-4">
              <div class="card feature-card h-100">
                <div class="card-body">
                  <h5 class="card-title">Pending Tasks</h5>
                  <div id="pending-tasks"></div>
                </div>
              </div>
            </div>
            <div class="col-md-4 mb-4">
              <div class="card feature-card h-100">
                <div class="card-body">
                  <h5 class="card-title">Active Polls</h5>
                  <div id="active-polls"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Calendar Section -->
        <div id="calendar-section" class="section d-none">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h2>Shared Calendar</h2>
            <button class="btn btn-primary" onclick="showAddEventModal()">Add Event</button>
          </div>
          <div class="calendar-container">
            <div id="calendar"></div>
          </div>
        </div>

        <!-- Tasks Section -->
        <div id="tasks-section" class="section d-none">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h2>Task Management</h2>
            <button class="btn btn-primary" onclick="showAddTaskModal()">Add Task</button>
          </div>
          <div class="card">
            <div class="card-body">
              <ul class="list-group" id="task-list">
                <!-- Tasks will be loaded here -->
              </ul>
            </div>
          </div>
        </div>

        <!-- Polls Section -->
        <div id="polls-section" class="section d-none">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h2>Polls & Surveys</h2>
            <button class="btn btn-primary" onclick="showAddPollModal()">Create Poll</button>
          </div>
          <div id="polls-container">
            <!-- Polls will be loaded here -->
          </div>
        </div>

        <!-- Profile Section -->
        <div id="profile-section" class="section d-none">
          <h2 class="mb-4">User Profile</h2>
          <div class="row">
            <div class="col-md-4">
              <div class="card mb-4">
                <div class="card-body text-center">
                  <img src="https://via.placeholder.com/150" class="profile-img rounded-circle mb-3" alt="Profile">
                  <h4 id="profile-username"></h4>
                  <p class="text-muted" id="profile-email"></p>
                </div>
              </div>
            </div>
            <div class="col-md-8">
              <div class="card mb-4">
                <div class="card-body">
                  <h5 class="card-title">Edit Profile</h5>
                  <form id="profile-form">
                    <div class="mb-3">
                      <label class="form-label">Skills (comma separated)</label>
                      <input type="text" class="form-control" id="profile-skills">
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Interests (comma separated)</label>
                      <input type="text" class="form-control" id="profile-interests">
                    </div>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Auth Modal -->
      <div class="modal fade" id="authModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="authModalTitle">Login</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="authForm">
                <div id="register-fields" class="d-none">
                  <div class="mb-3">
                    <label class="form-label">Username</label>
                    <input type="text" class="form-control" id="register-username" required>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" id="auth-email" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Password</label>
                  <input type="password" class="form-control" id="auth-password" required>
                </div>
                <div id="register-additional-fields" class="d-none">
                  <div class="mb-3">
                    <label class="form-label">Skills (comma separated)</label>
                    <input type="text" class="form-control" id="register-skills">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Interests (comma separated)</label>
                    <input type="text" class="form-control" id="register-interests">
                  </div>
                </div>
                <button type="submit" class="btn btn-primary w-100" id="authSubmitBtn">Login</button>
              </form>
            </div>
            <div class="modal-footer justify-content-center">
              <span id="authToggleText">Don't have an account? <a href="#" onclick="toggleAuthMode()">Register</a></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Event Modal -->
      <div class="modal fade" id="addEventModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Add New Event</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="eventForm">
                <div class="mb-3">
                  <label class="form-label">Title</label>
                  <input type="text" class="form-control" id="event-title" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Description</label>
                  <textarea class="form-control" id="event-description" rows="3"></textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Start Date & Time</label>
                  <input type="datetime-local" class="form-control" id="event-start" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">End Date & Time</label>
                  <input type="datetime-local" class="form-control" id="event-end" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Participants (comma separated emails)</label>
                  <input type="text" class="form-control" id="event-participants">
                </div>
                <button type="submit" class="btn btn-primary">Save Event</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Task Modal -->
      <div class="modal fade" id="addTaskModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Add New Task</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="taskForm">
                <div class="mb-3">
                  <label class="form-label">Title</label>
                  <input type="text" class="form-control" id="task-title" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Description</label>
                  <textarea class="form-control" id="task-description" rows="3"></textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Assign To (email)</label>
                  <input type="email" class="form-control" id="task-assignee">
                </div>
                <div class="mb-3">
                  <label class="form-label">Due Date</label>
                  <input type="datetime-local" class="form-control" id="task-due-date">
                </div>
                <button type="submit" class="btn btn-primary">Save Task</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Poll Modal -->
      <div class="modal fade" id="addPollModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Create New Poll</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="pollForm">
                <div class="mb-3">
                  <label class="form-label">Question</label>
                  <input type="text" class="form-control" id="poll-question" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Options (one per line)</label>
                  <textarea class="form-control" id="poll-options" rows="4" required></textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Closes At</label>
                  <input type="datetime-local" class="form-control" id="poll-closes-at" required>
                </div>
                <button type="submit" class="btn btn-primary">Create Poll</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <!-- Scripts -->
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
      <script>
        // Global variables
        let currentUser = null;
        let calendar = null;

        // DOM Ready
        document.addEventListener('DOMContentLoaded', function() {
          // Initialize modals
          const authModal = new bootstrap.Modal(document.getElementById('authModal'));
          const addEventModal = new bootstrap.Modal(document.getElementById('addEventModal'));
          const addTaskModal = new bootstrap.Modal(document.getElementById('addTaskModal'));
          const addPollModal = new bootstrap.Modal(document.getElementById('addPollModal'));

          // Check if user is logged in
          checkAuthStatus();

          // Initialize calendar
          initCalendar();

          // Form submissions
          document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);
          document.getElementById('eventForm').addEventListener('submit', handleEventSubmit);
          document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);
          document.getElementById('pollForm').addEventListener('submit', handlePollSubmit);
          document.getElementById('profile-form').addEventListener('submit', handleProfileUpdate);

          // Show dashboard by default
          showSection('dashboard');
        });

        // Authentication functions
        function checkAuthStatus() {
          const token = localStorage.getItem('token');
          if (token) {
            // Verify token and get user data
            axios.get('/api/profile', {
              headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(response => {
              currentUser = response.data;
              updateUIForAuth(true);
              loadDashboardData();
            })
            .catch(error => {
              console.error('Authentication error:', error);
              localStorage.removeItem('token');
              updateUIForAuth(false);
            });
          } else {
            updateUIForAuth(false);
          }
        }

        function updateUIForAuth(isAuthenticated) {
          const loginBtn = document.getElementById('loginBtn');
          const registerBtn = document.getElementById('registerBtn');
          const logoutBtn = document.getElementById('logoutBtn');

          if (isAuthenticated) {
            loginBtn.classList.add('d-none');
            registerBtn.classList.add('d-none');
            logoutBtn.classList.remove('d-none');
            document.getElementById('profile-username').textContent = currentUser.username;
            document.getElementById('profile-email').textContent = currentUser.email;
            document.getElementById('profile-skills').value = currentUser.skills.join(', ');
            document.getElementById('profile-interests').value = currentUser.interests.join(', ');
          } else {
            loginBtn.classList.remove('d-none');
            registerBtn.classList.remove('d-none');
            logoutBtn.classList.add('d-none');
            currentUser = null;
          }
        }

        function showAuthModal(mode) {
          const authModal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
          const authModalTitle = document.getElementById('authModalTitle');
          const registerFields = document.getElementById('register-fields');
          const registerAdditionalFields = document.getElementById('register-additional-fields');
          const authSubmitBtn = document.getElementById('authSubmitBtn');
          const authToggleText = document.getElementById('authToggleText');

          if (mode === 'login') {
            authModalTitle.textContent = 'Login';
            registerFields.classList.add('d-none');
            registerAdditionalFields.classList.add('d-none');
            authSubmitBtn.textContent = 'Login';
            authToggleText.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleAuthMode()">Register</a>';
          } else {
            authModalTitle.textContent = 'Register';
            registerFields.classList.remove('d-none');
            registerAdditionalFields.classList.remove('d-none');
            authSubmitBtn.textContent = 'Register';
            authToggleText.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthMode()">Login</a>';
          }

          authModal.show();
        }

        function toggleAuthMode() {
          const authModalTitle = document.getElementById('authModalTitle');
          if (authModalTitle.textContent === 'Login') {
            showAuthModal('register');
          } else {
            showAuthModal('login');
          }
        }

        function handleAuthSubmit(e) {
          e.preventDefault();
          const authModal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
          const isLoginMode = document.getElementById('authModalTitle').textContent === 'Login';

          const email = document.getElementById('auth-email').value;
          const password = document.getElementById('auth-password').value;

          if (isLoginMode) {
            // Login
            axios.post('/api/login', { email, password })
              .then(response => {
                localStorage.setItem('token', response.headers['authorization'].split(' ')[1]);
                currentUser = {
                  _id: response.data._id,
                  username: response.data.username,
                  email: response.data.email,
                  skills: response.data.skills,
                  interests: response.data.interests
                };
                updateUIForAuth(true);
                authModal.hide();
                loadDashboardData();
              })
              .catch(error => {
                alert('Login failed: ' + (error.response?.data || error.message));
              });
          } else {
            // Register
            const username = document.getElementById('register-username').value;
            const skills = document.getElementById('register-skills').value.split(',').map(s => s.trim()).filter(s => s);
            const interests = document.getElementById('register-interests').value.split(',').map(s => s.trim()).filter(s => s);

            axios.post('/api/register', { username, email, password, skills, interests })
              .then(response => {
                localStorage.setItem('token', response.headers['authorization'].split(' ')[1]);
                currentUser = {
                  _id: response.data._id,
                  username: response.data.username,
                  email: response.data.email,
                  skills: response.data.skills,
                  interests: response.data.interests
                };
                updateUIForAuth(true);
                authModal.hide();
                loadDashboardData();
              })
              .catch(error => {
                alert('Registration failed: ' + (error.response?.data || error.message));
              });
          }
        }

        function logout() {
          localStorage.removeItem('token');
          currentUser = null;
          updateUIForAuth(false);
          showSection('dashboard');
        }

        // Section navigation
        function showSection(sectionId) {
          document.querySelectorAll('.section').forEach(section => {
            section.classList.add('d-none');
          });
          
          document.getElementById(sectionId + '-section').classList.remove('d-none');
          
          if (currentUser) {
            switch(sectionId) {
              case 'dashboard':
                loadDashboardData();
                break;
              case 'calendar':
                calendar.render();
                loadEvents();
                break;
              case 'tasks':
                loadTasks();
                break;
              case 'polls':
                loadPolls();
                break;
              case 'profile':
                // Profile is already loaded in checkAuthStatus
                break;
            }
          }
        }

        // Dashboard functions
        function loadDashboardData() {
          if (!currentUser) return;
          
          // Load upcoming events
          axios.get('/api/events', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
          })
          .then(response => {
            const events = response.data
              .filter(event => new Date(event.end) > new Date())
              .sort((a, b) => new Date(a.start) - new Date(b.start))
              .slice(0, 3);

            const eventsHtml = events.length > 0
              ? events.map(event => {
                  return '<div class="mb-2">' +
                    '<strong>' + event.title + '</strong><br>' +
                    '<small>' + formatDateTime(event.start) + ' - ' + formatDateTime(event.end) + '</small>' +
                  '</div>';
                }).join('')
              : '<p>No upcoming events</p>';

            document.getElementById('upcoming-events').innerHTML = eventsHtml;
          });

          // Load pending tasks
          axios.get('/api/tasks', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
          })
          .then(response => {
            const tasks = response.data
              .filter(task => !task.completed)
              .sort((a, b) => (a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31')) - (b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31')))
              .slice(0, 5);

            const tasksHtml = tasks.length > 0
              ? tasks.map(task => {
                  return '<div class="mb-2">' +
                    '<strong>' + task.title + '</strong><br>' +
                    '<small>' + (task.dueDate ? 'Due: ' + formatDateTime(task.dueDate) : 'No due date') + '</small>' +
                  '</div>';
                }).join('')
              : '<p>No pending tasks</p>';

            document.getElementById('pending-tasks').innerHTML = tasksHtml;
          });

          // Load active polls
          axios.get('/api/polls', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
          })
          .then(response => {
            const polls = response.data.slice(0, 3);

            const pollsHtml = polls.length > 0
              ? polls.map(poll => {
                  return '<div class="mb-2">' +
                    '<strong>' + poll.question + '</strong><br>' +
                    '<small>Closes: ' + formatDateTime(poll.closesAt) + '</small>' +
                  '</div>';
                }).join('')
              : '<p>No active polls</p>';

            document.getElementById('active-polls').innerHTML = pollsHtml;
          });
        }

        // Calendar functions
        function initCalendar() {
          const calendarEl = document.getElementById('calendar');
          calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            events: [],
            eventClick: function(info) {
              alert('Event: ' + info.event.title + '\n' + 
                    'Start: ' + info.event.start.toLocaleString() + '\n' +
                    'End: ' + info.event.end.toLocaleString());
            }
          });
        }

        function showAddEventModal() {
          const modal = bootstrap.Modal.getInstance(document.getElementById('addEventModal'));
          document.getElementById('eventForm').reset();
          modal.show();
        }

        function loadEvents() {
          axios.get('/api/events', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
          })
          .then(response => {
            const events = response.data.map(event => ({
              id: event._id,
              title: event.title,
              start: event.start,
              end: event.end,
              description: event.description
            }));
            
            calendar.removeAllEvents();
            calendar.addEventSource(events);
            calendar.render();
          });
        }

        function handleEventSubmit(e) {
          e.preventDefault();
          const modal = bootstrap.Modal.getInstance(document.getElementById('addEventModal'));
          
          const title = document.getElementById('event-title').value;
          const description = document.getElementById('event-description').value;
          const start = document.getElementById('event-start').value;
          const end = document.getElementById('event-end').value;
          const participants = document.getElementById('event-participants').value.split(',').map(p => p.trim()).filter(p => p);

          axios.post('/api/events', {
            title,
            description,
            start,
            end,
            participants
          }, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
          })
          .then(() => {
            modal.hide();
            loadEvents();
          })
          .catch(error => {
            alert('Failed to add event: ' + (error.response?.data || error.message));
          });
        }

      </script>
    </body>
    </html>
  `);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
