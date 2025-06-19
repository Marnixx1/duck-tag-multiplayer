const fs = require("fs");
const https = require("https");
const express = require("express");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

// Load your SSL certificate and key (replace with actual paths)
const sslOptions = {
  key: fs.readFileSync("/etc/letsencrypt/live/yourdomain.com/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/yourdomain.com/fullchain.pem"),
};

const httpsServer = https.createServer(sslOptions, app);
const io = new Server(httpsServer, {
  cors: {
    origin: "https://your-frontend-url.com",
    methods: ["GET", "POST"]
  }
});

const MAX_PLAYERS = 5;
const players = {};
const playerSize = 40;
const speed = 10;

function getRandomPosition() {
  return {
    x: Math.floor(Math.random() * 800),
    y: Math.floor(Math.random() * 600),
    layer: Math.floor(Math.random() * 4),
  };
}

function getColorIndex() {
  return Math.floor(Math.random() * 5);
}

function checkCollision(p1, p2) {
  return (
    Math.abs(p1.x - p2.x) < playerSize &&
    Math.abs(p1.y - p2.y) < playerSize &&
    p1.layer === p2.layer
  );
}

function tagIfCollision(moverId) {
  const mover = players[moverId];
  if (!mover.isTagger) return;

  for (const [id, p] of Object.entries(players)) {
    if (id !== moverId && checkCollision(mover, p)) {
      mover.isTagger = false;
      p.isTagger = true;
      break;
    }
  }
}

io.on("connection", (socket) => {
  if (Object.keys(players).length >= MAX_PLAYERS) {
    socket.disconnect(true);
    return;
  }

  const { x, y, layer } = getRandomPosition();
  players[socket.id] = {
    x,
    y,
    layer,
    colorIndex: getColorIndex(),
    isTagger: Object.keys(players).length === 0,
  };

  io.emit("state", players);

  socket.on("move", (dir) => {
    const p = players[socket.id];
    if (!p) return;

    switch (dir) {
      case "up":
        p.y = Math.max(0, p.y - speed);
        break;
      case "down":
        p.y = Math.min(560, p.y + speed);
        break;
      case "left":
        p.x = Math.max(0, p.x - speed);
        break;
      case "right":
        p.x = Math.min(760, p.x + speed);
        break;
    }

    tagIfCollision(socket.id);
    io.emit("state", players);
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    const remaining = Object.keys(players);
    if (!Object.values(players).some(p => p.isTagger) && remaining.length > 0) {
      players[remaining[0]].isTagger = true;
    }
    io.emit("state", players);
  });
});

httpsServer.listen(443, () => {
  console.log("Secure HTTPS server running on port 443");
});
