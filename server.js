const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;
const WORLD = 20000;

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const rooms = new Map();
const clients = new Map();

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  if (rooms.has(code)) return randomCode();

  return code;
}

function id() {
  return Math.random().toString(36).slice(2, 10);
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

function lobbyData(room) {
  return [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    skin: p.skin,
    host: p.id === room.host
  }));
}

function createRoom(ws, data) {
  const code = randomCode();

  const room = {
    code,
    host: null,
    started: false,
    players: new Map()
  };

  rooms.set(code, room);

  addPlayer(room, ws, data);

  room.host = clients.get(ws).id;

  send(ws, {
    type: "roomCreated",
    code,
    id: clients.get(ws).id
  });

  broadcast(room, {
    type: "lobby",
    players: lobbyData(room)
  });
}

function addPlayer(room, ws, data) {
  const player = {
    id: id(),
    ws,

    name: String(data.name || "Player").slice(0, 16),

    color: data.color || "#63ff78",

    skin: data.skin || "green",

    x: 3000 + Math.random() * 14000,
    y: 3000 + Math.random() * 14000,

    angle: Math.random() * Math.PI * 2,

    length: 25,

    score: 0,

    kills: 0,

    body: [],

    alive: true,

    lastUpdate: Date.now()
  };

  player.body = makeBody(player);

  room.players.set(player.id, player);
  clients.set(ws, {
    id: player.id,
    room: room.code
  });

  return player;
}

function makeBody(p) {
  const result = [];

  const count = Math.max(20, Math.floor(p.length));

  for (let i = 0; i < count; i++) {
    result.push({
      x: p.x - Math.cos(p.angle) * i * 8,
      y: p.y - Math.sin(p.angle) * i * 8
    });
  }

  return result;
}

function joinRoom(ws, data) {
  const code = String(data.code || "").toUpperCase();

  const room = rooms.get(code);

  if (!room) {
    send(ws, {
      type: "error",
      message: "Roomi ei leitud."
    });
    return;
  }

  if (room.started) {
    send(ws, {
      type: "error",
      message: "Mäng on juba alanud."
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

  const player = addPlayer(room, ws, data);

  send(ws, {
    type: "roomJoined",
    code,
    id: player.id
  });

  broadcast(room, {
    type: "lobby",
    players: lobbyData(room)
  });
}

function startRoom(ws) {
  const info = clients.get(ws);

  if (!info) return;

  const room = rooms.get(info.room);

  if (!room) return;

  if (room.host !== info.id) {
    send(ws, {
      type: "error",
      message: "Ainult roomi looja saab mängu alustada."
    });
    return;
  }

  room.started = true;

  for (const p of room.players.values()) {
    p.alive = true;
    p.x = 2500 + Math.random() * 15000;
    p.y = 2500 + Math.random() * 15000;
    p.angle = Math.random() * Math.PI * 2;
    p.length = 25;
    p.score = 0;
    p.kills = 0;
    p.body = makeBody(p);

    send(p.ws, {
      type: "gameStart",
      id: p.id
    });
  }
}

function updatePlayer(ws, data) {
  const info = clients.get(ws);

  if (!info) return;

  const room = rooms.get(info.room);

  if (!room || !room.started) return;

  const p = room.players.get(info.id);

  if (!p || !p.alive) return;

  if (typeof data.x === "number") p.x = data.x;
  if (typeof data.y === "number") p.y = data.y;
  if (typeof data.angle === "number") p.angle = data.angle;
  if (typeof data.length === "number") {
    p.length = Math.max(20, Math.min(1000, data.length));
  }

  if (typeof data.score === "number") p.score = data.score;

  if (typeof data.kills === "number") p.kills = data.kills;

  if (Array.isArray(data.body)) {
    p.body = data.body
      .slice(0, 1000)
      .filter(
        q =>
          q &&
          Number.isFinite(q.x) &&
          Number.isFinite(q.y)
      );
  }

  p.lastUpdate = Date.now();
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function checkKills(room) {
  const players = [...room.players.values()].filter(
    p => p.alive
  );

  for (const attacker of players) {
    if (!attacker.body.length) continue;

    const head = attacker.body[0];

    for (const victim of players) {
      if (attacker.id === victim.id) continue;
      if (!victim.body.length) continue;

      /*
       Snake.io stiilis:
       sinu pea ei tohi teise pea vastu minna,
       vaid pea vastu teise mao keha.
      */

      let hit = false;

      const maxCheck = Math.min(
        victim.body.length,
        1000
      );

      for (let i = 5; i < maxCheck; i++) {
        const segment = victim.body[i];

        if (distance(head, segment) < 16) {
          hit = true;
          break;
        }
      }

      if (!hit) continue;

      victim.alive = false;

      attacker.kills += 1;
      attacker.score += 100;

      /*
       Tapetud mao keha muutub toiduks.
      */

      const dropped = victim.body.filter(
        (_, i) => i % 3 === 0
      );

      send(victim.ws, {
        type: "gameOver",
        reason: "🐍 Sind tapeti!"
      });

      broadcast(room, {
        type: "playerKilled",
        id: victim.id,
        killer: attacker.id,
        killerName: attacker.name,
        dropped
      });

      /*
       Väikesed tükkidena maha jäänud osad
       saadetakse kõigile mängijatele.
      */

      setTimeout(() => {
        if (victim.alive) return;

        victim.x = 1000 + Math.random() * 18000;
        victim.y = 1000 + Math.random() * 18000;
        victim.length = 20;
        victim.body = makeBody(victim);
      }, 3000);
    }
  }
}

function sendPlayers(room) {
  const players = {};

  for (const p of room.players.values()) {
    if (!p.alive) continue;

    players[p.id] = {
      id: p.id,
      name: p.name,
      color: p.color,
      skin: p.skin,
      x: p.x,
      y: p.y,
      angle: p.angle,
      length: p.length,
      score: p.score,
      kills: p.kills,

      /*
       Oluline:
       saadame päris keha, mitte ainult pikkuse.
      */

      body: p.body.slice(0, 1000)
    };
  }

  broadcast(room, {
    type: "players",
    players
  });
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.started) continue;

    checkKills(room);
    sendPlayers(room);
  }
}, 50);

wss.on("connection", ws => {
  ws.on("message", raw => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      send(ws, {
        type: "error",
        message: "Vigane sõnum."
      });
      return;
    }

    switch (data.type) {
      case "createRoom":
        createRoom(ws, data);
        break;

      case "joinRoom":
        joinRoom(ws, data);
        break;

      case "startGame":
        startRoom(ws);
        break;

      case "state":
        updatePlayer(ws, data);
        break;
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);

    if (!info) return;

    const room = rooms.get(info.room);

    if (room) {
      room.players.delete(info.id);

      if (room.host === info.id) {
        const next = room.players.values().next();

        if (!next.done) {
          room.host = next.value.id;
        }
      }

      if (room.players.size === 0) {
        rooms.delete(room.code);
      } else {
        broadcast(room, {
          type: "lobby",
          players: lobbyData(room)
        });
      }
    }

    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Snake Arena running on port ${PORT}`);
});
