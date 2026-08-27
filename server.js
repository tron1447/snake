const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const rooms = new Map();

function makeRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {
        code = "";

        for (let i = 0; i < 5; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));

    return code;
}

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(room, data) {
    if (!room) return;

    for (const player of room.players.values()) {
        send(player.ws, data);
    }
}

function roomPlayers(room) {
    return [...room.players.values()].map(p => ({
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
        body: p.body
    }));
}

function broadcastPlayers(room) {
    broadcast(room, {
        type: "state",
        players: roomPlayers(room)
    });
}

function removeFromRoom(player) {
    if (!player.room) return;

    const room = rooms.get(player.room);

    if (!room) {
        player.room = null;
        return;
    }

    room.players.delete(player.id);

    if (room.players.size === 0) {
        rooms.delete(player.room);
    } else {
        broadcast(room, {
            type: "playerLeft",
            id: player.id
        });

        broadcastPlayers(room);
    }

    player.room = null;
}

wss.on("connection", ws => {

    const player = {
        id:
            Math.random().toString(36).slice(2) +
            Date.now().toString(36),

        ws,

        room: null,

        name: "Player",

        x: 8000,

        y: 8000,

        angle: 0,

        length: 25,

        score: 0,

        kills: 0,

        color: "#63ff78",

        skin: "green",

        body: []
    };

    ws.on("message", raw => {

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

            removeFromRoom(player);

            const code = makeRoomCode();

            const room = {
                code,
                players: new Map()
            };

            rooms.set(code, room);

            player.room = code;

            player.name =
                cleanName(data.name || "Player");

            player.color =
                cleanColor(data.color);

            player.skin =
                cleanSkin(data.skin);

            room.players.set(
                player.id,
                player
            );

            send(ws, {
                type: "roomCreated",
                code,
                id: player.id
            });

            broadcastPlayers(room);

            return;
        }

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
                    message: "Seda roomi ei ole."
                });

                return;
            }

            if (room.players.size >= 16) {

                send(ws, {
                    type: "error",
                    message: "Room on täis."
                });

                return;
            }

            removeFromRoom(player);

            player.room = code;

            player.name =
                cleanName(data.name || "Player");

            player.color =
                cleanColor(data.color);

            player.skin =
                cleanSkin(data.skin);

            player.x =
                3000 +
                Math.random() * 10000;

            player.y =
                3000 +
                Math.random() * 10000;

            player.angle =
                Math.random() *
                Math.PI * 2;

            player.length = 25;
            player.score = 0;
            player.kills = 0;

            player.body = [];

            for (let i = 0; i < 25; i++) {

                player.body.push({
                    x:
                        player.x -
                        Math.cos(player.angle) *
                        i *
                        8,

                    y:
                        player.y -
                        Math.sin(player.angle) *
                        i *
                        8
                });
            }

            room.players.set(
                player.id,
                player
            );

            send(ws, {
                type: "roomJoined",
                code,
                id: player.id
            });

            broadcastPlayers(room);

            return;
        }

        if (data.type === "startRoom") {

            if (!player.room) return;

            const room =
                rooms.get(player.room);

            if (!room) return;

            room.started = true;

            broadcast(room, {
                type: "gameStarted"
            });

            return;
        }

        if (data.type === "input") {

            if (!player.room) return;

            const room =
                rooms.get(player.room);

            if (!room) return;

            if (typeof data.x === "number") {
                player.x = data.x;
            }

            if (typeof data.y === "number") {
                player.y = data.y;
            }

            if (typeof data.angle === "number") {
                player.angle = data.angle;
            }

            if (typeof data.length === "number") {
                player.length = data.length;
            }

            if (typeof data.score === "number") {
                player.score = data.score;
            }

            if (typeof data.kills === "number") {
                player.kills = data.kills;
            }

            if (Array.isArray(data.body)) {

                player.body =
                    data.body
                        .slice(0, 300)
                        .map(p => ({
                            x: Number(p.x) || 0,
                            y: Number(p.y) || 0
                        }));
            }

            return;
        }

        if (data.type === "kill") {

            if (!player.room) return;

            const room =
                rooms.get(player.room);

            if (!room) return;

            const victim =
                room.players.get(data.victimId);

            if (!victim) return;

            player.kills++;
            player.score += 10;

            victim.score = 0;
            victim.kills = 0;
            victim.length = 25;

            victim.x =
                2000 +
                Math.random() * 12000;

            victim.y =
                2000 +
                Math.random() * 12000;

            broadcast(room, {
                type: "kill",
                killerId: player.id,
                victimId: victim.id,
                killerName: player.name
            });

            return;
        }

        if (data.type === "leaveRoom") {
            removeFromRoom(player);
            return;
        }

    });

    ws.on("close", () => {
        removeFromRoom(player);
    });
});

function cleanName(name) {

    return String(name)
        .replace(/[<>]/g, "")
        .slice(0, 16)
        .trim() || "Player";
}

function cleanColor(color) {

    if (
        typeof color !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(color)
    ) {
        return "#63ff78";
    }

    return color;
}

function cleanSkin(skin) {

    const allowed = [
        "green",
        "blue",
        "red",
        "yellow",
        "purple",
        "orange",
        "cyan",
        "white"
    ];

    return allowed.includes(skin)
        ? skin
        : "green";
}

setInterval(() => {

    for (const room of rooms.values()) {

        broadcastPlayers(room);
    }

}, 80);

server.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Snake Arena running on port ${PORT}`
    );

});
