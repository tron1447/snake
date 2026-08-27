const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const rooms = new Map();
const clients = new Map();

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

function randomId() {
  return Math.random().toString(36).substring(2) + Date.now();
}

function safeName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .substring(0, 16);
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastRoom(room, data) {
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

function sendLobby(room) {
  broadcastRoom(room, {
    type: "lobby",
    players: lobbyData(room)
  });
}

function playerData(p) {
  return {
    id: p.id,
    x: p.x,
    y: p.y,
    angle: p.angle,
    length: p.length,
    color: p.color,
    skin: p.skin,
    name: p.name,
    score: p.score,
    kills: p.kills,
    boosting: p.boosting
  };
}

function sendPlayers(room) {
  const players = {};

  for (const p of room.players.values()) {
    if (!p.started || p.dead) continue;
    players[p.id] = playerData(p);
  }

  broadcastRoom(room, {
    type: "players",
    players
  });
}

function killPlayer(room, victim, killer, reason) {
  if (!victim || victim.dead) return;

  victim.dead = true;

  if (killer && killer !== victim) {
    killer.kills += 1;
    killer.score += 100;
    killer.coins += 10;

    send(killer.ws, {
      type: "kill",
      coins: killer.coins,
      kills: killer.kills,
      score: killer.score,
      message: "+10 COINS"
    });
  }

  send(victim.ws, {
    type: "gameOver",
    reason: reason || "Sind tapetud!"
  });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function checkCollisions(room) {
  const alive = [...room.players.values()]
    .filter(p => p.started && !p.dead);

  for (const victim of alive) {
    const head = {
      x: victim.x,
      y: victim.y
    };

    for (const other of alive) {
      if (other === victim) continue;

      const dx = head.x - other.x;
      const dy = head.y - other.y;

      if (Math.hypot(dx, dy) < 38) {
        if (victim.length >= other.length) {
          killPlayer(
            room,
            other,
            victim,
            "Sõitsid vastasele otsa!"
          );
        } else {
          killPlayer(
            room,
            victim,
            other,
            "Sõitsid suurema mao sisse!"
          );
        }

        continue;
      }

      const checkLength = Math.min(
        Math.floor(other.length),
        180
      );

      for (let i = 7; i < checkLength; i++) {
        const bx =
          other.x -
          Math.cos(other.angle) * i * 10;

        const by =
          other.y -
          Math.sin(other.angle) * i * 10;

        if (
          Math.hypot(
            head.x - bx,
            head.y - by
          ) < 24
        ) {
          killPlayer(
            room,
            victim,
            other,
            "Sõitsid teise mao keha sisse!"
          );
          break;
        }
      }

      if (victim.dead) break;
    }
  }
}

function leaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((p, index) => ({
      place: index + 1,
      name: p.name,
      score: Math.floor(p.score),
      kills: p.kills
    }));
}

function sendLeaderboard(room) {
  broadcastRoom(room, {
    type: "leaderboard",
    players: leaderboard(room)
  });
}

wss.on("connection", ws => {
  const id = randomId();

  clients.set(id, ws);

  send(ws, {
    type: "connected",
    id
  });

  ws.on("message", raw => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!data || !data.type) return;

    if (data.type === "createRoom") {
      const code = randomCode();

      const room = {
        code,
        host: id,
        started: false,
        players: new Map()
      };

      rooms.set(code, room);

      const player = {
        id,
        ws,
        name: safeName(data.name),
        color: data.color || "#63ff78",
        skin: data.skin || "green",
        room: code,

        x: 10000,
        y: 10000,
        angle: 0,
        length: 25,

        score: 0,
        kills: 0,
        coins: 0,

        boosting: false,
        started: false,
        dead: false
      };

      room.players.set(id, player);
      clients.set(id, ws);

      send(ws, {
        type: "roomCreated",
        id,
        code
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

      const player = {
        id,
        ws,
        name: safeName(data.name),
        color: data.color || "#4da6ff",
        skin: data.skin || "blue",
        room: code,

        x: 10000,
        y: 10000,
        angle: 0,
        length: 25,

        score: 0,
        kills: 0,
        coins: 0,

        boosting: false,
        started: false,
        dead: false
      };

      room.players.set(id, player);

      send(ws, {
        type: "roomJoined",
        id,
        code
      });

      sendLobby(room);
      return;
    }

    const player = [...rooms.values()]
      .flatMap(r => [...r.players.values()])
      .find(p => p.id === id);

    if (!player) return;

    const room = rooms.get(player.room);
    if (!room) return;

    if (data.type === "startGame") {
      if (room.host !== id) return;

      room.started = true;

      for (const p of room.players.values()) {
        p.started = true;
        p.dead = false;
        p.score = 0;
        p.kills = 0;

        p.x = 3000 + Math.random() * 14000;
        p.y = 3000 + Math.random() * 14000;
        p.angle = Math.random() * Math.PI * 2;
        p.length = 25;
      }

      broadcastRoom(room, {
        type: "gameStart"
      });

      sendPlayers(room);
      sendLeaderboard(room);
      return;
    }

    if (data.type === "state") {
      if (!room.started || player.dead) return;

      player.x = Number(data.x) || player.x;
      player.y = Number(data.y) || player.y;
      player.angle = Number(data.angle) || player.angle;
      player.length = Math.max(
        10,
        Math.min(500, Number(data.length) || 25)
      );

      player.color = data.color || player.color;
      player.skin = data.skin || player.skin;
      player.name = safeName(data.name);
      player.boosting = !!data.boosting;

      sendPlayers(room);
      sendLeaderboard(room);

      return;
    }

    if (data.type === "addScore") {
      player.score += Number(data.amount) || 0;
      return;
    }
  });

  ws.on("close", () => {
    clients.delete(id);

    for (const [code, room] of rooms) {
      if (room.players.has(id)) {
        room.players.delete(id);

        if (room.host === id) {
          const next = room.players.values().next().value;

          if (next) {
            room.host = next.id;
          }
        }

        if (room.players.size === 0) {
          rooms.delete(code);
        } else {
          sendLobby(room);
          sendPlayers(room);
          sendLeaderboard(room);
        }

        break;
      }
    }
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.started) continue;
    checkCollisions(room);
  }
}, 100);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Snake Arena running on port ${PORT}`);
});
