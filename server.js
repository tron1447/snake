const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const rooms = new Map();

const server = http.createServer((req, res) => {
  let urlPath = req.url.split("?")[0];

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const filePath = path.join(__dirname, urlPath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const ext = path.extname(filePath);

  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Cache-Control": "no-cache"
  });

  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocket.Server({
  server
});

function makeCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}

function makeId() {
  return Math.random()
    .toString(36)
    .substring(2, 12);
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data) {
  for (const player of room.players.values()) {
    send(player.ws, data);
  }
}

function lobby(room) {
  const players = [];

  for (const p of room.players.values()) {
    players.push({
      id: p.id,
      name: p.name,
      color: p.color,
      host: p.host
    });
  }

  broadcast(room, {
    type: "lobby",
    players
  });
}

function playerData(room) {
  const result = {};

  for (const [id, p] of room.players) {
    result[id] = {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      angle: p.angle,
      length: p.length,
      color: p.color,
      skin: p.skin,
      alive: p.alive
    };
  }

  return result;
}

wss.on("connection", ws => {
  const player = {
    ws,
    id: makeId(),
    name: "Player",
    color: "#63ff78",
    skin: "green",
    x: 10000,
    y: 10000,
    angle: 0,
    length: 25,
    alive: true,
    room: null,
    host: false
  };

  ws.player = player;

  send(ws, {
    type: "connected",
    id: player.id
  });

  ws.on("message", raw => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "createRoom") {
      if (player.room) return;

      const code = makeCode();

      const room = {
        code,
        started: false,
        players: new Map()
      };

      player.name = String(data.name || "Player").substring(0, 16);
      player.color = String(data.color || "#63ff78");
      player.skin = String(data.skin || "green");
      player.room = room;
      player.host = true;

      room.players.set(player.id, player);
      rooms.set(code, room);

      send(ws, {
        type: "roomCreated",
        code,
        id: player.id
      });

      lobby(room);
      return;
    }

    if (data.type === "joinRoom") {
      const code = String(data.code || "")
        .trim()
        .toUpperCase();

      const room = rooms.get(code);

      if (!room) {
        return send(ws, {
          type: "error",
          message: "Seda roomi ei ole."
        });
      }

      if (room.started) {
        return send(ws, {
          type: "error",
          message: "Mäng on juba alanud."
        });
      }

      if (room.players.size >= 20) {
        return send(ws, {
          type: "error",
          message: "Room on täis."
        });
      }

      player.name = String(data.name || "Player").substring(0, 16);
      player.color = String(data.color || "#63ff78");
      player.skin = String(data.skin || "green");
      player.room = room;

      room.players.set(player.id, player);

      send(ws, {
        type: "roomJoined",
        code,
        id: player.id
      });

      lobby(room);
      return;
    }

    if (data.type === "startGame") {
      const room = player.room;

      if (!room) return;
      if (!player.host) return;

      room.started = true;

      for (const p of room.players.values()) {
        p.x = 3000 + Math.random() * 14000;
        p.y = 3000 + Math.random() * 14000;
        p.angle = Math.random() * Math.PI * 2;
        p.length = 25;
        p.alive = true;

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

      if (Number.isFinite(data.x)) player.x = data.x;
      if (Number.isFinite(data.y)) player.y = data.y;
      if (Number.isFinite(data.angle)) player.angle = data.angle;
      if (Number.isFinite(data.length)) {
        player.length = Math.max(10, Math.min(3000, data.length));
      }

      if (typeof data.color === "string") {
        player.color = data.color.substring(0, 20);
      }

      if (typeof data.skin === "string") {
        player.skin = data.skin.substring(0, 20);
      }

      if (typeof data.name === "string") {
        player.name = data.name.substring(0, 16);
      }

      return;
    }

    if (data.type === "kill") {
      const room = player.room;

      if (!room) return;

      const victim = room.players.get(String(data.victimId || ""));

      if (!victim) return;
      if (victim.id === player.id) return;
      if (!victim.alive) return;

      victim.alive = false;

      send(victim.ws, {
        type: "gameOver",
        reason: "Sind tapeti!"
      });

      broadcast(room, {
        type: "playerKilled",
        killerId: player.id,
        victimId: victim.id,
        killerName: player.name
      });

      return;
    }
  });

  ws.on("close", () => {
    const room = player.room;

    if (!room) return;

    room.players.delete(player.id);

    if (player.host) {
      const next = room.players.values().next().value;

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

    broadcast(room, {
      type: "players",
      players: playerData(room)
    });
  }
}, 80);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Snake Arena running on port ${PORT}`);
});
