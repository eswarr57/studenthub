const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

// Use environment variable for MongoDB (Render uses remote DB)
const MONGO_URL = process.env.MONGODB_URI || "mongodb://localhost:27017/student_hub";
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// === SCHEMAS ===
const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: String, required: true },
});

const PollSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [
    {
      option: { type: String, required: true },
      votes: { type: Number, default: 0 },
    },
  ],
});

const Task = mongoose.model("Task", TaskSchema);
const Poll = mongoose.model("Poll", PollSchema);

// === ROUTE TO SERVE HTML ===
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Student Collaboration Hub</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; background: #f9f9f9; }
    input, button { margin: 0.5rem 0; padding: 0.4rem; }
    section { margin-bottom: 2rem; padding: 1rem; background: #fff; border-radius: 8px; box-shadow: 0 0 8px rgba(0,0,0,0.1); }
    h1 { color: #333; }
    button { cursor: pointer; }
    li { margin-bottom: 0.4rem; }
  </style>
</head>
<body>
  <h1>Student Collaboration Hub</h1>

  <section>
    <h2>📅 Calendar + Tasks</h2>
    <input type="date" id="task-date">
    <input id="task-title" placeholder="New Task" />
    <button onclick="addTask()">Add Task</button>
    <ul id="task-list"></ul>
  </section>

  <section>
    <h2>🗳️ Polls</h2>
    <input id="poll-question" placeholder="Poll question" />
    <input id="opt1" placeholder="Option 1" />
    <input id="opt2" placeholder="Option 2" />
    <button onclick="createPoll()">Create Poll</button>
    <div id="polls"></div>
  </section>

<script>
  async function loadTasks() {
    const date = document.getElementById("task-date").value;
    if (!date) return;
    const res = await fetch(\`/tasks/\${date}\`);
    const data = await res.json();
    const list = document.getElementById("task-list");
    list.innerHTML = "";
    data.forEach(task => {
      const li = document.createElement("li");
      li.textContent = task.title;
      list.appendChild(li);
    });
  }

  async function addTask() {
    const date = document.getElementById("task-date").value;
    const title = document.getElementById("task-title").value;
    if (!date || !title) return alert("Fill both fields");
    await fetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, date })
    });
    document.getElementById("task-title").value = "";
    loadTasks();
  }

  async function loadPolls() {
    const res = await fetch("/polls");
    const polls = await res.json();
    const div = document.getElementById("polls");
    div.innerHTML = "";
    polls.forEach(poll => {
      const container = document.createElement("div");
      container.innerHTML = \`<p><strong>\${poll.question}</strong></p>\`;
      poll.options.forEach(opt => {
        const btn = document.createElement("button");
        btn.textContent = \`\${opt.option} (\${opt.votes})\`;
        btn.onclick = async () => {
          await fetch(\`/polls/\${poll._id}/vote\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ option: opt.option })
          });
          loadPolls();
        };
        container.appendChild(btn);
      });
      div.appendChild(container);
    });
  }

  async function createPoll() {
    const question = document.getElementById("poll-question").value;
    const opt1 = document.getElementById("opt1").value;
    const opt2 = document.getElementById("opt2").value;
    if (!question || !opt1 || !opt2) return alert("Fill all fields");
    await fetch("/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        options: [{ option: opt1 }, { option: opt2 }]
      })
    });
    document.getElementById("poll-question").value = "";
    document.getElementById("opt1").value = "";
    document.getElementById("opt2").value = "";
    loadPolls();
  }

  document.getElementById("task-date").addEventListener("change", loadTasks);
  loadPolls();
</script>
</body>
</html>
  `);
});

// === Task Routes ===
app.post("/tasks", async (req, res) => {
  try {
    const task = await Task.create(req.body);
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: "Failed to create task" });
  }
});

app.get("/tasks/:date", async (req, res) => {
  try {
    const tasks = await Task.find({ date: req.params.date });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve tasks" });
  }
});

// === Poll Routes ===
app.post("/polls", async (req, res) => {
  try {
    const poll = await Poll.create(req.body);
    res.json(poll);
  } catch (error) {
    res.status(500).json({ error: "Failed to create poll" });
  }
});

app.get("/polls", async (req, res) => {
  try {
    const polls = await Poll.find();
    res.json(polls);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve polls" });
  }
});

app.post("/polls/:id/vote", async (req, res) => {
  const { option } = req.body;
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    poll.options = poll.options.map(o =>
      o.option === option ? { option: o.option, votes: o.votes + 1 } : o
    );
    await poll.save();
    res.json(poll);
  } catch (error) {
    res.status(500).json({ error: "Failed to vote on poll" });
  }
});

// === Start Server ===
app.listen(PORT, () => console.log(\`Student Hub running on https://studenthub-3-fzrd.onrender.com`));
