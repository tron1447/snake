const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const filePath = path.join(__dirname, urlPath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("404 - Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  res.writeHead(200, {
    "Content-Type": contentTypes[ext] || "application/octet-stream"
  });

  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();

function makeRoomCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendLobby(room) {
  const players = [];

  for (const player of room.players.values()) {
    players.push({
      id: player.id,
      name: player.name,
      color: player.color,
      skin: player.skin,
      host: player.host
    });
  }

  for (const player of room.players.values()) {
    send(player.ws, {
      type: "lobby",
      players
    });
  }
}

function sendPlayers(room) {
  const players = {};

  for (const [id, player] of room.players) {
    players[id] = {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      angle: player.angle,
      length: player.length,
      color: player.color,
      skin: player.skin,
      alive: player.alive
    };
  }

  for (const player of room.players.values()) {
    send(player.ws, {
      type: "players",
      players
    });
  }
}

wss.on("connection", (ws) => {
  const player = {
    ws,
    id: Math.random().toString(36).substring(2, 10),
    name: "Player",
    room: null,
    host: false,

    x: 10000,
    y: 10000,
    angle: 0,
    length: 20,

    color: "#63ff78",
    skin: "green",

    alive: true
  };

  ws.player = player;

  ws.on("message", (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "createRoom") {
      if (player.room) return;

      const code = makeRoomCode();

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

      sendLobby(room);
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
          message: "Seda tuba ei ole olemas."
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
          message: "Tuba on täis."
        });
        return;
      }

      player.name = String(data.name || "Player").substring(0, 16);
      player.color = String(data.color || "#4da6ff");
      player.skin = String(data.skin || "blue");

      player.room = room;
      player.host = false;

      room.players.set(player.id, player);

      send(ws, {
        type: "roomJoined",
        code,
        id: player.id
      });

      sendLobby(room);
      return;
    }

    if (data.type === "startGame") {
      const room = player.room;

      if (!room) return;
      if (!player.host) return;

      room.started = true;

      for (const p of room.players.values()) {
        p.alive = true;

        p.x = 3000 + Math.random() * 14000;
        p.y = 3000 + Math.random() * 14000;
        p.angle = Math.random() * Math.PI * 2;
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
        player.x = data.x;
      }

      if (Number.isFinite(data.y)) {
        player.y = data.y;
      }

      if (Number.isFinite(data.angle)) {
        player.angle = data.angle;
      }

      if (Number.isFinite(data.length)) {
        player.length = Math.max(20, data.length);
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
      sendLobby(room);
    }
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.started) {
      sendPlayers(room);
    }
  }
}, 100);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Snake Arena server running on port ${PORT}`);
});
