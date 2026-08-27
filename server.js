const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const server = http.createServer((req, res) => {
    let url = req.url.split("?")[0];

    if (url === "/") url = "/index.html";

    const file = path.join(__dirname, url);

    if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end("Not found");
    }

    const ext = path.extname(file);

    const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json"
    };

    res.writeHead(200, {
        "Content-Type": types[ext] || "text/plain"
    });

    fs.createReadStream(file).pipe(res);
});

const wss = new WebSocket.Server({ server });

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
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

function lobby(room) {
    const players = [...room.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        host: p.host
    }));

    for (const p of room.players.values()) {
        send(p.ws, {
            type: "lobby",
            players
        });
    }
}

function gameState(room) {
    const players = {};

    for (const p of room.players.values()) {
        players[p.id] = {
            id: p.id,
            x: p.x,
            y: p.y,
            angle: p.angle,
            length: p.length,
            color: p.color,
            name: p.name
        };
    }

    for (const p of room.players.values()) {
        send(p.ws, {
            type: "players",
            players
        });
    }
}

wss.on("connection", ws => {

    const player = {
        ws,
        id: Math.random().toString(36).substring(2, 10),

        name: "Player",
        color: "#63ff78",

        room: null,
        host: false,

        x: 10000,
        y: 10000,

        angle: 0,
        length: 20
    };

    ws.player = player;

    ws.on("message", raw => {

        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        if (data.type === "createRoom") {

            if (player.room) return;

            const code = roomCode();

            const room = {
                code,
                started: false,
                players: new Map()
            };

            player.name =
                String(data.name || "Player").slice(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#63ff78";

            player.room = room;
            player.host = true;

            room.players.set(player.id, player);
            rooms.set(code, room);

            send(ws, {
                type: "roomCreated",
                code,
                id: player.id
            });

            lobby(room);

            return;
        }

        if (data.type === "joinRoom") {

            const code =
                String(data.code || "")
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

            if (room.players.size >= 20) {
                send(ws, {
                    type: "error",
                    message: "Room on täis."
                });
                return;
            }

            player.name =
                String(data.name || "Player").slice(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#4da6ff";

            player.room = room;

            room.players.set(player.id, player);

            send(ws, {
                type: "roomJoined",
                code,
                id: player.id
            });

            lobby(room);

            return;
        }

        if (data.type === "startGame") {

            const room = player.room;

            if (!room || !player.host) return;

            room.started = true;

            let i = 0;

            for (const p of room.players.values()) {

                p.x = 5000 + (i % 5) * 1200;
                p.y = 5000 + Math.floor(i / 5) * 1200;

                p.angle = Math.random() * Math.PI * 2;
                p.length = 20;

                send(p.ws, {
                    type: "gameStart",
                    id: p.id
                });

                i++;
            }

            return;
        }

        if (data.type === "state") {

            if (!player.room || !player.room.started) return;

            if (Number.isFinite(data.x))
                player.x = data.x;

            if (Number.isFinite(data.y))
                player.y = data.y;

            if (Number.isFinite(data.angle))
                player.angle = data.angle;

            if (Number.isFinite(data.length))
                player.length = data.length;

            if (typeof data.color === "string")
                player.color = data.color;

            if (typeof data.name === "string")
                player.name = data.name.slice(0, 16);

            return;
        }

        if (data.type === "leaveRoom") {
            removePlayer(player);
        }
    });

    ws.on("close", () => {
        removePlayer(player);
    });
});

function removePlayer(player) {

    const room = player.room;

    if (!room) return;

    room.players.delete(player.id);
    player.room = null;

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
}

setInterval(() => {

    for (const room of rooms.values()) {

        if (room.started) {
            gameState(room);
        }
    }

}, 100);

server.listen(PORT, () => {
    console.log("Snake server töötab pordil " + PORT);
});
