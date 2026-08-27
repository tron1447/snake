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

function roomCode() {
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
    for (const p of room.players.values()) {
        send(p.ws, data);
    }
}

function cleanName(name) {
    return String(name || "Player")
        .replace(/[<>]/g, "")
        .substring(0, 16) || "Player";
}

function getState(room) {
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

    const p = {
        id: Math.random()
            .toString(36)
            .substring(2, 10),

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
        id: p.id
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

        if (data.type === "create") {

            if (p.room) return;

            const code = roomCode();

            const room = {
                code,
                players: new Map()
            };

            rooms.set(code, room);

            p.room = room;

            p.name =
                cleanName(data.name);

            p.color =
                typeof data.color === "string"
                    ? data.color
                    : "#63ff78";

            p.x =
                2000 +
                Math.random() * 14000;

            p.y =
                2000 +
                Math.random() * 14000;

            room.players.set(
                p.id,
                p
            );

            send(ws, {
                type: "created",
                code,
                id: p.id
            });

            broadcast(
                room,
                getState(room)
            );

            return;
        }

        if (data.type === "join") {

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

            if (room.players.size >= 12) {

                send(ws, {
                    type: "error",
                    message: "Room on täis."
                });

                return;
            }

            p.room = room;

            p.name =
                cleanName(data.name);

            p.color =
                typeof data.color === "string"
                    ? data.color
                    : "#4da6ff";

            p.x =
                1500 +
                Math.random() * 15000;

            p.y =
                1500 +
                Math.random() * 15000;

            p.angle =
                Math.random() *
                Math.PI * 2;

            room.players.set(
                p.id,
                p
            );

            send(ws, {
                type: "joined",
                code,
                id: p.id
            });

            broadcast(
                room,
                getState(room)
            );

            return;
        }

        if (data.type === "start") {

            if (!p.room) return;

            broadcast(
                p.room,
                {
                    type: "startGame"
                }
            );

            return;
        }

        if (data.type === "update") {

            if (!p.room) return;

            if (
                Number.isFinite(data.x)
            )
                p.x = data.x;

            if (
                Number.isFinite(data.y)
            )
                p.y = data.y;

            if (
                Number.isFinite(data.angle)
            )
                p.angle = data.angle;

            if (
                Number.isFinite(data.length)
            )
                p.length = data.length;

            if (
                Number.isFinite(data.score)
            )
                p.score = data.score;

            if (
                Number.isFinite(data.kills)
            )
                p.kills = data.kills;

            if (
                Array.isArray(data.body)
            )
                p.body =
                    data.body.slice(
                        0,
                        220
                    );

            broadcast(
                p.room,
                getState(p.room)
            );

            return;
        }

        if (data.type === "kill") {

            if (!p.room) return;

            p.kills++;
            p.score += 10;

            broadcast(
                p.room,
                {
                    type: "kill",
                    killer: p.id,
                    victim: data.victim
                }
            );
        }
    });

    ws.on("close", () => {

        if (!p.room) return;

        const room = p.room;

        room.players.delete(
            p.id
        );

        if (
            room.players.size === 0
        ) {

            rooms.delete(
                room.code
            );

        } else {

            broadcast(
                room,
                getState(room)
            );

        }
    });
});

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Snake Arena running on ${PORT}`
        );
    }
);
