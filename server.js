const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const WORLD = 10000;
const TICK = 50;
const MAX_PLAYERS = 16;

app.use(express.static(path.join(__dirname)));

const rooms = new Map();

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function roomCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}

function cleanName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 16) || "Player";
}

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

function spawn() {
  return {
    x: 1200 + Math.random() * (WORLD - 2400),
    y: 1200 + Math.random() * (WORLD - 2400)
  };
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function resetPlayer(p) {
  const s = spawn();

  p.x = s.x;
  p.y = s.y;

  p.angle = Math.random() * Math.PI * 2;
  p.targetAngle = p.angle;

  p.length = 35;
  p.score = 0;
  p.kills = 0;

  p.boost = false;
  p.alive = true;

  p.body = [];

  for (let i = 0; i < p.length; i++) {
    p.body.push({
      x: p.x - Math.cos(p.angle) * i * 9,
      y: p.y - Math.sin(p.angle) * i * 9
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

function state(room) {
  return {
    type: "state",
    players: [...room.players.values()].map(publicPlayer)
  };
}

wss.on("connection", ws => {
  const p = {
    id: randomId(),
    ws,

    room: null,

    name: "Player",
    color: "#5cff72",

    x: 0,
    y: 0,

    angle: 0,
    targetAngle: 0,

    length: 35,
    score: 0,
    kills: 0,

    boost: false,
    alive: true,

    body: []
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
      const code = roomCode();

      const room = {
        code,
        players: new Map()
      };

      rooms.set(code, room);

      p.name = cleanName(data.name);

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

      broadcast(room, state(room));
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

      if (room.players.size >= MAX_PLAYERS) {
        send(ws, {
          type: "error",
          message: "Room on täis."
        });
        return;
      }

      p.name = cleanName(data.name);

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

      broadcast(room, state(room));
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

      broadcast(p.room, state(p.room));
      return;
    }

    if (data.type === "input") {
      if (!p.room) return;

      if (Number.isFinite(data.angle)) {
        p.targetAngle = data.angle;
      }

      p.boost = !!data.boost;
    }
  });

  ws.on("close", () => {
    if (!p.room) return;

    const room = p.room;

    room.players.delete(p.id);

    if (room.players.size === 0) {
      rooms.delete(room.code);
    } else {
      broadcast(room, state(room));
    }
  });
});

function updatePlayer(p) {
  if (!p.alive) return;

  let turn = normalizeAngle(
    p.targetAngle - p.angle
  );

  p.angle += turn * 0.20;

  let speed = 6.5;

  if (p.boost && p.length > 38) {
    speed = 10.5;
    p.length -= 0.06;
  }

  p.x += Math.cos(p.angle) * speed;
  p.y += Math.sin(p.angle) * speed;

  if (
    p.x < 80 ||
    p.x > WORLD - 80 ||
    p.y < 80 ||
    p.y > WORLD - 80
  ) {
    p.alive = false;
    return;
  }

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
}

function distance(a, b) {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );
}

function collisionCheck(room) {
  const players = [...room.players.values()];

  for (const a of players) {
    if (!a.alive) continue;

    // Own body
    for (let i = 10; i < a.body.length; i += 2) {
      if (
        Math.hypot(
          a.x - a.body[i].x,
          a.y - a.body[i].y
        ) < 22
      ) {
        a.alive = false;
        break;
      }
    }

    if (!a.alive) continue;

    // Other bodies
    for (const b of players) {
      if (a === b || !b.alive) continue;

      for (let i = 5; i < b.body.length; i += 2) {
        if (
          Math.hypot(
            a.x - b.body[i].x,
            a.y - b.body[i].y
          ) < 25
        ) {
          a.alive = false;
          b.kills++;
          b.score += 100;
          b.length += 12;
          break;
        }
      }

      if (!a.alive) break;
    }
  }
}

setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      updatePlayer(p);
    }

    collisionCheck(room);

    broadcast(room, state(room));
  }
}, TICK);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Worm Arena running on port ${PORT}`);
});
