const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WIDTH = 150;
const HEIGHT = 150;
const TICK = 100;
const MAX_PLAYERS = 8;

const COLORS = [
  "#42ff72",
  "#43a5ff",
  "#ff4fd8",
  "#ffd43b",
  "#ff7043",
  "#b65cff",
  "#00e5ff",
  "#ff3d71"
];

const MODES = [
  "classic",
  "battle",
  "power",
  "maze",
  "last"
];

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end("🐍 Snake Online töötab!");
});

const wss = new WebSocket.Server({ server });

const rooms = {};

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
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

function validDirection(direction) {
  return ["up", "down", "left", "right"].includes(direction);
}

function createRoom(mode) {
  return {
    code: "",
    mode: MODES.includes(mode) ? mode : "classic",
    hostId: null,
    players: {},
    clients: new Set(),
    food: [],
    powerups: [],
    walls: [],
    started: false,
    interval: null
  };
}

function randomPosition(room) {
  for (let i = 0; i < 1000; i++) {
    const p = {
      x: Math.floor(Math.random() * WIDTH),
      y: Math.floor(Math.random() * HEIGHT)
    };

    const wall = room.walls.some(
      w => w.x === p.x && w.y === p.y
    );

    const snake = Object.values(room.players).some(
      player =>
        player.alive &&
        player.snake.some(
          part => part.x === p.x && part.y === p.y
        )
    );

    if (!wall && !snake) return p;
  }

  return {
    x: Math.floor(WIDTH / 2),
    y: Math.floor(HEIGHT / 2)
  };
}

function createMaze() {
  const walls = [];

  for (let x = 15; x < WIDTH - 15; x++) {
    if (x < 65 || x > 85) {
      walls.push({ x, y: 45 });
    }

    if (x < 45 || x > 65) {
      walls.push({ x, y: 105 });
    }
  }

  for (let y = 15; y < HEIGHT - 15; y++) {
    if (y < 65 || y > 85) {
      walls.push({ x: 45, y });
    }

    if (y < 45 || y > 65) {
      walls.push({ x: 105, y });
    }
  }

  return walls;
}

function startPosition(index) {
  const positions = [
    { x: 20, y: 20 },
    { x: WIDTH - 21, y: HEIGHT - 21 },
    { x: WIDTH - 21, y: 20 },
    { x: 20, y: HEIGHT - 21 },
    { x: 75, y: 20 },
    { x: 75, y: HEIGHT - 21 },
    { x: 20, y: 75 },
    { x: WIDTH - 21, y: 75 }
  ];

  return positions[index % positions.length];
}

function startDirection(index) {
  const dirs = [
    "right",
    "left",
    "left",
    "right",
    "down",
    "up",
    "right",
    "left"
  ];

  return dirs[index % dirs.length];
}

function createPlayer(id, name, index) {
  const start = startPosition(index);
  const direction = startDirection(index);

  let bx = 0;
  let by = 0;

  if (direction === "right") bx = -1;
  if (direction === "left") bx = 1;
  if (direction === "down") by = -1;
  if (direction === "up") by = 1;

  return {
    id,
    name: String(name || "Player")
      .replace(/[<>]/g, "")
      .slice(0, 12),

    color: COLORS[index % COLORS.length],

    snake: [
      { x: start.x, y: start.y },
      { x: start.x + bx, y: start.y + by },
      { x: start.x + bx * 2, y: start.y + by * 2 }
    ],

    direction,
    nextDirection: direction,

    score: 0,
    coins: 0,

    alive: true,

    respawnTimer: 0,

    shield: false,

    boost: 0,

    boostCooldown: 0
  };
}

function addFood(room) {
  room.food.push(randomPosition(room));
}

function addPowerup(room) {
  const p = randomPosition(room);

  const types = ["speed", "shield", "coin"];

  room.powerups.push({
    x: p.x,
    y: p.y,
    type: types[Math.floor(Math.random() * types.length)]
  });
}

function resetPlayer(room, player) {
  const index =
    Object.keys(room.players).indexOf(player.id);

  const start = startPosition(index);
  const direction = startDirection(index);

  let bx = 0;
  let by = 0;

  if (direction === "right") bx = -1;
  if (direction === "left") bx = 1;
  if (direction === "down") by = -1;
  if (direction === "up") by = 1;

  player.snake = [
    { x: start.x, y: start.y },
    { x: start.x + bx, y: start.y + by },
    { x: start.x + bx * 2, y: start.y + by * 2 }
  ];

  player.direction = direction;
  player.nextDirection = direction;

  player.alive = true;
  player.respawnTimer = 0;
  player.shield = false;
  player.boost = 0;
  player.boostCooldown = 0;
}

