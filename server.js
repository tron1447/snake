const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 20000;

const server = http.createServer((req, res) => {
  let url = req.url.split("?")[0];

  if (url === "/") url = "/index.html";

  const file = path.join(__dirname, url);

  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(file);

  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };

  res.writeHead(200, {
    "Content-Type": types[ext] || "text/plain"
  });

  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function code() {
  let c;

  do {
    c = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
  } while (rooms.has(c));

  return c;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function makeBody(p) {
  const body = [];

  const count = Math.max(10, Math.floor(p.length));

  for (let i = 0; i < count; i++) {
    body.push({
      x: p.x - Math.cos(p.angle) * i * 7,
      y: p.y - Math.sin(p.angle) * i * 7
    });
  }

  return body;
}

function lobby(room) {
  const players = [];

  for (const p of room.players.values()) {
    players.push({
      id: p.id,
      name: p.name,
      color: p.color,
      skin: p.skin,
      host: p.host,
      alive: p.alive
    });
  }

  for (const p of room.players.values()) {
    send(p.ws, {
      type: "lobby",
      players
    });
  }
}

function broadcast(room, data) {
  for (const p of room.players.values()) {
    send(p.ws, data);
  }
}

function gameState(room) {
  const players = {};

  for (const [id, p] of room.players) {
    players[id] = {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      angle: p.angle,
      length: p.length,
      color: p.color,
      skin: p.skin,
      alive: p.alive,
      body: makeBody(p)
    };
  }

  for (const p of room.players.values()) {
    send(p.ws, {
      type: "players",
      players
    });
  }
}

function killPlayer(room, victim, killer) {
  if (!victim.alive) return;

  victim.alive = false;

  send(victim.ws, {
    type: "gameOver",
    reason: killer
      ? killer.name + " tappis sind!"
      : "Sind tapetud!"
  });

  if (killer) {
    send(killer.ws, {
      type: "kill",
      name: victim.name
    });
  }

  const food = [];

  for (let i = 0; i < Math.min(80, Math.floor(victim.length)); i++) {
    food.push({
      x: victim.x + (Math.random() - 0.5) * 250,
      y: victim.y + (Math.random() - 0.5) * 250,
      value: 2
    });
  }

  broadcast(room, {
    type: "deathFood",
    food
  });
}

function collisionCheck(room) {
  const players = [...room.players.values()]
    .filter(p => p.alive);

  for (const victim of players) {
    for (const attacker of players) {
      if (victim === attacker) continue;

      const body = makeBody(attacker);

      for (let i = 8; i < body.length; i += 2) {
        const point = body[i];

        if (
          Math.hypot(
            victim.x - point.x,
            victim.y - point.y
          ) < 22
        ) {
          killPlayer(room, victim, attacker);
          break;
        }
      }

      if (!victim.alive) break;
    }
  }
}

wss.on("connection", ws => {
  const player = {
    ws,
    id: Math.random()
      .toString(36)
      .substring(2, 10),

    name: "Player",
    color: "#63ff78",
    skin: "green",

    room: null,
    host: false,

    x: WORLD / 2,
    y: WORLD / 2,

    angle: 0,
    length: 20,

    alive: true
  };

  ws.player = player;

  ws.on("message", raw => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "createRoom") {
      if (player.room) return;

      const roomCode = code();

      const room = {
        code: roomCode,
        started: false,
        players: new Map()
      };

      player.name =
        String(data.name || "Player")
          .substring(0, 16);

      player.color =
        String(data.color || "#63ff78");

      player.skin =
        String(data.skin || "green");

      player.room = room;
      player.host = true;

      room.players.set(player.id, player);

      rooms.set(roomCode, room);

      send(ws, {
        type: "roomCreated",
        code: roomCode,
        id: player.id
      });

      lobby(room);
      return;
    }

    if (data.type === "joinRoom") {
      const roomCode =
        String(data.code || "")
          .trim()
          .toUpperCase();

      const room = rooms.get(roomCode);

      if (!room) {
        send(ws, {
          type: "error",
          message: "Seda roomi ei ole."
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

      if (room.players.size >= 20) {
        send(ws, {
          type: "error",
          message: "Room on täis."
        });
        return;
      }

      player.name =
        String(data.name || "Player")
          .substring(0, 16);

      player.color =
        String(data.color || "#4da6ff");

      player.skin =
        String(data.skin || "blue");

      player.room = room;
      player.host = false;

      room.players.set(player.id, player);

      send(ws, {
        type: "roomJoined",
        code: roomCode,
        id: player.id
      });

      lobby(room);
      return;
    }

    if (data.type === "startGame") {
      const room = player.room;

      if (!room || !player.host) return;

      room.started = true;

      for (const p of room.players.values()) {
        p.alive = true;

        p.x =
          2000 +
          Math.random() * (WORLD - 4000);

        p.y =
          2000 +
          Math.random() * (WORLD - 4000);

        p.angle =
          Math.random() * Math.PI * 2;

        p.length = 20;

        send(p.ws, {
          type: "gameStart",
          id: p.id,
          x: p.x,
          y: p.y
        });
      }

      return;
    }

    if (data.type === "state") {
      if (!player.room) return;
      if (!player.room.started) return;
      if (!player.alive) return;

      if (Number.isFinite(data.x)) {
        player.x = Math.max(
          20,
          Math.min(WORLD - 20, data.x)
        );
      }

      if (Number.isFinite(data.y)) {
        player.y = Math.max(
          20,
          Math.min(WORLD - 20, data.y)
        );
      }

      if (Number.isFinite(data.angle)) {
        player.angle = data.angle;
      }

      if (Number.isFinite(data.length)) {
        player.length =
          Math.max(20, Math.min(1000, data.length));
      }

      if (typeof data.color === "string") {
        player.color =
          data.color.substring(0, 20);
      }

      if (typeof data.skin === "string") {
        player.skin =
          data.skin.substring(0, 20);
      }

      if (typeof data.name === "string") {
        player.name =
          data.name.substring(0, 16);
      }
    }
  });

  ws.on("close", () => {
    const room = player.room;

    if (!room) return;

    room.players.delete(player.id);

    if (player.host) {
      const next =
        room.players.values().next().value;

      if (next) {
        next.host = true;
      }
    }

    if (room.players.size === 0) {
      rooms.delete(room.code);
    } else {
      lobby(room);
    }
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.started) continue;

    collisionCheck(room);
    gameState(room);
  }
}, 100);

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    "Snake Arena running on port " + PORT
  );
});
