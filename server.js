const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const rooms = new Map();

function makeCode() {
    let code;

    do {
        code = Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase();
    } while (rooms.has(code));

    return code;
}

function cleanPlayer(p) {
    return {
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        angle: p.angle,
        length: p.length,
        score: p.score,
        kills: p.kills,
        color: p.color,
        skin: p.skin,
        body: Array.isArray(p.body)
            ? p.body.slice(0, 300)
            : []
    };
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

function roomState(room) {
    return {
        type: "state",
        players: Array.from(room.players.values()).map(cleanPlayer)
    };
}

function updateRoom(room) {
    broadcast(room, roomState(room));
}

wss.on("connection", (ws) => {

    const player = {
        id: Math.random().toString(36).substring(2, 10),
        ws,
        room: null,

        name: "Player",
        color: "#63ff78",
        skin: "green",

        x: 9000,
        y: 9000,
        angle: 0,

        length: 25,
        score: 0,
        kills: 0,

        body: []
    };

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
                message: "Vale sõnum serverile."
            });
            return;
        }

        if (data.type === "createRoom") {

            if (player.room) {
                send(ws, {
                    type: "error",
                    message: "Oled juba roomis."
                });
                return;
            }

            const code = makeCode();

            const room = {
                code,
                started: false,
                players: new Map()
            };

            player.room = room;
            player.name =
                String(data.name || "Player")
                    .replace(/[<>]/g, "")
                    .substring(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#63ff78";

            player.skin =
                String(data.skin || "green");

            room.players.set(
                player.id,
                player
            );

            rooms.set(code, room);

            send(ws, {
                type: "roomCreated",
                id: player.id,
                code
            });

            updateRoom(room);
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
                    message: "Sellist roomi ei ole."
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

            if (room.players.size >= 12) {
                send(ws, {
                    type: "error",
                    message: "Room on täis."
                });
                return;
            }

            player.room = room;

            player.name =
                String(data.name || "Player")
                    .replace(/[<>]/g, "")
                    .substring(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#4da6ff";

            player.skin =
                String(data.skin || "green");

            player.x =
                3000 +
                Math.random() * 12000;

            player.y =
                3000 +
                Math.random() * 12000;

            player.angle =
                Math.random() * Math.PI * 2;

            player.length = 25;
            player.score = 0;
            player.kills = 0;
            player.body = [];

            for (let i = 0; i < 25; i++) {
                player.body.push({
                    x:
                        player.x -
                        Math.cos(player.angle) * i * 8,
                    y:
                        player.y -
                        Math.sin(player.angle) * i * 8
                });
            }

            room.players.set(
                player.id,
                player
            );

            send(ws, {
                type: "roomJoined",
                id: player.id,
                code
            });

            updateRoom(room);
            return;
        }

        if (data.type === "startRoom") {

            const room = player.room;

            if (!room) {
                send(ws, {
                    type: "error",
                    message: "Sa ei ole roomis."
                });
                return;
            }

            if (room.players.size < 1) {
                send(ws, {
                    type: "error",
                    message: "Roomis pole mängijaid."
                });
                return;
            }

            room.started = true;

            broadcast(room, {
                type: "gameStarted"
            });

            updateRoom(room);
            return;
        }

        if (data.type === "input") {

            const room = player.room;

            if (!room) return;

            if (typeof data.x === "number")
                player.x = data.x;

            if (typeof data.y === "number")
                player.y = data.y;

            if (typeof data.angle === "number")
                player.angle = data.angle;

            if (typeof data.length === "number")
                player.length = data.length;

            if (typeof data.score === "number")
                player.score = data.score;

            if (typeof data.kills === "number")
                player.kills = data.kills;

            if (Array.isArray(data.body)) {
                player.body =
                    data.body.slice(0, 300);
            }

            updateRoom(room);
            return;
        }

        if (data.type === "kill") {

            const room = player.room;

            if (!room) return;

            const victim =
                room.players.get(data.victimId);

            if (!victim) return;

            player.kills++;
            player.score += 10;

            broadcast(room, {
                type: "kill",
                killerId: player.id,
                victimId: victim.id
            });

            return;
        }

    });

    ws.on("close", () => {

        const room = player.room;

        if (!room) return;

        room.players.delete(
            player.id
        );

        if (room.players.size === 0) {
            rooms.delete(room.code);
        } else {
            updateRoom(room);
        }

    });

});

setInterval(() => {

    for (const room of rooms.values()) {

        if (!room.started)
            continue;

        updateRoom(room);

    }

}, 100);

server.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Snake Arena running on port ${PORT}`
    );

});