function killPlayer(room, player) {
  if (!player.alive) return;

  if (player.shield) {
    player.shield = false;
    return;
  }

  player.alive = false;

  if (room.mode === "battle" || room.mode === "last") {
    player.respawnTimer = -1;
  } else {
    player.respawnTimer = 25;
  }
}

function nextHead(player) {
  const head = {
    x: player.snake[0].x,
    y: player.snake[0].y
  };

  if (player.direction === "up") head.y--;
  if (player.direction === "down") head.y++;
  if (player.direction === "left") head.x--;
  if (player.direction === "right") head.x++;

  return head;
}

function movePlayer(room, player) {
  if (!player.alive) {
    if (player.respawnTimer > 0) {
      player.respawnTimer--;

      if (player.respawnTimer <= 0) {
        resetPlayer(room, player);
      }
    }

    return;
  }

  if (!validDirection(player.direction)) {
    player.direction = "right";
  }

  if (validDirection(player.nextDirection)) {
    const opposite = {
      up: "down",
      down: "up",
      left: "right",
      right: "left"
    };

    if (
      player.nextDirection !==
      opposite[player.direction]
    ) {
      player.direction = player.nextDirection;
    }
  }

  const head = nextHead(player);

  if (
    head.x < 0 ||
    head.y < 0 ||
    head.x >= WIDTH ||
    head.y >= HEIGHT
  ) {
    killPlayer(room, player);
    return;
  }

  const wall = room.walls.some(
    w => w.x === head.x && w.y === head.y
  );

  if (wall) {
    killPlayer(room, player);
    return;
  }

  for (const other of Object.values(room.players)) {
    if (!other.alive) continue;

    for (const part of other.snake) {
      if (
        part.x === head.x &&
        part.y === head.y
      ) {
        killPlayer(room, player);
        return;
      }
    }
  }

  player.snake.unshift(head);

  const foodIndex = room.food.findIndex(
    food =>
      food.x === head.x &&
      food.y === head.y
  );

  if (foodIndex !== -1) {
    room.food.splice(foodIndex, 1);

    player.score++;
    player.coins++;

    addFood(room);
  } else {
    player.snake.pop();
  }

  const powerIndex = room.powerups.findIndex(
    power =>
      power.x === head.x &&
      power.y === head.y
  );

  if (powerIndex !== -1) {
    const power = room.powerups[powerIndex];

    room.powerups.splice(powerIndex, 1);

    if (power.type === "speed") {
      player.boost = 80;
    }

    if (power.type === "shield") {
      player.shield = true;
    }

    if (power.type === "coin") {
      player.coins += 10;
      player.score += 2;
    }
  }

  if (player.boost > 0) {
    player.boost--;
  }

  if (player.boostCooldown > 0) {
    player.boostCooldown--;
  }
}

function boostPlayer(player) {
  if (!player || !player.alive) return;

  if (player.boostCooldown > 0) return;

  player.boost = Math.max(player.boost, 30);
  player.boostCooldown = 45;
}

function startGame(room) {
  if (room.started) return;

  room.started = true;

  room.food = [];
  room.powerups = [];

  room.walls =
    room.mode === "maze"
      ? createMaze()
      : [];

  for (let i = 0; i < 30; i++) {
    addFood(room);
  }

  if (room.mode === "power") {
    for (let i = 0; i < 12; i++) {
      addPowerup(room);
    }
  }

  broadcast(room);

  room.clients.forEach(client => {
    send(client, {
      type: "gameStarted"
    });
  });

  room.interval = setInterval(
    () => gameTick(room),
    TICK
  );
}

function gameTick(room) {
  if (!room.started) return;

  Object.values(room.players).forEach(
    player => movePlayer(room, player)
  );

  Object.values(room.players).forEach(
    player => {
      if (
        player.alive &&
        player.boost > 0 &&
        Math.random() < 0.65
      ) {
        movePlayer(room, player);
      }
    }
  );

  if (
    room.mode === "power" &&
    Math.random() < 0.04 &&
    room.powerups.length < 15
  ) {
    addPowerup(room);
  }

  checkWinner(room);

  broadcast(room);
}

function checkWinner(room) {
  if (
    room.mode !== "battle" &&
    room.mode !== "last"
  ) {
    return;
  }

  const players =
    Object.values(room.players);

  if (players.length < 2) return;

  const alive =
    players.filter(p => p.alive);

  if (alive.length === 1) {
    finishGame(room, alive[0]);
  }
}

