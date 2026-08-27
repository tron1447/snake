```js
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 20000;
const MAX_PLAYERS = 20;

const rooms = new Map();

function makeId() {
    return Math.random().toString(36).substring(2, 10);
}

function makeRoomCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (rooms.has(code));
    return code;
}

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(room, data) {
    for (const p of room.players.values()) {
        send(p.ws, data);
    }
}

function randomSpawn() {
    return {
        x: 1000 + Math.random() * (WORLD - 2000),
        y: 1000 + Math.random() * (WORLD - 2000)
    };
}

function respawnPlayer(p) {
    const pos = randomSpawn();

    p.x = pos.x;
    p.y = pos.y;
    p.angle = Math.random() * Math.PI * 2;
    p.length = 20;
    p.alive = true;
}

function lobby(room) {
    const players = [...room.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        host: p.host
    }));

    broadcast(room, {
        type: "lobby",
        players
    });
}

function playerData(p) {
    return {
        x: p.x,
        y: p.y,
        angle: p.angle,
        length: p.length,
        color: p.color,
        name: p.name,
        alive: p.alive
    };
}

function sendPlayers(room) {
    const players = {};

    for (const p of room.players.values()) {
        if (p.alive) {
            players[p.id] = playerData(p);
        }
    }

    broadcast(room, {
        type: "players",
        players
    });
}

function killPlayer(room, victim, killer) {
    if (!victim.alive) return;

    victim.alive = false;

    send(victim.ws, {
        type: "gameOver",
        reason: killer
            ? `${killer.name} tappis sind!`
            : "Sind tapeti!"
    });

    if (killer) {
        send(killer.ws, {
            type: "playerKilled",
            id: victim.id,
            name: victim.name
        });

        killer.length += Math.max(
            8,
            Math.floor(victim.length * 0.25)
        );

        broadcast(room, {
            type: "killFeed",
            killer: killer.name,
            victim: victim.name
        });
    }

    // Ohver muutub toiduks.
    const amount = Math.min(40, Math.floor(victim.length));

    for (let i = 0; i < amount; i++) {
        room.food.push({
            x: victim.x + (Math.random() - 0.5) * 180,
            y: victim.y + (Math.random() - 0.5) * 180,
            value: 1 + Math.floor(Math.random() * 3)
        });
    }

    setTimeout(() => {
        if (!room.players.has(victim.id)) return;

        respawnPlayer(victim);

        send(victim.ws, {
            type: "respawn"
        });
    }, 1800);
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

// Snake'i pea tabab teise snake'i keha.
function checkKills(room) {
    const players = [...room.players.values()]
        .filter(p => p.alive);

    for (const attacker of players) {
        for (const victim of players) {
            if (attacker.id === victim.id) continue;

            const victimBodyLength = Math.min(
                Math.floor(victim.length),
                220
            );

            // Victim'i keha punktid.
            for (let i = 7; i < victimBodyLength; i += 2) {
                const bx =
                    victim.x -
                    Math.cos(victim.angle) * i * 8;

                const by =
                    victim.y -
                    Math.sin(victim.angle) * i * 8;

                const d = Math.hypot(
                    attacker.x - bx,
                    attacker.y - by
                );

                if (d < 25) {
                    killPlayer(
                        room,
                        attacker,
                        victim
                    );

                    break;
                }
            }
        }
    }
}

// Väike anti-cheat: mängija ei saa serveri kaudu teleportida.
function updatePlayer(p, data) {
    if (Number.isFinite(data.angle)) {
        p.angle = data.angle;
    }

    if (Number.isFinite(data.x) &&
        Number.isFinite(data.y)) {

        const dx = data.x - p.x;
        const dy = data.y - p.y;
        const d = Math.hypot(dx, dy);

        if (d < 100) {
            p.x = data.x;
            p.y = data.y;
        }
    }

    if (Number.isFinite(data.length)) {
        p.length = Math.max(
            20,
            Math.min(1000, data.length)
        );
    }

    if (typeof data.color === "string") {
        p.color = data.color.substring(0, 20);
    }

    if (typeof data.name === "string") {
        p.name = data.name
            .substring(0, 16)
            .replace(/[<>]/g, "");
    }
}

const server = http.createServer((req, res) => {
    let requestPath = req.url.split("?")[0];

    if (requestPath === "/") {
        requestPath = "/index.html";
    }

    const file = path.join(
        __dirname,
        decodeURIComponent(requestPath)
    );

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
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json"
    };

    res.writeHead(200, {
        "Content-Type":
            types[ext] || "text/plain; charset=utf-8"
    });

    fs.createReadStream(file).pipe(res);
});

const wss = new WebSocket.Server({
    server
});

wss.on("connection", ws => {
    const player = {
        ws,
        id: makeId(),
        name: "Player",
        color: "#63ff78",
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

        // CREATE
        if (data.type === "createRoom") {
            if (player.room) return;

            const code = makeRoomCode();

            const room = {
                code,
                started: false,
                players: new Map(),
                food: []
            };

            for (let i = 0; i < 350; i++) {
                room.food.push({
                    x: Math.random() * WORLD,
                    y: Math.random() * WORLD,
                    value: 1 + Math.floor(Math.random() * 3)
                });
            }

            player.name =
                String(data.name || "Player")
                .substring(0, 16);

            player.color =
                String(data.color || "#63ff78");

            player.room = room;
            player.host = true;

            room.players.set(
                player.id,
                player
            );

            rooms.set(code, room);

            send(ws, {
                type: "roomCreated",
                code,
                id: player.id
            });

            lobby(room);

            return;
        }

        // JOIN
        if (data.type === "joinRoom") {
            const code =
                String(data.code || "")
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

            if (room.players.size >= MAX_PLAYERS) {
                send(ws, {
                    type: "error",
                    message: "Tuba on täis."
                });
                return;
            }

            player.name =
                String(data.name || "Player")
                .substring(0, 16);

            player.color =
                String(data.color || "#4da6ff");

            player.room = room;
            player.host = false;

            room.players.set(
                player.id,
                player
            );

            send(ws, {
                type: "roomJoined",
                code,
                id: player.id
            });

            lobby(room);

            return;
        }

        // START
        if (data.type === "startGame") {
            const room = player.room;

            if (!room || !player.host) return;

            room.started = true;

            for (const p of room.players.values()) {
                respawnPlayer(p);

                send(p.ws, {
                    type: "gameStart",
                    id: p.id
                });
            }

            return;
        }

        // STATE
        if (data.type === "state") {
            if (!player.room) return;
            if (!player.room.started) return;
            if (!player.alive) return;

            updatePlayer(player, data);

            return;
        }

        // FOOD
        if (data.type === "eatFood") {
            const room = player.room;

            if (!room || !room.started) return;
            if (!player.alive) return;

            let best = -1;

            for (let i = 0; i < room.food.length; i++) {
                if (
                    Math.hypot(
                        room.food[i].x - player.x,
                        room.food[i].y - player.y
                    ) < 35
                ) {
                    best = i;
                    break;
                }
            }

            if (best >= 0) {
                const food = room.food[best];

                player.length += food.value * 0.5;

                room.food.splice(best, 1);

                room.food.push({
                    x: Math.random() * WORLD,
                    y: Math.random() * WORLD,
                    value: 1 + Math.floor(Math.random() * 3)
                });
            }

            return;
        }
    });

    ws.on("close", () => {
        const room = player.room;

        if (!room) return;

        room.players.delete(player.id);

        if (player.host) {
            const next =
                room.players.values().next().value;

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

// Mänguloogika.
setInterval(() => {
    for (const room of rooms.values()) {
        if (!room.started) continue;

        checkKills(room);
        sendPlayers(room);
    }
}, 100);

// Saadame toidu eraldi.
setInterval(() => {
    for (const room of rooms.values()) {
        if (!room.started) continue;

        broadcast(room, {
            type: "food",
            food: room.food
        });
    }
}, 250);

server.listen(PORT, () => {
    console.log(
        `Snake Arena server töötab pordil ${PORT}`
    );
});
```
