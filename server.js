```js
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

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

function sendLobby(room) {
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

function sendPlayers(room) {
    const players = {};

    for (const [id, p] of room.players) {
        players[id] = {
            x: p.x,
            y: p.y,
            angle: p.angle,
            length: p.length,
            color: p.color,
            skin: p.skin,
            name: p.name
        };
    }

    broadcast(room, {
        type: "players",
        players
    });
}

function killPlayer(room, victimId, killerId) {

    const victim = room.players.get(victimId);
    const killer = room.players.get(killerId);

    if (!victim || !killer) {
        return;
    }

    send(victim.ws, {
        type: "gameOver",
        reason: "Sind tapeti!"
    });

    broadcast(room, {
        type: "playerKilled",
        id: victimId,
        killer: killerId
    });

    victim.length = 20;

    victim.x = 2000 + Math.random() * 16000;
    victim.y = 2000 + Math.random() * 16000;
}

const server = http.createServer((req, res) => {

    let requestPath = req.url.split("?")[0];

    if (requestPath === "/") {
        requestPath = "/index.html";
    }

    const filePath = path.join(
        __dirname,
        requestPath
    );

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const ext = path.extname(filePath);

    const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8"
    };

    res.writeHead(200, {
        "Content-Type": types[ext] || "text/plain; charset=utf-8"
    });

    fs.createReadStream(filePath).pipe(res);
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
        skin: "green",
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

        /* CREATE ROOM */

        if (data.type === "createRoom") {

            if (player.room) {
                return;
            }

            const code = makeRoomCode();

            const room = {
                code,
                started: false,
                players: new Map()
            };

            player.name =
                String(data.name || "Player").substring(0, 16);

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

            sendLobby(room);

            return;
        }

        /* JOIN ROOM */

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

            if (room.players.size >= 20) {
                send(ws, {
                    type: "error",
                    message: "Tuba on täis."
                });
                return;
            }

            player.name =
                String(data.name || "Player").substring(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#4da6ff";

            player.skin =
                typeof data.skin === "string"
                    ? data.skin
                    : "blue";

            player.room = room;

            room.players.set(
                player.id,
                player
            );

            send(ws, {
                type: "roomJoined",
                code,
                id: player.id
            });

            sendLobby(room);

            return;
        }

        /* START */

        if (data.type === "startGame") {

            const room = player.room;

            if (!room) {
                return;
            }

            if (!player.host) {
                return;
            }

            if (room.players.size < 1) {
                return;
            }

            room.started = true;

            for (const p of room.players.values()) {

                p.x =
                    2000 +
                    Math.random() * 16000;

                p.y =
                    2000 +
                    Math.random() * 16000;

                p.angle =
                    Math.random() *
                    Math.PI *
                    2;

                p.length = 20;

                send(p.ws, {
                    type: "gameStart",
                    id: p.id
                });
            }

            return;
        }

        /* PLAYER STATE */

        if (data.type === "state") {

            if (!player.room) {
                return;
            }

            if (Number.isFinite(data.x)) {
                player.x = data.x;
            }

            if (Number.isFinite(data.y)) {
                player.y = data.y;
            }

            if (Number.isFinite(data.angle)) {
                player.angle = data.angle;
            }

            if (Number.isFinite(data.length)) {
                player.length =
                    Math.max(20, Math.min(1000, data.length));
            }

            if (typeof data.color === "string") {
                player.color = data.color.substring(0, 30);
            }

            if (typeof data.skin === "string") {
                player.skin = data.skin.substring(0, 20);
            }

            if (typeof data.name === "string") {
                player.name =
                    data.name.substring(0, 16);
            }

            return;
        }

        /* ATTACK */

        if (data.type === "attack") {

            const room = player.room;

            if (!room || !room.started) {
                return;
            }

            const target =
                room.players.get(String(data.target));

            if (!target || target === player) {
                return;
            }

            const distance =
                Math.hypot(
                    target.x - player.x,
                    target.y - player.y
                );

            if (distance > 80) {
                return;
            }

            if (player.length <= target.length * 1.05) {
                return;
            }

            killPlayer(
                room,
                target.id,
                player.id
            );

            return;
        }
    });

    ws.on("close", () => {

        const room = player.room;

        if (!room) {
            return;
        }

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
            sendLobby(room);
        }
    });
});

/* SEND POSITIONS */

setInterval(() => {

    for (const room of rooms.values()) {

        if (room.started) {
            sendPlayers(room);
        }
    }

}, 100);

server.listen(PORT, () => {
    console.log(`Snake Arena server running on port ${PORT}`);
});
```
