const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 20000;
const MAX_PLAYERS = 20;

const rooms = new Map();

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function id() {
    return Math.random().toString(36).substring(2, 10);
}

function roomCode() {
    let code;

    do {
        code = Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();
    } while (rooms.has(code));

    return code;
}

function cleanName(name) {
    return String(name || "Player")
        .replace(/[<>]/g, "")
        .trim()
        .substring(0, 16) || "Player";
}

function broadcastLobby(room) {
    const players = [...room.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        skin: p.skin,
        host: p.host
    }));

    for (const p of room.players.values()) {
        send(p.ws, {
            type: "lobby",
            players
        });
    }
}

function broadcastPlayers(room) {
    const players = {};

    for (const p of room.players.values()) {
        players[p.id] = {
            id: p.id,
            name: p.name,
            color: p.color,
            skin: p.skin,
            x: p.x,
            y: p.y,
            angle: p.angle,
            length: p.length,
            alive: p.alive
        };
    }

    for (const p of room.players.values()) {
        send(p.ws, {
            type: "players",
            players
        });
    }
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function killPlayer(room, victim, killer) {
    if (!victim.alive) return;

    victim.alive = false;

    if (killer && killer !== victim) {
        killer.kills++;
        killer.length += Math.max(5, victim.length * 0.25);
        killer.score += Math.floor(victim.length * 5);

        send(killer.ws, {
            type: "kill",
            name: victim.name,
            score: killer.score
        });
    }

    send(victim.ws, {
        type: "gameOver",
        reason: killer
            ? `${killer.name} tappis sind!`
            : "Sind tapetud!"
    });
}

function checkCombat(room) {
    const players = [...room.players.values()]
        .filter(p => p.alive);

    for (const victim of players) {

        for (const killer of players) {

            if (victim === killer) continue;

            /*
             * Kui ohvri pea on teise mao keha lähedal,
             * siis ohver sureb.
             */

            const bodyLength = Math.min(
                300,
                Math.floor(killer.length)
            );

            let hit = false;

            for (
                let i = 5;
                i < bodyLength;
                i += 3
            ) {
                const bx =
                    killer.x -
                    Math.cos(killer.angle) * i * 8;

                const by =
                    killer.y -
                    Math.sin(killer.angle) * i * 8;

                const d = Math.hypot(
                    victim.x - bx,
                    victim.y - by
                );

                if (d < 25) {
                    hit = true;
                    break;
                }
            }

            if (hit) {
                killPlayer(
                    room,
                    victim,
                    killer
                );
                break;
            }
        }
    }
}

const server = http.createServer((req, res) => {

    let url = req.url.split("?")[0];

    if (url === "/") {
        url = "/index.html";
    }

    const file = path.join(
        __dirname,
        url.replace(/^\/+/, "")
    );

    if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const ext = path.extname(file);

    const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8"
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
        id: id(),
        ws,

        name: "Player",

        color: "#63ff78",
        skin: "green",

        room: null,
        host: false,

        x: 10000,
        y: 10000,

        angle: 0,

        length: 20,

        score: 0,
        kills: 0,

        alive: true
    };

    ws.player = player;

    send(ws, {
        type: "connected",
        id: player.id
    });

    ws.on("message", raw => {

        let data;

        try {
            data = JSON.parse(
                raw.toString()
            );
        } catch {
            return;
        }

        /*
        CREATE ROOM
        */

        if (data.type === "createRoom") {

            if (player.room) {
                send(ws, {
                    type: "error",
                    message: "Oled juba roomis."
                });
                return;
            }

            const code = roomCode();

            const room = {
                code,
                started: false,
                players: new Map()
            };

            player.name =
                cleanName(data.name);

            if (typeof data.color === "string") {
                player.color = data.color;
            }

            if (typeof data.skin === "string") {
                player.skin = data.skin;
            }

            player.room = room;
            player.host = true;

            room.players.set(
                player.id,
                player
            );

            rooms.set(
                code,
                room
            );

            send(ws, {
                type: "roomCreated",
                code,
                id: player.id,
                host: true
            });

            broadcastLobby(room);

            console.log(
                "ROOM CREATED:",
                code
            );

            return;
        }

        /*
        JOIN ROOM
        */

        if (data.type === "joinRoom") {

            const code =
                String(data.code || "")
                    .trim()
                    .toUpperCase();

            const room =
                rooms.get(code);

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

            if (room.players.size >= MAX_PLAYERS) {
                send(ws, {
                    type: "error",
                    message: "Room on täis."
                });
                return;
            }

            player.name =
                cleanName(data.name);

            if (typeof data.color === "string") {
                player.color = data.color;
            }

            if (typeof data.skin === "string") {
                player.skin = data.skin;
            }

            player.room = room;
            player.host = false;

            room.players.set(
                player.id,
                player
            );

            send(ws, {
                type: "roomJoined",
                code,
                id: player.id,
                host: false
            });

            broadcastLobby(room);

            console.log(
                player.name,
                "JOINED",
                code
            );

            return;
        }

        /*
        START GAME
        */

        if (data.type === "startGame") {

            const room = player.room;

            if (!room) {
                send(ws, {
                    type: "error",
                    message: "Sa ei ole roomis."
                });
                return;
            }

            if (!player.host) {
                send(ws, {
                    type: "error",
                    message: "Ainult host saab mängu alustada."
                });
                return;
            }

            room.started = true;

            let index = 0;

            for (const p of room.players.values()) {

                const angle =
                    (index / room.players.size) *
                    Math.PI * 2;

                p.x =
                    10000 +
                    Math.cos(angle) * 2500;

                p.y =
                    10000 +
                    Math.sin(angle) * 2500;

                p.angle =
                    angle + Math.PI;

                p.length = 20;
                p.score = 0;
                p.kills = 0;
                p.alive = true;

                send(p.ws, {
                    type: "gameStart",
                    id: p.id
                });

                index++;
            }

            console.log(
                "GAME START:",
                room.code
            );

            return;
        }

        /*
        PLAYER STATE
        */

        if (data.type === "state") {

            if (!player.room) return;

            if (!player.alive) return;

            if (Number.isFinite(data.x)) {
                player.x = Math.max(
                    20,
                    Math.min(
                        WORLD - 20,
                        data.x
                    )
                );
            }

            if (Number.isFinite(data.y)) {
                player.y = Math.max(
                    20,
                    Math.min(
                        WORLD - 20,
                        data.y
                    )
                );
            }

            if (Number.isFinite(data.angle)) {
                player.angle = data.angle;
            }

            if (Number.isFinite(data.length)) {
                player.length = Math.max(
                    10,
                    Math.min(
                        1000,
                        data.length
                    )
                );
            }

            if (typeof data.color === "string") {
                player.color = data.color;
            }

            if (typeof data.skin === "string") {
                player.skin = data.skin;
            }

            if (typeof data.name === "string") {
                player.name =
                    cleanName(data.name);
            }

            return;
        }
    });

    ws.on("close", () => {

        const room = player.room;

        if (!room) return;

        room.players.delete(
            player.id
        );

        if (player.host) {

            const next =
                room.players
                    .values()
                    .next()
                    .value;

            if (next) {
                next.host = true;
            }
        }

        if (room.players.size === 0) {

            rooms.delete(
                room.code
            );

        } else {

            broadcastLobby(room);
        }
    });
});

setInterval(() => {

    for (const room of rooms.values()) {

        if (!room.started) continue;

        checkCombat(room);

        broadcastPlayers(room);
    }

}, 100);

server.listen(PORT, () => {

    console.log(
        "Snake Arena running on port",
        PORT
    );
});
