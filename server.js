const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const rooms = new Map();

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

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

function broadcastLobby(room) {
    const players = [];

    for (const p of room.players.values()) {
        players.push({
            id: p.id,
            name: p.name,
            color: p.color,
            host: p.host
        });
    }

    for (const p of room.players.values()) {
        send(p.ws, {
            type: "lobby",
            players
        });
    }
}

function broadcastPlayers(room) {
    const players = {};

    for (const [id, p] of room.players) {
        players[id] = {
            id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            angle: p.angle,
            length: p.length,
            color: p.color,
            skin: p.skin
        };
    }

    for (const p of room.players.values()) {
        send(p.ws, {
            type: "players",
            players
        });
    }
}

const server = http.createServer((req, res) => {
    let requestPath = req.url.split("?")[0];

    if (requestPath === "/") {
        requestPath = "/index.html";
    }

    const safePath = path.normalize(requestPath).replace(/^(\.\.[\/\\])+/, "");

    const filePath = path.join(__dirname, safePath);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const ext = path.extname(filePath).toLowerCase();

    const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml"
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

    const player = {
        id: makeId(),
        ws,

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

    send(ws, {
        type: "connected",
        id: player.id
    });

    ws.on("message", (raw) => {

        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            send(ws, {
                type: "error",
                message: "Server sai vigase sõnumi."
            });
            return;
        }

        /*
        ==========================
        CREATE ROOM
        ==========================
        */

        if (data.type === "createRoom") {

            if (player.room) {
                send(ws, {
                    type: "error",
                    message: "Oled juba toas."
                });
                return;
            }

            const roomCode = makeRoomCode();

            const room = {
                code: roomCode,
                started: false,
                players: new Map()
            };

            player.name =
                String(data.name || "Player")
                    .trim()
                    .substring(0, 16) || "Player";

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

            room.players.set(player.id, player);

            rooms.set(roomCode, room);

            send(ws, {
                type: "roomCreated",
                code: roomCode,
                id: player.id,
                host: true
            });

            broadcastLobby(room);

            console.log(
                `Room created: ${roomCode} by ${player.name}`
            );

            return;
        }

        /*
        ==========================
        JOIN ROOM
        ==========================
        */

        if (data.type === "joinRoom") {

            if (player.room) {
                send(ws, {
                    type: "error",
                    message: "Oled juba toas."
                });
                return;
            }

            const code =
                String(data.code || "")
                    .trim()
                    .toUpperCase();

            if (!/^[A-Z0-9]{6}$/.test(code)) {
                send(ws, {
                    type: "error",
                    message: "Room code peab olema 6 märki."
                });
                return;
            }

            const room = rooms.get(code);

            if (!room) {
                send(ws, {
                    type: "error",
                    message: "Seda roomi ei ole olemas."
                });
                return;
            }

            if (room.started) {
                send(ws, {
                    type: "error",
                    message: "See mäng on juba alanud."
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
                String(data.name || "Player")
                    .trim()
                    .substring(0, 16) || "Player";

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

            room.players.set(player.id, player);

            send(ws, {
                type: "roomJoined",
                code: room.code,
                id: player.id,
                host: false
            });

            broadcastLobby(room);

            console.log(
                `${player.name} joined room ${room.code}`
            );

            return;
        }

        /*
        ==========================
        START GAME
        ==========================
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

            if (room.players.size < 1) {
                return;
            }

            room.started = true;

            for (const p of room.players.values()) {

                p.x =
                    3000 +
                    Math.random() * 14000;

                p.y =
                    3000 +
                    Math.random() * 14000;

                p.angle =
                    Math.random() *
                    Math.PI *
                    2;

                send(p.ws, {
                    type: "gameStart",
                    id: p.id
                });
            }

            console.log(
                `Game started in room ${room.code}`
            );

            return;
        }

        /*
        ==========================
        PLAYER STATE
        ==========================
        */

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
                    Math.max(5, Math.min(1000, data.length));
            }

            if (typeof data.color === "string") {
                player.color = data.color;
            }

            if (typeof data.skin === "string") {
                player.skin = data.skin;
            }

            if (typeof data.name === "string") {
                player.name =
                    data.name.substring(0, 16);
            }

            return;
        }

        /*
        ==========================
        LEAVE ROOM
        ==========================
        */

        if (data.type === "leaveRoom") {

            leaveRoom(player);

            return;
        }

    });

    ws.on("close", () => {
        leaveRoom(player);
    });

    ws.on("error", () => {
        leaveRoom(player);
    });
});

function leaveRoom(player) {

    const room = player.room;

    if (!room) {
        return;
    }

    room.players.delete(player.id);

    player.room = null;

    /*
    Kui host lahkub,
    antakse host järgmisele mängijale.
    */

    if (player.host && room.players.size > 0) {

        const next =
            room.players.values().next().value;

        if (next) {
            next.host = true;
        }
    }

    if (room.players.size === 0) {

        rooms.delete(room.code);

        console.log(
            `Room deleted: ${room.code}`
        );

    } else {

        broadcastLobby(room);
    }
}

setInterval(() => {

    for (const room of rooms.values()) {

        if (room.started) {
            broadcastPlayers(room);
        }
    }

}, 100);

server.listen(PORT, () => {

    console.log(
        `Snake Arena server running on port ${PORT}`
    );

});
