const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 8000;
const MAX_PLAYERS = 30;
const TICK = 40;

const rooms = {};

const SKINS = [
  "#4dff75",
  "#42a5ff",
  "#ff4fd8",
  "#ffd43b",
  "#ff7043",
  "#b45cff",
  "#00e5ff",
  "#ff3d71",
  "#ffffff",
  "#8cff00",
  "#ff9f1c",
  "#00ffc8"
];

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });
  res.end("Snake Arena Online 🐍");
});

const wss = new WebSocket.Server({ server });

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

  } while (rooms[code]);

  return code;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function createFood(room, count) {

  for (let i = 0; i < count; i++) {

    const rare = Math.random() < 0.06;
    const golden = Math.random() < 0.015;

    room.food.push({
      x: random(100, WORLD - 100),
      y: random(100, WORLD - 100),
      value: golden ? 25 : rare ? 5 : 1,
      size: golden ? 14 : rare ? 9 : 5,
      type: golden ? "gold" : rare ? "rare" : "normal"
    });
  }
}

function createRoom(mode) {

  const room = {
    code: "",
    mode: mode || "classic",
    hostId: null,
    clients: new Set(),
    players: {},
    food: [],
    started: false,
    interval: null
  };

  createFood(room, 900);

  return room;
}

function spawn(room) {

  for (let tries = 0; tries < 100; tries++) {

    const p = {
      x: random(500, WORLD - 500),
      y: random(500, WORLD - 500)
    };

    let valid = true;

    for (const other of Object.values(room.players)) {

      if (!other.snake.length) continue;

      if (distance(p, other.snake[0]) < 600) {
        valid = false;
        break;
      }
    }

    if (valid) return p;
  }

  return {
    x: WORLD / 2,
    y: WORLD / 2
  };
}

function createPlayer(id, name, skin, room) {

  const p = spawn(room);

  const angle = Math.random() * Math.PI * 2;

  const player = {

    id,

    name: String(name || "Player")
      .replace(/[<>]/g, "")
      .slice(0, 16),

    skin: SKINS[
      Math.max(
        0,
        Math.min(
          SKINS.length - 1,
          Number(skin) || 0
        )
      )
    ],

    x: p.x,
    y: p.y,

    angle,
    targetAngle: angle,

    speed: 4.8,
    boost: false,

    score: 0,
    length: 40,

    alive: true,
    respawn: 100,

    shield: 0,
    magnet: 0,
    speedPower: 0,

    snake: [],

    lastBoostFood: 0
  };

  for (let i = 0; i < player.length; i++) {

    player.snake.push({
      x: player.x - Math.cos(angle) * i * 8,
      y: player.y - Math.sin(angle) * i * 8
    });

  }

  return player;
}

function kill(room, player) {

  if (!player.alive) return;

  if (player.shield > 0) {

    player.shield = 0;

    return;
  }

  player.alive = false;
  player.boost = false;

  for (
    let i = 0;
    i < Math.min(180, player.snake.length);
    i++
  ) {

    const part =
      player.snake[
        Math.floor(
          Math.random() * player.snake.length
        )
      ];

    if (!part) continue;

    room.food.push({
      x: part.x + random(-20, 20),
      y: part.y + random(-20, 20),
      value: 3,
      size: 8,
      type: "death"
    });
  }

  player.snake = [];
  player.respawn = 100;
}

function respawn(room, player) {

  const p = spawn(room);

  player.x = p.x;
  player.y = p.y;

  player.angle =
    Math.random() * Math.PI * 2;

  player.targetAngle =
    player.angle;

  player.score = 0;
  player.length = 40;

  player.shield = 0;
  player.magnet = 0;
  player.speedPower = 0;

  player.alive = true;
  player.boost = false;

  player.snake = [];

  for (let i = 0; i < player.length; i++) {

    player.snake.push({
      x: player.x - Math.cos(player.angle) * i * 8,
      y: player.y - Math.sin(player.angle) * i * 8
    });

  }
}

function angleDiff(a, b) {

  let d = b - a;

  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;

  return d;
}

function eatFood(room, player) {

  for (let i = room.food.length - 1; i >= 0; i--) {

    const food = room.food[i];

    const d = distance(player, food);

    const range =
      player.magnet > 0
        ? 150
        : 24;

    if (d < range) {

      if (player.magnet > 0 && d > 25) {

        food.x +=
          (player.x - food.x) * 0.08;

        food.y +=
          (player.y - food.y) * 0.08;

        continue;
      }

      player.score += food.value;
      player.length += food.value * 1.3;

      room.food.splice(i, 1);
    }
  }
}

function move(room, player) {

  if (!player.alive) {

    player.respawn--;

    if (player.respawn <= 0) {
      respawn(room, player);
    }

    return;
  }

  const diff =
    angleDiff(
      player.angle,
      player.targetAngle
    );

  const turning =
    player.boost ? 0.095 : 0.075;

  player.angle += Math.max(
    -turning,
    Math.min(turning, diff)
  );

  if (player.speedPower > 0) {
    player.speedPower--;
  }

  if (player.magnet > 0) {
    player.magnet--;
  }

  if (player.shield > 0) {
    player.shield--;
  }

  let speed =
    player.speedPower > 0
      ? 7.2
      : 5.0;

  if (player.boost) {

    speed = 9.0;

    player.length -= 0.08;

    if (player.length < 22) {
      player.boost = false;
    }

    if (
      Date.now() - player.lastBoostFood > 120
    ) {

      room.food.push({
        x: player.x + random(-15, 15),
        y: player.y + random(-15, 15),
        value: 1,
        size: 5,
        type: "boost"
      });

      player.lastBoostFood = Date.now();
    }
  }

  player.x +=
    Math.cos(player.angle) * speed;

  player.y +=
    Math.sin(player.angle) * speed;

  if (
    player.x < 60 ||
    player.y < 60 ||
    player.x > WORLD - 60 ||
    player.y > WORLD - 60
  ) {

    kill(room, player);
    return;
  }

  player.snake.unshift({
    x: player.x,
    y: player.y
  });

  const wanted =
    Math.max(
      22,
      Math.floor(player.length)
    );

  while (
    player.snake.length > wanted
  ) {

    player.snake.pop();
  }

  eatFood(room, player);
}

