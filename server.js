const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const server = http.createServer((req, res) => {

    let requested = decodeURIComponent(req.url.split("?")[0]);

    if (requested === "/") {
        requested = "/index.html";
    }

    const file = path.join(__dirname, requested);

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
        "Content-Type": types[ext] || "text/plain; charset=utf-8"
    });

    fs.createReadStream(file).pipe(res);
});

const wss = new WebSocket.Server({
    server
});

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

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(JSON.stringify(data));
    }
}

function sendLobby(room) {

    const players = [...room.players.values()].map(p => ({
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

function sendPlayers(room) {

    const players = {};

    for (const [id, p] of room.players) {

        players[id] = {
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

        id: Math.random()
            .toString(36)
            .substring(2, 10),

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

    send(ws, {
        type: "connected"
    });

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
                String(data.name || "Player")
                    .substring(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#63ff78";

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
                String(data.name || "Player")
                    .substring(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#63ff78";

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

        /* START GAME */

        if (data.type === "startGame") {

            const room = player.room;

            if (!room) {
                return;
            }

            if (!player.host) {
                return;
            }

            room.started = true;

            for (const p of room.players.values()) {

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
                    Math.max(
                        20,
                        Math.min(
                            500,
                            data.length
                        )
                    );
            }

            if (typeof data.color === "string") {
                player.color =
                    data.color.substring(0, 20);
            }

            if (typeof data.name === "string") {
                player.name =
                    data.name.substring(0, 16);
            }

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
                room.players.values()
                    .next()
                    .value;

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

/*
    Saadame kõikide mängijate asukohad
    umbes 20 korda sekundis.
*/

setInterval(() => {

    for (const room of rooms.values()) {

        if (room.started) {
            sendPlayers(room);
        }
    }

}, 50);

server.listen(PORT, () => {

    console.log(
        `Snake Arena server töötab pordil ${PORT}`
    );
});