function finishGame(room, winner) {
  if (!room.started) return;

  room.started = false;

  clearInterval(room.interval);

  room.clients.forEach(client => {
    send(client, {
      type: "winner",
      winner: {
        name: winner.name,
        score: winner.score
      }
    });
  });

  setTimeout(() => {
    if (!rooms[room.code]) return;

    Object.values(room.players).forEach(player => {
      player.score = 0;
      player.coins = 0;
      player.alive = true;
      player.respawnTimer = 0;
    });

    broadcastLobby(room);
  }, 3500);
}

function getRoomState(room) {
  const players = {};

  Object.values(room.players).forEach(player => {
    players[player.id] = {
      id: player.id,
      name: player.name,
      color: player.color,
      snake: player.snake,
      direction: player.direction,
      score: player.score,
      coins: player.coins,
      alive: player.alive,
      respawnTimer: player.respawnTimer,
      shield: player.shield,
      boost: player.boost
    };
  });

  return {
    width: WIDTH,
    height: HEIGHT,
    mode: room.mode,
    started: room.started,
    hostId: room.hostId,
    players,
    food: room.food,
    powerups: room.powerups,
    walls: room.walls
  };
}

function broadcast(room) {
  const data = {
    type: "state",
    state: getRoomState(room)
  };

  room.clients.forEach(client => {
    send(client, data);
  });
}

function broadcastLobby(room) {
  const data = {
    type: "lobby",
    room: room.code,
    mode: room.mode,
    hostId: room.hostId,
    started: room.started,
    players: Object.values(room.players).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color
    }))
  };

  room.clients.forEach(client => {
    send(client, data);
  });
}

wss.on("connection", ws => {
  const playerId = makeId();

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
      if (ws.room) return;

      const code = makeRoomCode();

      const room = createRoom(data.mode);

      room.code = code;
      room.hostId = playerId;

      rooms[code] = room;

      ws.room = code;

      room.clients.add(ws);

      room.players[playerId] =
        createPlayer(
          playerId,
          data.name,
          0
        );

      send(ws, {
        type: "roomCreated",
        room: code,
        mode: room.mode,
        host: true
      });

      /*
       * OLULINE:
       * SIIN EI KÄIVITATA startGame().
       * Mäng jääb lobby'sse.
       */

      broadcastLobby(room);

      return;
    }

    if (data.type === "joinRoom") {
      if (ws.room) return;

      const code = String(
        data.room || ""
      )
        .trim()
        .toUpperCase();

      const room = rooms[code];

      if (!room) {
        send(ws, {
          type: "error",
          message: "Sellist Room Code'i ei ole."
        });

        return;
      }

      if (
        Object.keys(room.players).length >=
        MAX_PLAYERS
      ) {
        send(ws, {
          type: "error",
          message: "Tuba on täis."
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

      const index =
        Object.keys(room.players).length;

      room.players[playerId] =
        createPlayer(
          playerId,
          data.name,
          index
        );

      send(ws, {
        type: "roomJoined",
        room: code,
        mode: room.mode,
        host: false
      });

      broadcastLobby(room);

      return;
    }

    if (data.type === "startGame") {
      if (!ws.room) return;

      const room = rooms[ws.room];

      if (!room) return;

      if (room.hostId !== playerId) {
        send(ws, {
          type: "error",
          message:
            "Ainult Roomi looja saab mängu alustada."
        });

        return;
      }

      if (room.started) return;

      if (
        Object.keys(room.players).length < 1
      ) {
        return;
      }

      startGame(room);

      return;
    }

    if (data.type === "direction") {
      if (!ws.room) return;

      const room = rooms[ws.room];

      if (!room || !room.started) return;

      const player =
        room.players[playerId];

      if (!player) return;

      const direction = data.direction;

      if (!validDirection(direction)) {
        return;
      }

      const opposite = {
        up: "down",
        down: "up",
        left: "right",
        right: "left"
      };

      if (
        direction !==
        opposite[player.direction]
      ) {
        player.nextDirection =
          direction;
      }

      return;
    }

    if (data.type === "boost") {
      if (!ws.room) return;

      const room = rooms[ws.room];

      if (!room || !room.started) return;

      const player =
        room.players[playerId];

      boostPlayer(player);

      return;
    }
  });

  ws.on("close", () => {
    if (!ws.room) return;

    const room = rooms[ws.room];

    if (!room) return;

    delete room.players[playerId];

    room.clients.delete(ws);

    /*
     * Kui host lahkub, valitakse uus host.
     */

    if (room.hostId === playerId) {
      const remaining =
        Object.keys(room.players);

      room.hostId =
        remaining.length
          ? remaining[0]
          : null;
    }

    if (room.clients.size === 0) {
      clearInterval(room.interval);
      delete rooms[ws.room];
      return;
    }

    if (room.started) {
      broadcast(room);
    } else {
      broadcastLobby(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(
    `🐍 Snake Online töötab pordil ${PORT}`
  );
});
