const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 5000;
const MAX_PLAYERS = 20;
const TICK = 50;

const rooms = {};

const COLORS = [
  "#45ff72",
  "#42a5ff",
  "#ff4fd8",
  "#ffd43b",
  "#ff7043",
  "#b65cff",
  "#00e5ff",
  "#ff3d71",
  "#ffffff",
  "#8cff00"
];

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("Snake Online Server 🐍");
});

const wss = new WebSocket.Server({ server });

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
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
      code += chars[
        Math.floor(Math.random() * chars.length)
      ];
    }

  } while (rooms[code]);

  return code;
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function createFood(room, amount = 1) {

  for (let i = 0; i < amount; i++) {

    room.food.push({
      x: random(100, WORLD - 100),
      y: random(100, WORLD - 100),
      value: Math.random() < 0.08 ? 5 : 1,
      size: Math.random() < 0.08 ? 8 : 5
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

  createFood(room, 500);

  return room;
}

function distance(a, b) {

  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );

}

function spawnPosition(room) {

  for (let tries = 0; tries < 100; tries++) {

    const p = {
      x: random(400, WORLD - 400),
      y: random(400, WORLD - 400)
    };

    let good = true;

    for (const player of Object.values(room.players)) {

      if (!player.snake.length) continue;

      if (
        distance(
          p,
          player.snake[0]
        ) < 400
      ) {
        good = false;
        break;
      }

    }

    if (good) return p;

  }

  return {
    x: WORLD / 2,
    y: WORLD / 2
  };
}

function createPlayer(
  id,
  name,
  colorIndex,
  room
) {

  const spawn = spawnPosition(room);

  const angle =
    Math.random() * Math.PI * 2;

  const player = {

    id,

    name:
      String(name || "Player")
        .replace(/[<>]/g, "")
        .slice(0, 14),

    color:
      COLORS[colorIndex % COLORS.length],

    x: spawn.x,
    y: spawn.y,

    angle,

    targetAngle: angle,

    speed: 3.4,

    boost: false,

    score: 0,

    length: 35,

    alive: true,

    snake: [],

    respawn: 0,

    lastBoost: 0
  };

  for (
    let i = 0;
    i < player.length;
    i++
  ) {

    player.snake.push({

      x:
        player.x -
        Math.cos(angle) * i * 9,

      y:
        player.y -
        Math.sin(angle) * i * 9

    });

  }

  return player;
}

function addDeathFood(room, player) {

  for (
    let i = 0;
    i < Math.min(
      100,
      Math.floor(player.length / 2)
    );
    i++
  ) {

    const p =
      player.snake[
        Math.floor(
          Math.random() *
          player.snake.length
        )
      ];

    if (!p) continue;

    room.food.push({

      x: p.x + random(-15, 15),
      y: p.y + random(-15, 15),

      value: 3,
      size: 9
    });

  }

}

function killPlayer(room, player) {

  if (!player.alive) return;

  player.alive = false;

  addDeathFood(room, player);

  player.snake = [];

  player.respawn = 100;
}

function respawnPlayer(room, player) {

  const p = spawnPosition(room);

  player.x = p.x;
  player.y = p.y;

  player.angle =
    Math.random() *
    Math.PI *
    2;

  player.targetAngle =
    player.angle;

  player.length = 35;

  player.score = 0;

  player.alive = true;

  player.boost = false;

  player.snake = [];

  for (
    let i = 0;
    i < player.length;
    i++
  ) {

    player.snake.push({

      x:
        player.x -
        Math.cos(player.angle) *
        i * 9,

      y:
        player.y -
        Math.sin(player.angle) *
        i * 9

    });

  }

}

function angleDifference(a, b) {

  let d = b - a;

  while (d > Math.PI) {
    d -= Math.PI * 2;
  }

  while (d < -Math.PI) {
    d += Math.PI * 2;
  }

  return d;
}

function movePlayer(room, player) {

  if (!player.alive) {

    player.respawn--;

    if (player.respawn <= 0) {
      respawnPlayer(room, player);
    }

    return;
  }

  let turn =
    angleDifference(
      player.angle,
      player.targetAngle
    );

  const maxTurn =
    player.boost
      ? 0.085
      : 0.065;

  turn =
    Math.max(
      -maxTurn,
      Math.min(maxTurn, turn)
    );

  player.angle += turn;

  let speed =
    player.boost
      ? 6.2
      : 3.4;

  if (player.boost) {

    player.length -= 0.055;

    if (player.length < 18) {
      player.boost = false;
    }

  }

  player.x +=
    Math.cos(player.angle) *
    speed;

  player.y +=
    Math.sin(player.angle) *
    speed;

  const margin = 40;

  if (
    player.x < margin ||
    player.y < margin ||
    player.x > WORLD - margin ||
    player.y > WORLD - margin
  ) {

    killPlayer(
      room,
      player
    );

    return;
  }

  player.snake.unshift({
    x: player.x,
    y: player.y
  });

  const wanted =
    Math.max(
      18,
      Math.floor(player.length)
    );

  while (
    player.snake.length >
    wanted
  ) {

    player.snake.pop();

  }

  eatFood(room, player);

}

function eatFood(room, player) {

  for (
    let i = room.food.length - 1;
    i >= 0;
    i--
  ) {

    const food =
      room.food[i];

    if (
      distance(
        player,
        food
      ) <
      18
    ) {

      player.score +=
        food.value;

      player.length +=
        food.value * 0.9;

      room.food.splice(i, 1);

    }

  }

}

function checkCollisions(room) {

  const players =
    Object.values(room.players);

  for (const player of players) {

    if (!player.alive) continue;

    const head = {
      x: player.x,
      y: player.y
    };

    for (const other of players) {

      if (!other.alive) continue;

      if (player.id === other.id) continue;

      for (
        let i = 4;
        i < other.snake.length;
        i += 2
      ) {

        const part =
          other.snake[i];

        if (
          distance(
            head,
            part
          ) < 14
        ) {

          killPlayer(
            room,
            player
          );

          break;

        }

      }

      if (!player.alive) break;

    }

  }

}

function tick(room) {

  if (!room.started) return;

  for (
    const player of Object.values(
      room.players
    )
  ) {

    movePlayer(
      room,
      player
    );

  }

  checkCollisions(room);

  while (room.food.length < 500) {
    createFood(room, 20);
  }

  broadcastState(room);

}

function state(room) {

  const players = {};

  for (
    const p of Object.values(
      room.players
    )
  ) {

    players[p.id] = {

      id: p.id,

      name: p.name,

      color: p.color,

      x: p.x,

      y: p.y,

      angle: p.angle,

      score: p.score,

      length: p.length,

      alive: p.alive,

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
    state: state(room)
  };

  for (
    const client of room.clients
  ) {

    send(
      client,
      packet
    );

  }

}

function broadcastLobby(room) {

  const players =
    Object.values(
      room.players
    ).map(p => ({

      id: p.id,
      name: p.name,
      color: p.color

    }));

  const packet = {

    type: "lobby",

    room: room.code,

    hostId: room.hostId,

    players,

    mode: room.mode

  };

  for (
    const client of room.clients
  ) {

    send(
      client,
      packet
    );

  }

}

function startRoom(room) {

  if (room.started) return;

  room.started = true;

  room.interval =
    setInterval(
      () => tick(room),
      TICK
    );

  for (
    const client of room.clients
  ) {

    send(
      client,
      {
        type: "gameStarted"
      }
    );

  }

}

wss.on(
  "connection",
  ws => {

    const playerId = id();

    ws.playerId = playerId;

    ws.room = null;

    send(
      ws,
      {
        type: "connected",
        id: playerId
      }
    );

    ws.on(
      "message",
      raw => {

        let data;

        try {

          data =
            JSON.parse(
              raw.toString()
            );

        } catch {

          return;

        }

        if (
          data.type ===
          "createRoom"
        ) {

          if (ws.room) return;

          const code =
            roomCode();

          const room =
            createRoom(
              data.mode
            );

          room.code =
            code;

          room.hostId =
            playerId;

          rooms[code] =
            room;

          ws.room =
            code;

          room.clients.add(
            ws
          );

          room.players[playerId] =
            createPlayer(
              playerId,
              data.name,
              0,
              room
            );

          send(
            ws,
            {
              type:
                "roomCreated",

              room:
                code,

              host:
                true
            }
          );

          broadcastLobby(
            room
          );

          return;

        }

        if (
          data.type ===
          "joinRoom"
        ) {

          const code =
            String(
              data.room || ""
            )
            .trim()
            .toUpperCase();

          const room =
            rooms[code];

          if (!room) {

            send(
              ws,
              {
                type: "error",
                message:
                  "Roomi ei leitud."
              }
            );

            return;

          }

          if (
            room.started
          ) {

            send(
              ws,
              {
                type: "error",
                message:
                  "Mäng on juba alanud."
              }
            );

            return;

          }

          if (
            Object.keys(
              room.players
            ).length >=
            MAX_PLAYERS
          ) {

            send(
              ws,
              {
                type: "error",
                message:
                  "Tuba on täis."
              }
            );

            return;

          }

          ws.room =
            code;

          room.clients.add(
            ws
          );

          const index =
            Object.keys(
              room.players
            ).length;

          room.players[playerId] =
            createPlayer(
              playerId,
              data.name,
              index,
              room
            );

          send(
            ws,
            {
              type:
                "roomJoined",

              room:
                code,

              host:
                false
            }
          );

          broadcastLobby(
            room
          );

          return;

        }

        if (
          data.type ===
          "startGame"
        ) {

          const room =
            rooms[ws.room];

          if (!room) return;

          if (
            room.hostId !==
            playerId
          ) {

            send(
              ws,
              {
                type: "error",
                message:
                  "Ainult host saab mängu alustada."
              }
            );

            return;

          }

          startRoom(room);

          return;

        }

        if (
          data.type ===
          "aim"
        ) {

          const room =
            rooms[ws.room];

          if (!room) return;

          const player =
            room.players[
              playerId
            ];

          if (!player) return;

          if (
            typeof data.angle ===
            "number"
          ) {

            player.targetAngle =
              data.angle;

          }

          return;

        }

        if (
          data.type ===
          "boost"
        ) {

          const room =
            rooms[ws.room];

          if (!room) return;

          const player =
            room.players[
              playerId
            ];

          if (!player) return;

          player.boost =
            Boolean(
              data.active
            );

          return;

        }

      }
    );

    ws.on(
      "close",
      () => {

        const code =
          ws.room;

        if (!code) return;

        const room =
          rooms[code];

        if (!room) return;

        delete room.players[
          playerId
        ];

        room.clients.delete(
          ws
        );

        if (
          room.hostId ===
          playerId
        ) {

          const remaining =
            Object.keys(
              room.players
            );

          room.hostId =
            remaining[0] ||
            null;

        }

        if (
          room.clients.size ===
          0
        ) {

          clearInterval(
            room.interval
          );

          delete rooms[code];

          return;

        }

        if (
          room.started
        ) {

          broadcastState(
            room
          );

        } else {

          broadcastLobby(
            room
          );

        }

      }
    );

  }
);

server.listen(
  PORT,
  () => {

    console.log(
      "🐍 Snake server running on " +
      PORT
    );

  }
);
