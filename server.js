const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const WORLD = 20000;

const rooms = new Map();
const players = new Map();

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));

  return code;
}

function cleanName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .slice(0, 16) || "Player";
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data) {
  for (const playerId of room.players) {
    const p = players.get(playerId);
    if (p) send(p.ws, data);
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
    skin: p.skin,
    alive: p.alive
  };
}

function lobby(room) {
  const list = [];

  for (const playerId of room.players) {
    const p = players.get(playerId);
    if (p) list.push(publicPlayer(p));
  }

  broadcast(room, {
    type: "lobby",
    players: list
  });
}

function createPlayer(ws, data) {
  const p = {
    id: id(),
    ws,

    name: cleanName(data.name),
    color: data.color || "#63ff78",
    skin: data.skin || "green",

    room: null,
    started: false,
    alive: true,

    x: WORLD / 2,
    y: WORLD / 2,
    angle: 0,

    length: 25,
    score: 0,
    kills: 0
  };

  players.set(p.id, p);
  return p;
}

function createRoom(p) {
  const code = roomCode();

  const room = {
    code,
    host: p.id,
    players: new Set(),
    started: false
  };

  rooms.set(code, room);
  room.players.add(p.id);
  p.room = code;

  send(p.ws, {
    type: "roomCreated",
    id: p.id,
    code
  });

  lobby(room);
}

function joinRoom(p, code) {
  code = String(code || "").toUpperCase();

  const room = rooms.get(code);

  if (!room) {
    send(p.ws, {
      type: "error",
      message: "Roomi ei leitud."
    });
    return;
  }

  if (room.started) {
    send(p.ws, {
      type: "error",
      message: "Mäng on juba alanud."
    });
    return;
  }

  if (room.players.size >= 12) {
    send(p.ws, {
      type: "error",
      message: "Room on täis."
    });
    return;
  }

  room.players.add(p.id);
  p.room = code;

  send(p.ws, {
    type: "roomJoined",
    id: p.id,
    code
  });

  lobby(room);
}

function startGame(p) {
  if (!p.room) return;

  const room = rooms.get(p.room);
  if (!room) return;

  if (room.host !== p.id) {
    send(p.ws, {
      type: "error",
      message: "Ainult roomi looja saab mängu alustada."
    });
    return;
  }

  room.started = true;

  for (const playerId of room.players) {
    const x = players.get(playerId);

    if (!x) continue;

    x.started = true;
    x.alive = true;

    x.x = 2000 + Math.random() * 16000;
    x.y = 2000 + Math.random() * 16000;
    x.angle = Math.random() * Math.PI * 2;
    x.length = 25;
    x.score = 0;
    x.kills = 0;

    send(x.ws, {
      type: "gameStart",
      id: x.id
    });
  }
}

function updatePlayer(p, data) {
  if (!p.started || !p.alive) return;

  p.x = Math.max(
    20,
    Math.min(WORLD - 20, Number(data.x) || p.x)
  );

  p.y = Math.max(
    20,
    Math.min(WORLD - 20, Number(data.y) || p.y)
  );

  if (Number.isFinite(Number(data.angle))) {
    p.angle = Number(data.angle);
  }

  p.length = Math.max(
    15,
    Math.min(500, Number(data.length) || p.length)
  );

  p.score = Number(data.score) || p.score;
  p.kills = Number(data.kills) || p.kills;

  p.name = cleanName(data.name);
  p.color = data.color || p.color;
  p.skin = data.skin || p.skin;
}

function bodyOf(p) {
  const body = [];

  for (let i = 0; i < Math.floor(p.length); i++) {
    body.push({
      x: p.x - Math.cos(p.angle) * i * 8,
      y: p.y - Math.sin(p.angle) * i * 8
    });
  }

  return body;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function collisions() {
  for (const room of rooms.values()) {
    if (!room.started) continue;

    const alive = [];

    for (const pid of room.players) {
      const p = players.get(pid);

      if (p && p.alive && p.started) {
        alive.push(p);
      }
    }

    for (const attacker of alive) {
      if (!attacker.alive) continue;

      for (const victim of alive) {
        if (attacker.id === victim.id) continue;
        if (!victim.alive) continue;

        const body = bodyOf(victim);

        // Jätame pea lähedase osa vahele.
        for (let i = 7; i < body.length; i++) {
          if (distance(attacker, body[i]) < 24) {
            kill(attacker, victim);
            break;
          }
        }

        if (!attacker.alive) break;
      }
    }
  }
}

function kill(killer, dead) {
  if (!dead.alive) return;

  dead.alive = false;

  killer.kills++;
  killer.score += 10;

  send(dead.ws, {
    type: "gameOver",
    reason: killer.name + " tappis su!"
  });

  send(killer.ws, {
    type: "kill",
    kills: killer.kills,
    score: killer.score,
    coins: 10
  });

  const room = rooms.get(dead.room);

  if (room) {
    broadcast(room, {
      type: "playerKilled",
      deadId: dead.id,
      killerId: killer.id
    });
  }

  setTimeout(() => {
    if (!players.has(dead.id)) return;

    dead.alive = true;
    dead.x = 2000 + Math.random() * 16000;
    dead.y = 2000 + Math.random() * 16000;
    dead.angle = Math.random() * Math.PI * 2;
    dead.length = 25;
    dead.score = 0;
    dead.kills = 0;

    send(dead.ws, {
      type: "respawn"
    });
  }, 2500);
}

function sendWorld() {
  for (const room of rooms.values()) {
    if (!room.started) continue;

    const result = {};

    for (const pid of room.players) {
      const p = players.get(pid);

      if (p) {
        result[p.id] = publicPlayer(p);
      }
    }

    broadcast(room, {
      type: "players",
      players: result
    });
  }
}

function removePlayer(p) {
  if (!p) return;

  if (p.room) {
    const room = rooms.get(p.room);

    if (room) {
      room.players.delete(p.id);

      if (room.players.size === 0) {
        rooms.delete(room.code);
      } else {
        if (room.host === p.id) {
          room.host = [...room.players][0];
        }

        lobby(room);
      }
    }
  }

  players.delete(p.id);
}

const server = http.createServer((req, res) => {
  let file = req.url === "/"
    ? path.join(__dirname, "index.html")
    : path.join(__dirname, req.url);

  if (req.url !== "/" && req.url !== "/index.html") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end("index.html missing");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  let p = null;

  ws.on("message", raw => {
    try {
      const data = JSON.parse(raw.toString());

      if (!p) {
        p = createPlayer(ws, data);
      }

      if (data.type === "hello") {
        p.name = cleanName(data.name);
        p.color = data.color || p.color;
        p.skin = data.skin || p.skin;
      }

      if (data.type === "createRoom") {
        if (!p.room) createRoom(p);
      }

      if (data.type === "joinRoom") {
        if (!p.room) joinRoom(p, data.code);
      }

      if (data.type === "startGame") {
        startGame(p);
      }

      if (data.type === "state") {
        updatePlayer(p, data);
      }

    } catch (e) {
      console.log("WebSocket error:", e.message);
    }
  });

  ws.on("close", () => {
    removePlayer(p);
  });

  ws.on("error", () => {
    removePlayer(p);
  });
});

setInterval(collisions, 50);
setInterval(sendWorld, 50);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Snake Arena running on port " + PORT);
});
