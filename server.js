const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const WORLD = 10000;
const rooms = new Map();

function id() {
  return Math.random().toString(36).slice(2, 10);
}

function makeRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).slice(2, 7).toUpperCase();
  } while (rooms.has(code));
  return code;
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

function safeName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 16) || "Player";
}

function spawn() {
  return {
    x: 1000 + Math.random() * 8000,
    y: 1000 + Math.random() * 8000
  };
}

function reset(p) {
  const s = spawn();

  p.x = s.x;
  p.y = s.y;

  p.angle = Math.random() * Math.PI * 2;
  p.targetAngle = p.angle;

  p.length = 55;
  p.score = 0;
  p.kills = 0;
  p.boost = false;
  p.alive = true;

  p.body = [];

  for (let i = 0; i < 55; i++) {
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

function state(room) {
  return {
    type: "state",
    players: [...room.players.values()].map(publicPlayer)
  };
}

function updatePlayer(p) {
  if (!p.alive) return;

  let difference = p.targetAngle - p.angle;

  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;

  p.angle += difference * 0.20;

  let speed = 7;

  if (p.boost && p.length > 45) {
    speed = 11;
    p.length -= 0.10;
  }

  p.x += Math.cos(p.angle) * speed;
  p.y += Math.sin(p.angle) * speed;

  if (
    p.x < 40 ||
    p.x > WORLD - 40 ||
    p.y < 40 ||
    p.y > WORLD - 40
  ) {
    p.alive = false;
    return;
  }

  p.body.unshift({
    x: p.x,
    y: p.y
  });

  const wanted = Math.floor(p.length);

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

function collisions(room) {
  const players = [...room.players.values()];

  for (const a of players) {
    if (!a.alive) continue;

    for (const b of players) {
      if (a === b || !b.alive) continue;

      for (let i = 8; i < b.body.length; i += 2) {
        if (distance(a, b.body[i]) < 28) {
          a.alive = false;
          b.kills++;
          b.score += 100;
          b.length += 15;
          break;
        }
      }

      if (!a.alive) break;
    }
  }
}

wss.on("connection", ws => {
  const p = {
    id: id(),
    ws,
    room: null,

    name: "Player",
    color: "#61ff73",

    x: 0,
    y: 0,

    angle: 0,
    targetAngle: 0,

    length: 55,
    score: 0,
    kills: 0,

    boost: false,
    alive: true,

    body: []
  };

  reset(p);

  send(ws, {
    type: "connected",
    id: p.id
  });

  ws.on("message", message => {
    let data;

    try {
      data = JSON.parse(message.toString());
    } catch {
      return;
    }

    if (data.type === "createRoom") {
      const code = makeRoomCode();

      const room = {
        code,
        players: new Map()
      };

      rooms.set(code, room);

      p.name = safeName(data.name);
      p.color = typeof data.color === "string"
        ? data.color
        : "#61ff73";

      reset(p);

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
          message: "Seda roomi ei ole."
        });
        return;
      }

      if (room.players.size >= 16) {
        send(ws, {
          type: "error",
          message: "Room on täis."
        });
        return;
      }

      p.name = safeName(data.name);
      p.color = typeof data.color === "string"
        ? data.color
        : "#61ff73";

      reset(p);

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

    if (data.type === "start") {
      if (!p.room) return;

      for (const x of p.room.players.values()) {
        reset(x);
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

setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      updatePlayer(p);
    }

    collisions(room);

    broadcast(room, state(room));
  }
}, 50);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Worm Arena running on port " + PORT);
});
