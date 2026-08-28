const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const WORLD = 14000;
const TICK = 50;

app.use(express.static(__dirname));

const rooms = new Map();

const COLORS = [
  "#52ff6a",
  "#36a9ff",
  "#ff4d6d",
  "#ffd43b",
  "#b86cff",
  "#ff8b3d",
  "#24dfc0",
  "#ff58c8",
  "#9cff42",
  "#54e7ff"
];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function cleanName(name) {
  name = String(name || "Player")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 16);

  return name || "Player";
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

  p.length = 75;
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

function movePlayer(p) {
  if (!p.alive) return;

  let d = p.targetAngle - p.angle;

  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;

  p.angle += d * 0.16;

  let speed = 7.1;

  if (p.boost && p.length > 55) {
    speed = 11.5;

    p.length -= 0.14;
  }

  p.x += Math.cos(p.angle) * speed;
  p.y += Math.sin(p.angle) * speed;

  if (
    p.x < 35 ||
    p.y < 35 ||
    p.x > WORLD - 35 ||
    p.y > WORLD - 35
  ) {
    p.alive = false;
    return;
  }

  p.body.unshift({
    x: p.x,
    y: p.y
  });

  const wanted = Math.max(
    55,
    Math.floor(p.length)
  );

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

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function collision(room) {
  const players = [...room.players.values()];

  for (const attacker of players) {
    if (!attacker.alive) continue;

    for (const victim of players) {
      if (
        attacker === victim ||
        !victim.alive
      ) {
        continue;
      }

      /*
       * HEAD AGAINST BODY
       *
       * We skip the first few body pieces
       * so a snake cannot instantly kill
       * itself at its own neck.
       */

      for (
        let i = 10;
        i < victim.body.length;
        i += 2
      ) {
        if (
          distance(
            {
              x: attacker.x,
              y: attacker.y
            },
            victim.body[i]
          ) < 28
        ) {
          attacker.alive = false;

          victim.kills += 1;
          victim.score += 100;
          victim.length += 22;

          break;
        }
      }

      if (!attacker.alive) break;
    }
  }
}

function state(room) {
  broadcast(room, {
    type: "state",
    players: [
      ...room.players.values()
    ].map(publicPlayer)
  });
}

wss.on("connection", ws => {
  const p = {
    ws,

    id: Math.random()
      .toString(36)
      .slice(2, 10),

    room: null,

    name: "Player",
    color: randomColor(),

    x: 0,
    y: 0,

    angle: 0,
    targetAngle: 0,

    length: 75,
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
      const code = roomCode();

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

      state(room);

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

      state(room);

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

      state(p.room);

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
      state(room);
    }
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      movePlayer(p);
    }

    collision(room);
    state(room);
  }
}, TICK);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Snake Arena running on port " + PORT);
});
