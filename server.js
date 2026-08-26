const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WIDTH = 30;
const HEIGHT = 30;
const MAX_PLAYERS = 4;
const TICK = 110;

const COLORS = [
  "#43ff72",
  "#45a5ff",
  "#ff4fd8",
  "#ffd43b"
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
    "Content-Type": "text/plain"
  });

  res.end("🐍 Snake Online 2.0 server töötab!");
});

const wss = new WebSocket.Server({ server });

const rooms = {};

function randomId() {
  return Math.random()
    .toString(36)
    .substring(2, 10);
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

function randomPosition(room) {
  let position;

  for (let tries = 0; tries < 200; tries++) {
    position = {
      x: Math.floor(Math.random() * WIDTH),
      y: Math.floor(Math.random() * HEIGHT)
    };

    if (
      !isBlocked(room, position.x, position.y) &&
      !snakeAt(room, position.x, position.y)
    ) {
      return position;
    }
  }

  return {
    x: 5,
    y: 5
  };
}

function snakeAt(room, x, y) {
  return Object.values(room.players).some(player => {
    return player.snake.some(part =>
      part.x === x && part.y === y
    );
  });
}

function isBlocked(room, x, y) {
  return room.walls.some(wall =>
    wall.x === x && wall.y === y
  );
}

function makeWalls(mode) {
  if (mode !== "maze") {
    return [];
  }

  const walls = [];

  for (let x = 4; x < WIDTH - 4; x++) {
    if (x !== 14 && x !== 15) {
      walls.push({ x, y: 8 });
      walls.push({ x, y: HEIGHT - 9 });
    }
  }

  for (let y = 4; y < HEIGHT - 4; y++) {
    if (y !== 14 && y !== 15) {
      walls.push({ x: 8, y });
      walls.push({ x: WIDTH - 9, y });
    }
  }

  return walls;
}

function createPlayer(id, name, index) {
  const starts = [
    { x: 4, y: 4 },
    { x: WIDTH - 5, y: HEIGHT - 5 },
    { x: WIDTH - 5, y: 4 },
    { x: 4, y: HEIGHT - 5 }
  ];

  const start = starts[index % starts.length];

  return {
    id,
    name: name || "Player",
    color: COLORS[index % COLORS.length],

    snake: [
      { x: start.x, y: start.y },
      { x: start.x - 1, y: start.y },
      { x: start.x - 2, y: start.y }
    ],

    direction: index === 1 || index === 3
      ? "left"
      : "right",

    nextDirection: index === 1 || index === 3
      ? "left"
      : "right",

    score: 0,
    coins: 0,

    alive: true,

    shield: false,
    boost: 0,

    respawnTimer: 0
  };
}

function createRoom(mode) {
  return {
    mode: MODES.includes(mode)
      ? mode
      : "classic",

    players: {},
    clients: new Set(),

    food: [],
    powerups: [],
    walls: [],

    started: false,
    interval: null,

    roundTime: 0
  };
}

function addFood(room) {
  const position = randomPosition(room);

  room.food.push({
    x: position.x,
    y: position.y,
    type: "apple"
  });
}

function addPowerup(room) {
  const position = randomPosition(room);

  const types = [
    "speed",
    "shield",
    "coin"
  ];

  room.powerups.push({
    x: position.x,
    y: position.y,
    type: types[
      Math.floor(Math.random() * types.length)
    ]
  });
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room) {
  const state = {
    mode: room.mode,
    width: WIDTH,
    height: HEIGHT,
    players: room.players,
    food: room.food,
    powerups: room.powerups,
    walls: room.walls
  };

  room.clients.forEach(client => {
    send(client, {
      type: "state",
      state
    });
  });
}

function resetPlayer(player, index) {
  const starts = [
    { x: 4, y: 4 },
    { x: WIDTH - 5, y: HEIGHT - 5 },
    { x: WIDTH - 5, y: 4 },
    { x: 4, y: HEIGHT - 5 }
  ];

  const start = starts[index % starts.length];

  player.snake = [
    { x: start.x, y: start.y },
    { x: start.x - 1, y: start.y },
    { x: start.x - 2, y: start.y }
  ];

  player.direction =
    index === 1 || index === 3
      ? "left"
      : "right";

  player.nextDirection = player.direction;

  player.alive = true;
  player.shield = false;
  player.boost = 0;
}

function killPlayer(room, player) {
  if (player.shield) {
    player.shield = false;
    return;
  }

  player.alive = false;
  player.respawnTimer = 30;

  if (room.mode === "last") {
    player.respawnTimer = -1;
  }
}

function movePlayer(room, player) {
  if (!player.alive) {
    if (player.respawnTimer > 0) {
      player.respawnTimer--;

      if (player.respawnTimer === 0) {
        const index =
          Object.keys(room.players).indexOf(player.id);

        resetPlayer(player, index);
      }
    }

    return;
  }

  player.direction = player.nextDirection;

  const head = {
    x: player.snake[0].x,
    y: player.snake[0].y
  };

  if (player.direction === "up") head.y--;
  if (player.direction === "down") head.y++;
  if (player.direction === "left") head.x--;
  if (player.direction === "right") head.x++;

  if (
    head.x < 0 ||
    head.x >= WIDTH ||
    head.y < 0 ||
    head.y >= HEIGHT
  ) {
    killPlayer(room, player);
    return;
  }

  if (isBlocked(room, head.x, head.y)) {
    killPlayer(room, player);
    return;
  }

  for (const other of Object.values(room.players)) {
    if (!other.alive) continue;

    if (
      other.snake.some(part =>
        part.x === head.x &&
        part.y === head.y
      )
    ) {
      killPlayer(room, player);
      return;
    }
  }

  player.snake.unshift(head);

  const foodIndex = room.food.findIndex(food =>
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

  const powerIndex = room.powerups.findIndex(power =>
    power.x === head.x &&
    power.y === head.y
  );

  if (powerIndex !== -1) {
    const power =
      room.powerups[powerIndex];

    room.powerups.splice(powerIndex, 1);

    if (power.type === "speed") {
      player.boost = 35;
    }

    if (power.type === "shield") {
      player.shield = true;
    }

    if (power.type === "coin") {
      player.coins += 5;
      player.score += 2;
    }
  }

  if (player.boost > 0) {
    player.boost--;
  }
}

function checkWinner(room) {
  const players =
    Object.values(room.players);

  const alive =
    players.filter(player => player.alive);

  if (room.mode === "last") {
    if (players.length >= 2 && alive.length === 1) {
      finishGame(
        room,
        alive[0]
      );
    }
  }

  if (room.mode === "battle") {
    if (players.length >= 2 && alive.length === 1) {
      finishGame(
        room,
        alive[0]
      );
    }
  }
}

function finishGame(room, winner) {
  clearInterval(room.interval);

  room.started = false;

  room.clients.forEach(client => {
    send(client, {
      type: "winner",
      winner: winner
        ? {
            name: winner.name,
            score: winner.score
          }
        : null
    });
  });

  setTimeout(() => {
    if (!rooms[room.code]) return;

    Object.values(room.players).forEach(player => {
      player.alive = true;
      player.score = 0;
      player.coins = 0;
      player.shield = false;
      player.boost = 0;
    });

    room.food = [];
    room.powerups = [];

    for (let i = 0; i < 4; i++) {
      addFood(room);
    }

    if (room.mode === "power") {
      for (let i = 0; i < 4; i++) {
        addPowerup(room);
      }
    }

    startGame(room);
  }, 3500);
}

function startGame(room) {
  if (room.started) return;

  if (Object.keys(room.players).length === 0) {
    return;
  }

  room.started = true;

  room.food = [];

  room.powerups = [];

  room.walls =
    makeWalls(room.mode);

  for (let i = 0; i < 5; i++) {
    addFood(room);
  }

  if (room.mode === "power") {
    for (let i = 0; i < 5; i++) {
      addPowerup(room);
    }
  }

  room.clients.forEach(client => {
    send(client, {
      type: "start"
    });
  });

  room.interval = setInterval(
    () => gameTick(room),
    TICK
  );
}

function gameTick(room) {
  Object.values(room.players)
    .forEach(player => {
      movePlayer(room, player);
    });

  if (
    room.mode === "power" &&
    Math.random() < 0.025 &&
    room.powerups.length < 8
  ) {
    addPowerup(room);
  }

  checkWinner(room);

  broadcast(room);
}

wss.on("connection", ws => {
  const id = randomId();

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
      const code = roomCode();

      const room =
        createRoom(data.mode);

      room.code = code;

      rooms[code] = room;

      ws.room = code;

      room.clients.add(ws);

      room.players[id] =
        createPlayer(
          id,
          data.name,
          0
        );

      send(ws, {
        type: "roomCreated",
        room: code,
        mode: room.mode
      });

      broadcast(room);

      startGame(room);

      return;
    }

    if (data.type === "joinRoom") {
      const code =
        String(data.room || "")
          .toUpperCase();

      const room =
        rooms[code];

      if (!room) {
        send(ws, {
          type: "error",
          message: "Sellist tuba ei ole."
        });

        return;
      }

      const count =
        Object.keys(room.players).length;

      if (count >= MAX_PLAYERS) {
        send(ws, {
          type: "error",
          message: "Tuba on täis."
        });

        return;
      }

      ws.room = code;

      room.clients.add(ws);

      room.players[id] =
        createPlayer(
          id,
          data.name,
          count
        );

      send(ws, {
        type: "roomJoined",
        room: code,
        mode: room.mode
      });

      broadcast(room);

      return;
    }

    if (data.type === "direction") {
      if (!ws.room) return;

      const room =
        rooms[ws.room];

      if (!room) return;

      const player =
        room.players[id];

      if (!player || !player.alive) {
        return;
      }

      const direction =
        data.direction;

      const opposite = {
        up: "down",
        down: "up",
        left: "right",
        right: "left"
      };

      if (
        direction &&
        opposite[direction] !== player.direction
      ) {
        player.nextDirection =
          direction;
      }
    }
  });

  ws.on("close", () => {
    if (!ws.room) return;

    const room =
      rooms[ws.room];

    if (!room) return;

    delete room.players[id];

    room.clients.delete(ws);

    if (room.clients.size === 0) {
      clearInterval(room.interval);
      delete rooms[ws.room];
    } else {
      broadcast(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(
    `🐍 Snake Online 2.0 töötab pordil ${PORT}`
  );
});
