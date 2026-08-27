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

function makeRoomCode() {
    let code;

    do {
        code = Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase();
    } while (rooms.has(code));

    return code;
}

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(room, data) {
    for (const player of room.players.values()) {
        send(player.ws, data);
    }
}

function state(room) {
    return {
        type: "state",
        players: [...room.players.values()].map(p => ({
            id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            angle: p.angle,
            length: p.length,
            score: p.score,
            kills: p.kills,
            color: p.color,
            body: p.body
        }))
    };
}

wss.on("connection", ws => {

    const player = {
        id: Math.random().toString(36).substring(2, 10),
        ws,
        room: null,

        name: "Player",
        x: 9000,
        y: 9000,
        angle: 0,

        length: 25,
        score: 0,
        kills: 0,

        color: "#63ff78",
        body: []
    };

    send(ws, {
        type: "connected",
        id: player.id
    });

    ws.on("message", message => {

        let data;

        try {
            data = JSON.parse(message.toString());
        } catch {
            return;
        }

        if (data.type === "create") {

            if (player.room) return;

            const code = makeRoomCode();

            const room = {
                code,
                players: new Map(),
                started: false
            };

            rooms.set(code, room);
            player.room = room;

            player.name =
                String(data.name || "Player")
                .replace(/[<>]/g, "")
                .substring(0, 16);

            player.color =
                typeof data.color === "string"
                    ? data.color
                    : "#63ff78";

            room.players.set(player.id, player);

            send(ws, {
                type: "created",
                code,
                id: player.id
            });

            broadcast(room, state(room));
            return;
        }

        if (data.type === "join") {

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

            if (room.players.size >= 10) {
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

            player.x =
                2000 +
                Math.random() * 14000;

            player.y =
                2000 +
                Math.random() * 14000;

            player.angle =
                Math.random() * Math.PI * 2;

            room.players.set(player.id, player);

            send(ws, {
                type: "joined",
                code,
                id: player.id
            });

            broadcast(room, state(room));
            return;
        }

        if (data.type === "start") {

            if (!player.room) return;

            player.room.started = true;

            broadcast(player.room, {
                type: "startGame"
            });

            return;
        }

        if (data.type === "update") {

            if (!player.room) return;

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

            if (Array.isArray(data.body))
                player.body = data.body.slice(0, 250);

            broadcast(player.room, state(player.room));
        }

        if (data.type === "kill") {

            if (!player.room) return;

            player.kills++;
            player.score += 10;

            broadcast(player.room, {
                type: "kill",
                killer: player.id,
                victim: data.victim
            });
        }
    });

    ws.on("close", () => {

        if (!player.room) return;

        const room = player.room;

        room.players.delete(player.id);

        if (room.players.size === 0) {
            rooms.delete(room.code);
        } else {
            broadcast(room, state(room));
        }
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("Snake Arena server running on port " + PORT);
});
