const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const WORLD = 18000;
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

function code() {
  let c;
  do {
    c = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();
  } while (rooms.has(c));
  return c;
}

function cleanName(n) {
  return String(n || "Player")
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

function reset(p) {
  const s = spawn();

  p.x = s.x;
  p.y = s.y;

  p.angle = Math.random() * Math.PI * 2;
  p.length = 30;

  p.score = 0;
  p.kills = 0;

  p.alive = true;
  p.boosting = false;

  p.body = [];

  for (let i = 0; i < 30; i++) {
    p.body.push({
      x: p.x - Math.cos(p.angle) * i * 8,
      y: p.y - Math.sin(p.angle) * i * 8
    });
  }
}

function playerData(p) {
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
    boosting: p.boosting,
    body: p.body.slice(0, 220)
  };
}

function state(room) {
  return {
    type: "state",
    players: [...room.players.values()].map(playerData)
  };
}

wss.on("connection", ws => {

  const p = {
    id: Math.random().toString(36).substring(2, 10),
    ws,
    room: null,

    name: "Player",
    color: "#63ff78",

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

  reset(p);

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

    if (data.type === "create") {

      if (p.room) {
        p.room.players.delete(p.id);
      }

      const roomCode = code();

      const room = {
        code: roomCode,
        players: new Map()
      };

      rooms.set(roomCode, room);

      p.name = cleanName(data.name);

      if (typeof data.color === "string") {
        p.color = data.color;
      }

      reset(p);

      p.room = room;
      room.players.set(p.id, p);

      send(ws, {
        type: "created",
        code: roomCode,
        id: p.id
      });

      broadcast(room, state(room));

      return;
    }

    if (data.type === "join") {

      const roomCode =
        String(data.code || "")
          .trim()
          .toUpperCase();

      const room = rooms.get(roomCode);

      if (!room) {
        send(ws, {
          type: "error",
          message: "Roomi ei leitud."
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

      if (p.room) {
        p.room.players.delete(p.id);
      }

      p.name = cleanName(data.name);

      if (typeof data.color === "string") {
        p.color = data.color;
      }

      reset(p);

      p.room = room;
      room.players.set(p.id, p);

      send(ws, {
        type: "joined",
        code: roomCode,
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

      if (!p.room || !p.alive) return;

      if (Number.isFinite(data.angle)) {
        p.targetAngle = data.angle;
      }

      p.boosting = data.boosting === true;

      p.lastInput = Date.now();

      return;
    }

    if (data.type === "disconnectRoom") {

      if (p.room) {
        const r = p.room;

        r.players.delete(p.id);

        p.room = null;

        if (r.players.size === 0) {
          rooms.delete(r.code);
        } else {
          broadcast(r, state(r));
        }
      }

      return;
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

/*
SERVER PHYSICS
*/

setInterval(() => {

  for (const room of rooms.values()) {

    for (const p of room.players.values()) {

      if (!p.alive) continue;

      let diff =
        p.targetAngle - p.angle;

      while (diff > Math.PI) {
        diff -= Math.PI * 2;
      }

      while (diff < -Math.PI) {
        diff += Math.PI * 2;
      }

      p.angle += diff * 0.18;

      const speed =
        p.boosting ? 10.5 : 7.5;

      p.x += Math.cos(p.angle) * speed;
      p.y += Math.sin(p.angle) * speed;

      p.x = Math.max(30, Math.min(WORLD - 30, p.x));
      p.y = Math.max(30, Math.min(WORLD - 30, p.y));

      p.body.unshift({
        x: p.x,
        y: p.y
      });

      if (p.boosting && p.length > 32) {
        p.length -= 0.015;
      }

      const target =
        Math.max(30, Math.floor(p.length));

      while (p.body.length < target) {

        const last =
          p.body[p.body.length - 1] || {
            x: p.x,
            y: p.y
          };

        p.body.push({
          x: last.x,
          y: last.y
        });
      }

      while (p.body.length > target) {
        p.body.pop();
      }

      if (Date.now() - p.lastInput > 5000) {
        p.boosting = false;
      }
    }

    broadcast(room, state(room));
  }

}, 50);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Snake Arena running on ${PORT}`);
});