function collisions(room) {

  const players =
    Object.values(room.players);

  for (const player of players) {

    if (!player.alive) continue;

    for (const other of players) {

      if (!other.alive) continue;
      if (player.id === other.id) continue;

      for (
        let i = 5;
        i < other.snake.length;
        i += 2
      ) {

        const body = other.snake[i];

        if (
          distance(player, body) < 17
        ) {

          kill(room, player);

          break;
        }
      }

      if (!player.alive) break;
    }
  }
}

function gameTick(room) {

  if (!room.started) return;

  for (const player of Object.values(room.players)) {
    move(room, player);
  }

  collisions(room);

  while (room.food.length < 900) {
    createFood(room, 50);
  }

  broadcastState(room);
}

function getState(room) {

  const players = {};

  for (const p of Object.values(room.players)) {

    players[p.id] = {
      id: p.id,
      name: p.name,
      skin: p.skin,
      x: p.x,
      y: p.y,
      angle: p.angle,
      score: p.score,
      length: p.length,
      alive: p.alive,
      shield: p.shield,
      magnet: p.magnet,
      speedPower: p.speedPower,
      snake: p.snake
    };
  }

  return {
    world: WORLD,
    players,
    food: room.food,
    started: room.started,
    hostId: room.hostId,
    mode: room.mode
  };
}

function broadcastState(room) {

  const packet = {
    type: "state",
    state: getState(room)
  };

  for (const ws of room.clients) {
    send(ws, packet);
  }
}

function broadcastLobby(room) {

  const players =
    Object.values(room.players).map(p => ({
      id: p.id,
      name: p.name,
      skin: p.skin
    }));

  for (const ws of room.clients) {

    send(ws, {
      type: "lobby",
      room: room.code,
      hostId: room.hostId,
      players,
      mode: room.mode
    });
  }
}

function startRoom(room) {

  if (room.started) return;

  room.started = true;

  room.interval =
    setInterval(
      () => gameTick(room),
      TICK
    );

  for (const ws of room.clients) {
    send(ws, {
      type: "gameStarted"
    });
  }
}

wss.on("connection", ws => {

  const id = makeId();

  ws.playerId = id;
  ws.room = null;

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

    if (data.type === "createRoom") {

      const code = makeRoomCode();

      const room =
        createRoom(data.mode);

      room.code = code;
      room.hostId = id;

      rooms[code] = room;

      ws.room = code;
      room.clients.add(ws);

      room.players[id] =
        createPlayer(
          id,
          data.name,
          data.skin,
          room
        );

      send(ws, {
        type: "roomCreated",
        room: code,
        host: true
      });

      broadcastLobby(room);

      return;
    }

    if (data.type === "joinRoom") {

      const code =
        String(data.room || "")
          .toUpperCase()
          .trim();

      const room = rooms[code];

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

      if (
        Object.keys(room.players).length >=
        MAX_PLAYERS
      ) {

        send(ws, {
          type: "error",
          message: "Room on täis."
        });

        return;
      }

      ws.room = code;

      room.clients.add(ws);

      const skin =
        Number(data.skin) || 0;

      room.players[id] =
        createPlayer(
          id,
          data.name,
          skin,
          room
        );

      send(ws, {
        type: "roomJoined",
        room: code,
        host: false
      });

      broadcastLobby(room);

      return;
    }

    if (data.type === "startGame") {

      const room =
        rooms[ws.room];

      if (!room) return;

      if (room.hostId !== id) {

        send(ws, {
          type: "error",
          message:
            "Ainult host saab mängu alustada."
        });

        return;
      }

      startRoom(room);

      return;
    }

    if (data.type === "aim") {

      const room =
        rooms[ws.room];

      if (!room) return;

      const player =
        room.players[id];

      if (!player) return;

      if (
        typeof data.angle === "number"
      ) {
        player.targetAngle =
          data.angle;
      }

      return;
    }

    if (data.type === "boost") {

      const room =
        rooms[ws.room];

      if (!room) return;

      const player =
        room.players[id];

      if (!player) return;

      player.boost =
        Boolean(data.active);

      return;
    }

    if (data.type === "powerup") {

      const room =
        rooms[ws.room];

      if (!room) return;

      const player =
        room.players[id];

      if (!player) return;

      if (data.power === "shield") {
        player.shield = 60 * 20;
      }

      if (data.power === "magnet") {
        player.magnet = 60 * 15;
      }

      if (data.power === "speed") {
        player.speedPower = 60 * 10;
      }
    }
  });

  ws.on("close", () => {

    const code = ws.room;

    if (!code) return;

    const room = rooms[code];

    if (!room) return;

    delete room.players[id];

    room.clients.delete(ws);

    if (room.hostId === id) {

      const remaining =
        Object.keys(room.players);

      room.hostId =
        remaining[0] || null;
    }

    if (room.clients.size === 0) {

      clearInterval(room.interval);

      delete rooms[code];

      return;
    }

    if (room.started) {
      broadcastState(room);
    } else {
      broadcastLobby(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(
    `🐍 Snake Arena running on port ${PORT}`
  );
});
