const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname)));

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

const rooms = new Map();
const clients = new Map();

const WORLD = 20000;

function randomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    do {
        code = "";

        for (let i = 0; i < 6; i++) {
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

function publicPlayers(room) {
    const result = {};

    for (const player of room.players.values()) {
        result[player.id] = {
            id: player.id,
            name: player.name,
            x: player.x,
            y: player.y,
            angle: player.angle,
            length: player.length,
            color: player.color,
            skin: player.skin,
            alive: player.alive,
            coins: player.coins
        };
    }

    return result;
}

function lobby(room) {
    const players = [];

    for (const p of room.players.values()) {
        players.push({
            id: p.id,
            name: p.name,
            color: p.color,
            skin: p.skin,
            host: p.id === room.host
        });
    }

    broadcast(room, {
        type: "lobby",
        players
    });
}

function createPlayer(ws) {
    const id =
        Math.random().toString(36).slice(2) +
        Date.now().toString(36);

    return {
        id,
        ws,
        room: null,
        name: "Player",
        color: "#63ff78",
        skin: "green",
        x: 10000,
        y: 10000,
        angle: 0,
        length: 20,
        alive: false,
        coins: 0
    };
}

function createRoom(player) {
    const code = randomCode();

    const room = {
        code,
        host: player.id,
        started: false,
        players: new Map()
    };

    rooms.set(code, room);
    room.players.set(player.id, player);

    player.room = code;

    return room;
}

function leaveRoom(player) {
    if (!player.room) return;

    const room = rooms.get(player.room);

    if (!room) {
        player.room = null;
        return;
    }

    room.players.delete(player.id);
    player.room = null;

    if (room.host === player.id) {
        const first = room.players.values().next().value;

        if (first) {
            room.host = first.id;
        }
    }

    if (room.players.size === 0) {
        rooms.delete(room.code);
    } else {
        lobby(room);
    }
}

function spawnPlayer(player) {
    player.x = 2000 + Math.random() * (WORLD - 4000);
    player.y = 2000 + Math.random() * (WORLD - 4000);

    player.angle = Math.random() * Math.PI * 2;
    player.length = 20;
    player.alive = true;
}

wss.on("connection", ws => {
    const player = createPlayer(ws);

    clients.set(player.id, player);

    send(ws, {
        type: "connected",
        id: player.id
    });

    ws.on("message", raw => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        if (!data || typeof data.type !== "string") {
            return;
        }

        if (data.type === "createRoom") {
            leaveRoom(player);

            player.name =
                String(data.name || "Player")
                .slice(0, 16);

            player.color =
                String(data.color || "#63ff78");

            player.skin =
                String(data.skin || "green");

            const room = createRoom(player);

            send(ws, {
                type: "roomCreated",
                code: room.code,
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
                    message: "Seda ruumi ei leitud."
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

            leaveRoom(player);

            player.name =
                String(data.name || "Player")
                .slice(0, 16);

            player.color =
                String(data.color || "#4da6ff");

            player.skin =
                String(data.skin || "blue");

            player.room = code;

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
            const room = rooms.get(player.room);

            if (!room) return;

            if (room.host !== player.id) {
                return;
            }

            room.started = true;

            for (const p of room.players.values()) {
                spawnPlayer(p);
            }

            broadcast(room, {
                type: "gameStart"
            });

            return;
        }

        if (data.type === "state") {
            const room = rooms.get(player.room);

            if (!room || !room.started) return;

            player.x =
                Math.max(
                    0,
                    Math.min(
                        WORLD,
                        Number(data.x) || player.x
                    )
                );

            player.y =
                Math.max(
                    0,
                    Math.min(
                        WORLD,
                        Number(data.y) || player.y
                    )
                );

            player.angle =
                Number(data.angle) || player.angle;

            player.length =
                Math.max(
                    10,
                    Math.min(
                        500,
                        Number(data.length) || player.length
                    )
                );

            player.color =
                String(data.color || player.color);

            player.skin =
                String(data.skin || player.skin);

            player.alive = true;

            return;
        }

        if (data.type === "kill") {
            const room = rooms.get(player.room);

            if (!room) return;

            const victim =
                room.players.get(
                    String(data.victimId || "")
                );

            if (!victim || !victim.alive) return;

            victim.alive = false;
            player.coins += 10;

            send(victim.ws, {
                type: "gameOver",
                reason:
                    player.name +
                    " tappis sinu!"
            });

            broadcast(room, {
                type: "playerKilled",
                killerId: player.id,
                victimId: victim.id,
                killerName: player.name,
                coins: player.coins
            });

            return;
        }
    });

    ws.on("close", () => {
        leaveRoom(player);
        clients.delete(player.id);
    });
});

setInterval(() => {
    for (const room of rooms.values()) {
        if (!room.started) continue;

        broadcast(room, {
            type: "players",
            players: publicPlayers(room)
        });
    }
}, 50);

server.listen(PORT, "0.0.0.0", () => {
    console.log("Snake Arena server running on port " + PORT);
});
