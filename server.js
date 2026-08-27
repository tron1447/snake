const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 20000;
const rooms = new Map();

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function roomCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .substring(0, 16) || "Player";
}

function broadcastLobby(room) {
  const players = [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    host: p.host
  }));

  for (const p of room.players.values()) {
    send(p.ws, {
      type: "lobby",
      players
    });
  }
}

function broadcastPlayers(room) {
  const players = {};

  for (const p of room.players.values()) {
    players[p.id] = {
      x: p.x,
      y: p.y,
      angle: p.angle,
      length: p.length,
      color: p.color,
      skin: p.skin,
      name: p.name,
      alive: p.alive
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

  if (killer) {
    killer.length += Math.max(3, victim.length * 0.25);

    send(killer.ws, {
      type: "kill",
      name: victim.name
    });
  }

  send(victim.ws, {
    type: "gameOver",
    reason: killer
      ? `${killer.name} tappis sind!`
      : "Sind tapeti!"
  });
}

function checkCombat(room) {
  const players = [...room.players.values()];

  for (const a of players) {
    if (!a.alive) continue;

    for (const b of players) {
      if (a === b || !b.alive) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;

      if (Math.hypot(dx, dy) > 120) continue;

      /*
       * Suurema snake'i pea puudutab väiksema snake'i keha.
       */
      const aRadius = 22;
      const bRadius = 10;

      if (a.length <= b.length) continue;

      const bodyLength = Math.min(
        Math.floor(b.length),
        180
      );

      for (let i = 4; i < bodyLength; i++) {
        const bx =
          b.x - Math.cos(b.angle) * i * 8;

        const by =
          b.y - Math.sin(b.angle) * i * 8;

        if (
          Math.hypot(a.x - bx, a.y - by) <
          aRadius + bRadius
        ) {
          killPlayer(room, b, a);
          break;
        }
      }
    }
  }
}

const server = http.createServer((req, res) => {
  let requested = req.url.split("?")[0];

  if (requested === "/") {
    requested = "/index.html";
  }

  const file = path.join(__dirname, requested);

  if (!file.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

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

wss.on("connection", ws => {
  const player = {
    ws,
    id: Math.random().toString(36).substring(2, 10),
    name: "Player",
    color: "#63ff78",
    skin: "green",
    room: null,
    host: false,

    x: 10000,
    y: 10000,
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

    /* CREATE */
    if (data.type === "createRoom") {
      if (player.room) return;

      const code = roomCode();

      const room = {
        code,
        started: false,
        players: new Map()
      };

      player.name = cleanName(data.name);
      player.color =
        typeof data.color === "string"
          ? data.color
          : "#63ff78";

      player.skin =
        typeof data.skin === "string"
          ? data.skin
          : "green";

      player.room = room;
      player.host = true;

      room.players.set(player.id, player);
      rooms.set(code, room);

      send(ws, {
        type: "roomCreated",
        code,
        id: player.id,
        host: true
      });

      broadcastLobby(room);
      return;
    }

    /* JOIN */
    if (data.type === "joinRoom") {
      const code =
        String(data.code || "")
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

      player.name = cleanName(data.name);

      player.color =
        typeof data.color === "string"
          ? data.color
          : "#4da6ff";

      player.skin =
        typeof data.skin === "string"
          ? data.skin
          : "blue";

      player.room = room;
      player.host = false;

      room.players.set(player.id, player);

      send(ws, {
        type: "roomJoined",
        code,
        id: player.id,
        host: false
      });

      broadcastLobby(room);
      return;
    }

    /* START */
    if (data.type === "startGame") {
      const room = player.room;

      if (!room || !player.host) return;

      room.started = true;

      for (const p of room.players.values()) {
        p.x =
          3000 +
          Math.random() * (WORLD - 6000);

        p.y =
          3000 +
          Math.random() * (WORLD - 6000);

        p.angle =
          Math.random() * Math.PI * 2;

        p.length = 20;
        p.alive = true;

        send(p.ws, {
          type: "gameStart",
          id: p.id,
          x: p.x,
          y: p.y,
          angle: p.angle
        });
      }

      return;
    }

    /* STATE */
    if (data.type === "state") {
      if (!player.room || !player.room.started) return;
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
        player.length = Math.max(
          20,
          Math.min(1000, data.length)
        );
      }

      if (typeof data.color === "string") {
        player.color = data.color;
      }

      if (typeof data.skin === "string") {
        player.skin = data.skin;
      }

      if (typeof data.name === "string") {
        player.name = cleanName(data.name);
      }
    }

    /* RESTART */
    if (data.type === "restart") {
      if (!player.room) return;

      player.alive = true;
      player.length = 20;
      player.x =
        3000 + Math.random() * 14000;
      player.y =
        3000 + Math.random() * 14000;

      send(player.ws, {
        type: "gameStart",
        id: player.id,
        x: player.x,
        y: player.y,
        angle: player.angle
      });
    }
  });

  ws.on("close", () => {
    const room = player.room;

    if (!room) return;

    room.players.delete(player.id);

    if (player.host && room.players.size > 0) {
      const next =
        room.players.values().next().value;

      if (next) {
        next.host = true;

        send(next.ws, {
          type: "youAreHost"
        });
      }
    }

    if (room.players.size === 0) {
      rooms.delete(room.code);
    } else {
      broadcastLobby(room);
    }
  });
});

/* Multiplayer update */
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.started) continue;

    checkCombat(room);
    broadcastPlayers(room);
  }
}, 100);

server.listen(PORT, () => {
  console.log(`Snake Arena running on port ${PORT}`);
});
