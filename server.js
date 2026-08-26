const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 10000;
const rooms = {};

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Snake.io server is online!");
});

const wss = new WebSocket.Server({ server });

const SKINS = [
  "#49ff72",
  "#42a5ff",
  "#ff45d4",
  "#ffe033",
  "#ff713d",
  "#a855ff",
  "#00eaff",
  "#ff4268",
  "#ffffff",
  "#9dff32",
  "#ff9f1c",
  "#00ffc8"
];

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function id() {
  return Math.random().toString(36).slice(2, 10);
}

function roomCode() {
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

function createFood(room, amount) {
  for (let i = 0; i < amount; i++) {
    const roll = Math.random();

    let type = "normal";
    let value = 1;
    let size = 7;

    if (roll < 0.015) {
      type = "gold";
      value = 30;
      size = 15;
    } else if (roll < 0.06) {
      type = "purple";
      value = 8;
      size = 11;
    }

    room.food.push({
      id: id(),
      x: random(150, WORLD - 150),
      y: random(150, WORLD - 150),
      type,
      value,
      size
    });
  }
}

function createPower(room) {
  const types = ["speed", "magnet", "shield"];

  room.powers.push({
    id: id(),
    x: random(300, WORLD - 300),
    y: random(300, WORLD - 300),
    type: types[Math.floor(Math.random() * types.length)]
  });
}

function createRoom(mode) {
  const room = {
    code: "",
    mode: mode || "classic",
    host: null,
    clients: new Set(),
    players: {},
    food: [],
    powers: [],
    started: false,
    timer: null
  };

  createFood(room, 1300);

  for (let i = 0; i < 18; i++) {
    createPower(room);
  }

  return room;
}

function findSpawn(room) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const p = {
      x: random(800, WORLD - 800),
      y: random(800, WORLD - 800)
    };

    let okay = true;

    for (const other of Object.values(room.players)) {
      if (!other.snake.length) continue;

      if (distance(p, other) < 800) {
        okay = false;
        break;
      }
    }

    if (okay) return p;
  }

  return {
    x: WORLD / 2,
    y: WORLD / 2
  };
}

