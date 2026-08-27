const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const rooms = new Map();
const players = new Map();

function randomCode() {
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
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastRoom(room, data) {
  if (!room) return;

  for (const id of room.players) {
    const p = players.get(id);

    if (p) {
      send(p.ws, data);
    }
  }
}

function lobbyData(room) {
  return [...room.players]
    .map(id => players.get(id))
    .filter(Boolean)
    .map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      skin: p.skin,
      host: p.id === room.host
    }));
}

function sendLobby(room) {
  broadcastRoom(room, {
    type: "lobby",
    players: lobbyData(room)
  });
}

function roomPlayers(room) {
  const result = {};

  for (const id of room.players) {
    const p = players.get(id);

    if (!p) continue;

    result[id] = {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      angle: p.angle,
      length: p.length,
      color: p.color,
      skin: p.skin,
      score: p.score,
      kills: p.kills,
      alive: p.alive
    };
  }

  return result;
}

function sendWorld(room) {
  broadcastRoom(room, {
    type: "players",
    players: roomPlayers(room)
  });
}

function removePlayer(ws) {
  const id = ws.playerId;

  if (!id) return;

  const p = players.get(id);

  if (!p) return;

  if (p.room) {
    const room = rooms.get(p.room);

    if (room) {
      room.players.delete(id);

      if (room.host === id) {
        const next = [...room.players][0];
        room.host = next || null;
      }

      if (room.players.size === 0) {
        rooms.delete(p.room);
      } else {
        sendLobby(room);
        sendWorld(room);
      }
    }
  }

  players.delete(id);
}

wss.on("connection", ws => {
  const id =
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 7);

  ws.playerId = id;

  players.set(id, {
    id,
    ws,
    name: "Player",
    color: "#63ff78",
    skin: "green",
    room: null,
    x: 10000,
    y: 10000,
    angle: 0,
    length: 20,
    score: 0,
    kills: 0,
    alive: false
  });

  send(ws, {
    type: "connected",
    id
  });

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

    const p = players.get(id);

    if (!p) return;

    if (data.type === "createRoom") {
      const code = randomCode();

      p.name = String(data.name || "Player").substring(0, 16);
      p.color = data.color || "#63ff78";
      p.skin = data.skin || "green";
      p.room = code;

      const room = {
        code,
        host: id,
        started: false,
        players: new Set([id])
      };

      rooms.set(code, room);

      send(ws, {
        type: "roomCreated",
        code,
        id
      });

      sendLobby(room);
      return;
    }

    if (data.type === "joinRoom") {
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

      p.name = String(data.name || "Player").substring(0, 16);
      p.color = data.color || "#4da6ff";
      p.skin = data.skin || "blue";
      p.room = code;

      room.players.add(id);

      send(ws, {
        type: "roomJoined",
        code,
        id
      });

      sendLobby(room);
      return;
    }

    if (data.type === "startGame") {
      if (!p.room) return;

      const room = rooms.get(p.room);

      if (!room) return;

      if (room.host !== id) {
        send(ws, {
          type: "error",
          message: "Ainult ruumi looja saab mängu alustada."
        });
        return;
      }

      room.started = true;

      for (const playerId of room.players) {
        const player = players.get(playerId);

        if (!player) continue;

        player.alive = true;
        player.score = 0;
        player.kills = 0;
        player.length = 20;
        player.x = 1000 + Math.random() * 18000;
        player.y = 1000 + Math.random() * 18000;
        player.angle = Math.random() * Math.PI * 2;

        send(player.ws, {
          type: "gameStart",
          id: player.id
        });
      }

      sendWorld(room);
      return;
    }

    if (data.type === "state") {
      if (!p.room) return;

      const room = rooms.get(p.room);

      if (!room || !room.started) return;

      if (typeof data.x === "number") p.x = data.x;
      if (typeof data.y === "number") p.y = data.y;
      if (typeof data.angle === "number") p.angle = data.angle;
      if (typeof data.length === "number") {
        p.length = Math.max(5, Math.min(1000, data.length));
      }

      if (typeof data.score === "number") {
        p.score = Math.max(0, data.score);
      }

      if (typeof data.kills === "number") {
        p.kills = Math.max(0, data.kills);
      }

      if (data.name) {
        p.name = String(data.name).substring(0, 16);
      }

      if (data.color) p.color = data.color;
      if (data.skin) p.skin = data.skin;

      sendWorld(room);
      return;
    }

    if (data.type === "kill") {
      if (!p.room) return;

      const room = rooms.get(p.room);

      if (!room || !room.started) return;

      const victim = players.get(data.target);

      if (!victim) return;
      if (!room.players.has(victim.id)) return;
      if (!victim.alive) return;
      if (victim.id === p.id) return;

      victim.alive = false;

      p.kills += 1;
      p.score += 100;
      p.length += Math.max(3, victim.length * 0.15);

      send(victim.ws, {
        type: "gameOver",
        reason: "Sind tapetud!",
        killer: p.name
      });

      send(p.ws, {
        type: "playerKilled",
        id: victim.id,
        name: victim.name
      });

      sendWorld(room);
      return;
    }
  });

  ws.on("close", () => {
    removePlayer(ws);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.started) {
      sendWorld(room);
    }
  }
}, 100);

server.listen(PORT, () => {
  console.log(`Snake Arena running on port ${PORT}`);
});
