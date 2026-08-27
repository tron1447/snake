const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const rooms = new Map();
const clients = new Map();

const WORLD = 20000;

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));

  return code;
}

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function safeName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .slice(0, 16) || "Player";
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data) {
  if (!room) return;

  for (const player of room.players.values()) {
    send(player.ws, data);
  }
}

function lobby(room) {
  const players = [];

  for (const p of room.players.values()) {
    players.push({
      id: p.id,
      name: p.name,
      color: p.color,
      host: p.id === room.host
    });
  }

  broadcast(room, {
    type: "lobby",
    players
  });
}

function publicPlayers(room) {
  const result = {};

  for (const p of room.players.values()) {
    if (!p.started) continue;

    result[p.id] = {
      id: p.id,
      x: p.x,
      y: p.y,
      angle: p.angle,
      length: p.length,
      color: p.color,
      name: p.name,
      alive: p.alive
    };
  }

  return result;
}

function gameState(room) {
  broadcast(room, {
    type: "players",
    players: publicPlayers(room)
  });
}

function startRoom(room) {
  if (room.started) return;

  room.started = true;

  for (const p of room.players.values()) {
    p.started = true;
    p.alive = true;
    p.x = 3000 + Math.random() * 14000;
    p.y = 3000 + Math.random() * 14000;
    p.angle = Math.random() * Math.PI * 2;
    p.length = 20;
    p.score = 0;
  }

  for (const p of room.players.values()) {
    send(p.ws, {
      type: "gameStart",
      id: p.id
    });
  }

  gameState(room);
}

function removePlayer(ws) {
  const p = clients.get(ws);
  if (!p) return;

  clients.delete(ws);

  const room = rooms.get(p.room);
  if (!room) return;

  room.players.delete(p.id);

  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }

  if (room.host === p.id) {
    room.host = room.players.keys().next().value;
  }

  if (!room.started) {
    lobby(room);
  } else {
    gameState(room);
  }
}

wss.on("connection", (ws) => {
  const player = {
    id: id(),
    ws,
    room: null,
    name: "Player",
    color: "#63ff78",
    x: 10000,
    y: 10000,
    angle: 0,
    length: 20,
    score: 0,
    alive: true,
    started: false
  };

  clients.set(ws, player);

  send(ws, {
    type: "connected",
    id: player.id
  });

  ws.on("message", (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const p = clients.get(ws);
    if (!p) return;

    if (data.type === "createRoom") {
      if (p.room) return;

      const code = randomCode();

      const room = {
        code,
        host: p.id,
        started: false,
        players: new Map()
      };

      p.room = code;
      p.name = safeName(data.name);
      p.color = data.color || "#63ff78";

      room.players.set(p.id, p);
      rooms.set(code, room);

      send(ws, {
        type: "roomCreated",
        id: p.id,
        code
      });

      lobby(room);
      return;
    }

    if (data.type === "joinRoom") {
      if (p.room) return;

      const code = String(data.code || "").toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        send(ws, {
          type: "error",
          message: "Seda roomi ei leitud."
        });
        return;
      }

      if (room.started) {
        send(ws, {
          type: "error",
          message: "See mäng on juba alanud."
        });
        return;
      }

      if (room.players.size >= 12) {
        send(ws, {
          type: "error",
          message: "Room on täis."
        });
        return;
      }

      p.room = code;
      p.name = safeName(data.name);
      p.color = data.color || "#4da6ff";

      room.players.set(p.id, p);

      send(ws, {
        type: "roomJoined",
        id: p.id,
        code
      });

      lobby(room);
      return;
    }

    if (data.type === "startGame") {
      const room = rooms.get(p.room);

      if (!room) return;

      if (room.host !== p.id) {
        send(ws, {
          type: "error",
          message: "Ainult roomi looja saab mängu alustada."
        });
        return;
      }

      startRoom(room);
      return;
    }

    if (data.type === "state") {
      const room = rooms.get(p.room);

      if (!room || !room.started || !p.alive) return;

      const x = Number(data.x);
      const y = Number(data.y);
      const angle = Number(data.angle);
      const length = Number(data.length);

      if (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(angle) &&
        Number.isFinite(length)
      ) {
        p.x = Math.max(0, Math.min(WORLD, x));
        p.y = Math.max(0, Math.min(WORLD, y));
        p.angle = angle;
        p.length = Math.max(10, Math.min(500, length));
      }

      if (data.name) {
        p.name = safeName(data.name);
      }

      if (data.color) {
        p.color = String(data.color).slice(0, 20);
      }

      gameState(room);
      return;
    }

    if (data.type === "kill") {
      const room = rooms.get(p.room);
      if (!room || !room.started) return;

      const target = room.players.get(data.target);

      if (!target || !target.alive) return;

      target.alive = false;

      send(target.ws, {
        type: "gameOver",
        reason: "Sind tapetud!"
      });

      broadcast(room, {
        type: "playerKilled",
        id: target.id,
        killer: p.id,
        killerName: p.name
      });

      p.score += 10;

      gameState(room);
    }
  });

  ws.on("close", () => {
    removePlayer(ws);
  });

  ws.on("error", () => {
    removePlayer(ws);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.started) {
      gameState(room);
    }
  }
}, 100);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Snake Arena server running on port " + PORT);
});