function createPlayer(room, playerId, name, skin) {
  const spawn = findSpawn(room);

  const angle = Math.random() * Math.PI * 2;

  const player = {
    id: playerId,
    name: String(name || "Player")
      .replace(/[<>]/g, "")
      .slice(0, 16),

    skin: SKINS[
      Math.max(
        0,
        Math.min(SKINS.length - 1, Number(skin) || 0)
      )
    ],

    x: spawn.x,
    y: spawn.y,

    angle,
    targetAngle: angle,

    speed: 5.2,
    boosting: false,

    score: 0,
    length: 55,

    alive: true,
    respawn: 0,

    shield: 0,
    magnet: 0,
    speedPower: 0,

    snake: [],
    lastDrop: 0
  };

  for (let i = 0; i < player.length; i++) {
    player.snake.push({
      x: player.x - Math.cos(angle) * i * 7,
      y: player.y - Math.sin(angle) * i * 7
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
  player.boosting = false;
  player.respawn = 90;

  for (let i = 0; i < player.snake.length; i += 3) {
    const part = player.snake[i];

    if (!part) continue;

    room.food.push({
      id: id(),
      x: part.x + random(-20, 20),
      y: part.y + random(-20, 20),
      type: "death",
      value: 4,
      size: 9
    });
  }

  player.snake = [];
}

function respawn(room, player) {
  const spawn = findSpawn(room);

  player.x = spawn.x;
  player.y = spawn.y;

  player.angle = Math.random() * Math.PI * 2;
  player.targetAngle = player.angle;

  player.score = 0;
  player.length = 55;

  player.shield = 0;
  player.magnet = 0;
  player.speedPower = 0;

  player.alive = true;
  player.boosting = false;

  player.snake = [];

  for (let i = 0; i < player.length; i++) {
    player.snake.push({
      x: player.x - Math.cos(player.angle) * i * 7,
      y: player.y - Math.sin(player.angle) * i * 7
    });
  }
}

function angleDifference(a, b) {
  let d = b - a;

  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;

  return d;
}

function eatFood(room, player) {
  for (let i = room.food.length - 1; i >= 0; i--) {
    const food = room.food[i];

    if (distance(player, food) < 25) {
      player.score += food.value;
      player.length += food.value * 1.8;

      room.food.splice(i, 1);
    }
  }
}

function collectPower(room, player) {
  for (let i = room.powers.length - 1; i >= 0; i--) {
    const power = room.powers[i];

    if (distance(player, power) < 32) {
      if (power.type === "speed") {
        player.speedPower = 60 * 12;
      }

      if (power.type === "magnet") {
        player.magnet = 60 * 15;
      }

      if (power.type === "shield") {
        player.shield = 60 * 20;
      }

      room.powers.splice(i, 1);
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

  if (player.shield > 0) player.shield--;
  if (player.magnet > 0) player.magnet--;
  if (player.speedPower > 0) player.speedPower--;

  const diff = angleDifference(
    player.angle,
    player.targetAngle
  );

  player.angle += Math.max(
    -0.12,
    Math.min(0.12, diff)
  );

  let speed = 5.4;

  if (player.speedPower > 0) {
    speed = 8;
  }

  if (player.boosting) {
    speed = 10;

    player.length -= 0.12;

    if (player.length < 25) {
      player.boosting = false;
    }

    if (Date.now() - player.lastDrop > 100) {
      room.food.push({
        id: id(),
        x: player.x + random(-18, 18),
        y: player.y + random(-18, 18),
        type: "boost",
        value: 2,
        size: 6
      });

      player.lastDrop = Date.now();
    }
  }

  player.x += Math.cos(player.angle) * speed;
  player.y += Math.sin(player.angle) * speed;

  if (
    player.x < 80 ||
    player.y < 80 ||
    player.x > WORLD - 80 ||
    player.y > WORLD - 80
  ) {
    kill(room, player);
    return;
  }

  player.snake.unshift({
    x: player.x,
    y: player.y
  });

  while (
    player.snake.length >
    Math.max(25, Math.floor(player.length))
  ) {
    player.snake.pop();
  }

  eatFood(room, player);
  collectPower(room, player);

  if (player.magnet > 0) {
    for (const food of room.food) {
      const d = distance(player, food);

      if (d < 190) {
        food.x += (player.x - food.x) * 0.08;
        food.y += (player.y - food.y) * 0.08;
      }
    }
  }
}

function collisions(room) {
  const players = Object.values(room.players);

  for (const a of players) {
    if (!a.alive) continue;

    for (const b of players) {
      if (!b.alive || a.id === b.id) continue;

      for (let i = 8; i < b.snake.length; i += 2) {
        const body = b.snake[i];

        if (distance(a, body) < 18) {
          kill(room, a);
          break;
        }
      }

      if (!a.alive) break;
    }
  }
}

function state(room) {
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
    powers: room.powers,
    started: room.started
  };
}

function broadcast(room) {
  const packet = {
    type: "state",
    state: state(room)
  };

  for (const ws of room.clients) {
    send(ws, packet);
  }
}

function lobby(room) {
  const players = Object.values(room.players).map(p => ({
    id: p.id,
    name: p.name,
    skin: p.skin
  }));

  for (const ws of room.clients) {
    send(ws, {
      type: "lobby",
      room: room.code,
      host: room.host,
      players
    });
  }
}

function start(room) {
  if (room.started) return;

  room.started = true;

  room.timer = setInterval(() => {
    for (const player of Object.values(room.players)) {
      move(room, player);
    }

    collisions(room);

    while (room.food.length < 1100) {
      createFood(room, 50);
    }

    while (room.powers.length < 18) {
      createPower(room);
    }

    broadcast(room);
  }, 40);

  for (const ws of room.clients) {
    send(ws, {
      type: "gameStarted"
    });
  }
}

wss.on("connection", ws => {
  const playerId = id();

  ws.playerId = playerId;
  ws.room = null;

  send(ws, {
    type: "connected",
    id: playerId
  });

  ws.on("message", raw => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "createRoom") {
      const code = roomCode();
      const room = createRoom(data.mode);

      room.code = code;
      room.host = playerId;

      rooms[code] = room;

      ws.room = code;
      room.clients.add(ws);

      room.players[playerId] =
        createPlayer(
          room,
          playerId,
          data.name,
          data.skin
        );

      send(ws, {
        type: "roomCreated",
        room: code,
        host: true
      });

      lobby(room);
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

      ws.room = code;
      room.clients.add(ws);

      room.players[playerId] =
        createPlayer(
          room,
          playerId,
          data.name,
          data.skin
        );

      send(ws, {
        type: "roomJoined",
        room: code,
        host: false
      });

      lobby(room);
      return;
    }

    if (data.type === "startGame") {
      const room = rooms[ws.room];

      if (!room) return;

      if (room.host !== playerId) {
        send(ws, {
          type: "error",
          message: "Ainult host saab alustada."
        });

        return;
      }

      start(room);
      return;
    }

    if (data.type === "aim") {
      const room = rooms[ws.room];
      if (!room) return;

      const player = room.players[playerId];
      if (!player) return;

      if (typeof data.angle === "number") {
        player.targetAngle = data.angle;
      }

      return;
    }

    if (data.type === "boost") {
      const room = rooms[ws.room];
      if (!room) return;

      const player = room.players[playerId];
      if (!player) return;

      player.boosting = Boolean(data.active);
    }
  });

  ws.on("close", () => {
    const code = ws.room;

    if (!code) return;

    const room = rooms[code];

    if (!room) return;

    delete room.players[playerId];
    room.clients.delete(ws);

    if (room.host === playerId) {
      const remaining = Object.keys(room.players);
      room.host = remaining[0] || null;
    }

    if (room.clients.size === 0) {
      clearInterval(room.timer);
      delete rooms[code];
      return;
    }

    if (!room.started) {
      lobby(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Snake server running on port ${PORT}`);
});
