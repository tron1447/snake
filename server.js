const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const WORLD = 12000;

app.use(express.static(path.join(__dirname)));

const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data) {
  for (const p of room.players.values()) {
    send(p.ws, data);
  }
}

function randomRoom() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}

function safeName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .trim()
    .substring(0, 16) || "Player";
}

function spawn() {
  return {
    x: 1000 + Math.random() * (WORLD - 2000),
    y: 1000 + Math.random() * (WORLD - 2000)
  };
}

function resetPlayer(p) {
  const s = spawn();

  p.x = s.x;
  p.y = s.y;

  p.angle = Math.random() * Math.PI * 2;
  p.targetAngle = p.angle;

  p.length = 30;
  p.score = 0;
  p.kills = 0;

  p.alive = true;
  p.boosting = false;

  p.body = [];

  for (let i = 0; i < p.length; i++) {
    p.body.push({
      x: p.x - Math.cos(p.angle) * i * 8,
      y: p.y - Math.sin(p.angle) * i * 8
    });
  }
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    angle: p.angle,
    length: p.length,
    score: p.score,
    kills: p.kills,
    color: p.color,
    alive: p.alive,
    body: p.body
  };
}

function roomState(room) {
  return {
    type: "state",
    players: Array.from(room.players.values()).map(publicPlayer)
  };
}

wss.on("connection", ws => {
  const p = {
    id: Math.random().toString(36).slice(2, 10),
    ws,
    room: null,

    name: "Player",
    color: "#5cff72",

    x: 0,
    y: 0,

    angle: 0,
    targetAngle: 0,

    length: 30,
    score: 0,
    kills: 0,

    alive: true,
    boosting: false,

    body: [],

    lastInput: Date.now()
  };

  resetPlayer(p);

  send(ws, {
    type: "connected",
    id: p.id
  });

  ws.on("message", raw => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "createRoom") {
      if (p.room) {
        p.room.players.delete(p.id);
      }

      const code = randomRoom();

      const room = {
        code,
        players: new Map()
      };

      rooms.set(code, room);

      p.name = safeName(data.name);

      if (typeof data.color === "string") {
        p.color = data.color;
      }

      resetPlayer(p);

      p.room = room;
      room.players.set(p.id, p);

      send(ws, {
        type: "roomCreated",
        code,
        id: p.id
      });

      broadcast(room, roomState(room));
      return;
    }

    if (data.type === "joinRoom") {
      const code = String(data.code || "")
        .trim()
        .toUpperCase();

      const room = rooms.get(code);

      if (!room) {
        send(ws, {
          type: "error",
          message: "Roomi ei leitud."
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

      if (p.room) {
        p.room.players.delete(p.id);
      }

      p.name = safeName(data.name);

      if (typeof data.color === "string") {
        p.color = data.color;
      }

      resetPlayer(p);

      p.room = room;
      room.players.set(p.id, p);

      send(ws, {
        type: "roomJoined",
        code,
        id: p.id
      });

      broadcast(room, roomState(room));
      return;
    }

    if (data.type === "startRoom") {
      if (!p.room) return;

      for (const x of p.room.players.values()) {
        resetPlayer(x);
      }

      broadcast(p.room, {
        type: "gameStart"
      });

      broadcast(p.room, roomState(p.room));
      return;
    }

    if (data.type === "input") {
      if (!p.room || !p.alive) return;

      if (Number.isFinite(data.angle)) {
        p.targetAngle = data.angle;
      }

      p.boosting = !!data.boosting;
      p.lastInput = Date.now();
    }
  });

  ws.on("close", () => {
    if (!p.room) return;

    const room = p.room;

    room.players.delete(p.id);

    if (room.players.size === 0) {
      rooms.delete(room.code);
    } else {
      broadcast(room, roomState(room));
    }
  });
});

/*
  Server keeps multiplayer positions alive.
  Client controls feel smooth because the client
  predicts movement locally.
*/

setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      if (!p.alive) continue;

      let diff = p.targetAngle - p.angle;

      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      p.angle += diff * 0.18;

      const speed = p.boosting ? 10 : 7;

      p.x += Math.cos(p.angle) * speed;
      p.y += Math.sin(p.angle) * speed;

      p.x = Math.max(40, Math.min(WORLD - 40, p.x));
      p.y = Math.max(40, Math.min(WORLD - 40, p.y));

      p.body.unshift({
        x: p.x,
        y: p.y
      });

      while (p.body.length < Math.floor(p.length)) {
        const last = p.body[p.body.length - 1];

        p.body.push({
          x: last.x,
          y: last.y
        });
      }

      while (p.body.length > Math.floor(p.length)) {
        p.body.pop();
      }

      if (p.boosting && p.length > 32) {
        p.length -= 0.02;
      }

      if (Date.now() - p.lastInput > 3000) {
        p.boosting = false;
      }
    }

    broadcast(room, roomState(room));
  }
}, 50);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Snake Arena running on port " + PORT);
});
