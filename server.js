const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 12000;

const rooms = new Map();

function makeId() {
    return Math.random().toString(36).substring(2, 10);
}

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
            skin: p.skin,
            host: p.host
        });
    }

    broadcast(room, {
        type: "lobby",
        players
    });
}

function playerStates(room) {
    const players = {};

    for (const p of room.players.values()) {
        players[p.id] = {
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

    broadcast(room, {
        type: "players",
        players
    });
}

function createPlayer(ws) {
    return {
        id: makeId(),
        ws,

        name: "Player",
        color: "#63ff78",
        skin: "green",

        room: null,
        host: false,

        x: Math.random() * WORLD,
        y: Math.random() * WORLD,

        angle: 0,
        length: 20,

        alive: true,
        score: 0
    };
}

const server = http.createServer((req, res) => {
    let urlPath = req.url.split("?")[0];

    if (urlPath === "/") {
        urlPath = "/index.html";
    }

    const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
    const filePath = path.join(__dirname, safePath);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("Not found");
        return;
    }

    const ext = path.extname(filePath).toLowerCase();

    const types = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8"
    };

    res.writeHead(200, {
        "Content-Type": types[ext] || "application/octet-stream"
    });

    fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocket.Server({
    server
});

wss.on("connection", (ws) => {
    const player = createPlayer(ws);

    ws.player = player;

    send(ws, {
        type: "connected",
        id: player.id
    });

    ws.on("message", (raw) => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        if (!data || typeof data.type !== "string") {
            return;
        }

        /* CREATE ROOM */

        if (data.type === "createRoom") {
            if (player.room) {
                return;
            }

            const roomCode = makeRoomCode();

            const room = {
                code: roomCode,
                hostId: player.id,
                started: false,
                players: new Map()
            };

            player.name =
                String(data.name || "Player")
                    .substring(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#63ff78";

            player.skin =
                typeof data.skin === "string"
                    ? data.skin
                    : "green";

            player.room = room;
            player.host = true;

            player.x = 6000;
            player.y = 6000;
            player.alive = true;
            player.length = 20;

            room.players.set(player.id, player);
            rooms.set(roomCode, room);

            send(ws, {
                type: "roomCreated",
                code: roomCode,
                id: player.id
            });

            lobby(room);
            return;
        }

        /* JOIN ROOM */

        if (data.type === "joinRoom") {
            if (player.room) {
                return;
            }

            const code =
                String(data.code || "")
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

            player.name =
                String(data.name || "Player")
                    .substring(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#4da6ff";

            player.skin =
                typeof data.skin === "string"
                    ? data.skin
                    : "blue";

            player.room = room;
            player.host = false;

            player.x =
                1500 +
                Math.random() * 9000;

            player.y =
                1500 +
                Math.random() * 9000;

            player.alive = true;
            player.length = 20;

            room.players.set(player.id, player);

            send(ws, {
                type: "roomJoined",
                code,
                id: player.id
            });

            lobby(room);
            return;
        }

        /* START */

        if (data.type === "startGame") {
            const room = player.room;

            if (!room) {
                return;
            }

            if (player.id !== room.hostId) {
                send(ws, {
                    type: "error",
                    message: "Ainult host saab mängu alustada."
                });
                return;
            }

            room.started = true;

            for (const p of room.players.values()) {
                p.alive = true;
                p.length = 20;

                if (p.x < 200 || p.x > WORLD - 200) {
                    p.x = 1000 + Math.random() * 10000;
                }

                if (p.y < 200 || p.y > WORLD - 200) {
                    p.y = 1000 + Math.random() * 10000;
                }

                send(p.ws, {
                    type: "gameStart",
                    id: p.id,
                    world: WORLD
                });
            }

            return;
        }

        /* PLAYER STATE */

        if (data.type === "state") {
            const room = player.room;

            if (!room || !room.started || !player.alive) {
                return;
            }

            if (Number.isFinite(data.x)) {
                player.x = Math.max(
                    20,
                    Math.min(WORLD - 20, data.x)
                );
            }

            if (Number.isFinite(data.y)) {
                player.y = Math.max(
                    20,
                    Math.min(WORLD - 20, data.y)
                );
            }

            if (Number.isFinite(data.angle)) {
                player.angle = data.angle;
            }

            if (Number.isFinite(data.length)) {
                player.length = Math.max(
                    20,
                    Math.min(500, data.length)
                );
            }

            if (typeof data.name === "string") {
                player.name =
                    data.name.substring(0, 16);
            }

            if (typeof data.color === "string") {
                player.color = data.color;
            }

            if (typeof data.skin === "string") {
                player.skin = data.skin;
            }

            return;
        }

        /* ATTACK */

        if (data.type === "attack") {
            const room = player.room;

            if (!room || !room.started || !player.alive) {
                return;
            }

            const target = room.players.get(data.targetId);

            if (!target || target.id === player.id || !target.alive) {
                return;
            }

            const dx = target.x - player.x;
            const dy = target.y - player.y;

            const distance = Math.hypot(dx, dy);

            const reach =
                80 +
                Math.min(player.length, 250) * 0.12;

            if (distance <= reach) {
                target.alive = false;

                player.score += 100;
                player.length += 10;

                send(target.ws, {
                    type: "gameOver",
                    reason: player.name + " elimineeris sind!"
                });

                send(player.ws, {
                    type: "kill",
                    target: target.id,
                    score: player.score
                });

                broadcast(room, {
                    type: "playerKilled",
                    id: target.id,
                    by: player.id
                });
            }

            return;
        }

        /* RESPAWN */

        if (data.type === "respawn") {
            if (!player.room) {
                return;
            }

            player.x =
                1000 +
                Math.random() * 10000;

            player.y =
                1000 +
                Math.random() * 10000;

            player.angle =
                Math.random() * Math.PI * 2;

            player.length = 20;
            player.score = 0;
            player.alive = true;

            send(player.ws, {
                type: "respawned"
            });

            return;
        }
    });

    ws.on("close", () => {
        const room = player.room;

        if (!room) {
            return;
        }

        room.players.delete(player.id);

        if (room.players.size === 0) {
            rooms.delete(room.code);
            return;
        }

        if (player.id === room.hostId) {
            const next = room.players.values().next().value;

            if (next) {
                next.host = true;
                room.hostId = next.id;
            }
        }

        lobby(room);
    });
});

/* Send world state */

setInterval(() => {
    for (const room of rooms.values()) {
        if (room.started) {
            playerStates(room);
        }
    }
}, 100);

server.listen(PORT, "0.0.0.0", () => {
    console.log("Snake Arena server running on port " + PORT);
});
