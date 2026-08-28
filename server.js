const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const WORLD = 12000;

app.use(express.static(__dirname));

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

function makeCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 7).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .trim()
    .substring(0, 16) || "Player";
}

const colors = [
  "#53ff69",
  "#39a9ff",
  "#ff4f70",
  "#ffd447",
  "#b96cff",
  "#ff8b42",
  "#27e0c0",
  "#ff5bc8"
];

function randomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

function spawn() {
  return {
    x: 700 + Math.random() * (WORLD - 1400),
    y: 700 + Math.random() * (WORLD - 1400)
  };
}

function resetPlayer(p) {
  const s = spawn();

  p.x = s.x;
  p.y = s.y;

  p.angle = Math.random() * Math.PI * 2;
  p.targetAngle = p.angle;

  p.length = 70;
  p.score = 0;
  p.kills = 0;

  p.alive = true;
  p.boost = false;

  p.body = [];

  for (let i = 0; i < p.length; i++) {
    p.body.push({
      x: p.x - Math.cos(p.angle) * i * 7,
      y: p.y - Math.sin(p.angle) * i * 7
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

function update(p) {
  if (!p.alive) return;

  let diff = p.targetAngle - p.angle;

  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  p.angle += diff * 0.18;

  let speed = 7.2;

  if (p.boost && p.length > 50) {
    speed = 11.5;
    p.length -= 0.11;
  }

  p.x += Math.cos(p.angle) * speed;
  p.y += Math.sin(p.angle) * speed;

  if (
    p.x < 35 ||
    p.x > WORLD - 35 ||
    p.y < 35 ||
    p.y > WORLD - 35
  ) {
    p.alive = false;
    return;
  }

  p.body.unshift({
    x: p.x,
    y: p.y
  });

  const wanted = Math.max(50, Math.floor(p.length));

  while (p.body.length < wanted) {
    const last = p.body[p.body.length - 1];
    p.body.push({
      x: last.x,
      y: last.y
    });
  }

  while (p.body.length > wanted) {
    p.body.pop();
  }
}

function collide(room) {
  const players = [...room.players.values()];

  for (const attacker of players) {
    if (!attacker.alive) continue;

    for (const victim of players) {
      if (attacker === victim || !victim.alive) continue;

      for (let i = 10; i < victim.body.length; i += 2) {
        const b = victim.body[i];

        if (
          Math.hypot(
            attacker.x - b.x,
            attacker.y - b.y
          ) < 27
        ) {
          attacker.alive = false;
          victim.kills++;
          victim.score += 100;
          victim.length += 18;
          break;
        }
      }

      if (!attacker.alive) break;
    }
  }
}

wss.on("connection", ws => {
  const p = {
    id: Math.random().toString(36).substring(2, 10),
    ws,
    room: null,

    name: "Player",
    color: randomColor(),

    x: 0,
    y: 0,

    angle: 0,
    targetAngle: 0,

    length: 70,
    score: 0,
    kills: 0,

    alive: true,
    boost: false,

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
      const code = makeCode();

      const room = {
        code,
        players: new Map()
      };

      rooms.set(code, room);

      p.name = cleanName(data.name);
      p.color = data.color || randomColor();

      resetPlayer(p);

      p.room = room;
      room.players.set(p.id, p);

      send(ws, {
        type: "roomCreated",
        code,
        id: p.id
      });

      broadcastState(room);
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

      if (room.players.size >= 20) {
        send(ws, {
          type: "error",
          message: "Room on täis."
        });
        return;
      }

      p.name = cleanName(data.name);
      p.color = data.color || randomColor();

      resetPlayer(p);

      p.room = room;
      room.players.set(p.id, p);

      send(ws, {
        type: "roomJoined",
        code,
        id: p.id
      });

      broadcastState(room);
      return;
    }

    if (data.type === "start") {
      if (!p.room) return;

      for (const x of p.room.players.values()) {
        resetPlayer(x);
      }

      broadcast(p.room, {
        type: "gameStart"
      });

      broadcastState(p.room);
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
      broadcastState(room);
    }
  });
});

function broadcastState(room) {
  broadcast(room, {
    type: "state",
    players: [...room.players.values()].map(publicPlayer)
  });
}

setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      update(p);
    }

    collide(room);
    broadcastState(room);
  }
}, 50);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Snake Arena running on ${PORT}`);
});
