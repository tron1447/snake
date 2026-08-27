const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname)));

app.get("/health", (req, res) => {
    res.status(200).json({ ok: true });
});

const rooms = new Map();

function makeCode() {
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
    for (const player of room.players.values()) {
        send(player.ws, data);
    }
}

function lobby(room) {
    return [...room.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        skin: p.skin,
        host: p.host
    }));
}

function makePlayer(ws, data) {
    return {
        id: Math.random().toString(36).slice(2, 10),
        ws,
        name: String(data.name || "Player").slice(0, 16),
        color: data.color || "#63ff78",
        skin: data.skin || "green",
        host: false,

        x: 10000,
        y: 10000,
        angle: 0,
        length: 20,
        score: 0,
        alive: true
    };
}

function createRoom(ws, data) {
    const code = makeCode();

    const room = {
        code,
        started: false,
        players: new Map()
    };

    const player = makePlayer(ws, data);

    player.host = true;

    room.players.set(player.id, player);
    rooms.set(code, room);

    ws.roomCode = code;
    ws.playerId = player.id;

    send(ws, {
        type: "roomCreated",
        code,
        id: player.id
    });

    broadcast(room, {
        type: "lobby",
        players: lobby(room)
    });
}

function joinRoom(ws, data) {
    const code = String(data.code || "").toUpperCase();
    const room = rooms.get(code);

    if (!room) {
        send(ws, {
            type: "error",
            message: "Seda roomi ei ole."
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

    const player = makePlayer(ws, data);

    room.players.set(player.id, player);

    ws.roomCode = code;
    ws.playerId = player.id;

    send(ws, {
        type: "roomJoined",
        code,
        id: player.id
    });

    broadcast(room, {
        type: "lobby",
        players: lobby(room)
    });
}

function startRoom(ws) {
    const code = ws.roomCode;
    const room = rooms.get(code);

    if (!room) return;

    const player = room.players.get(ws.playerId);

    if (!player || !player.host) {
        send(ws, {
            type: "error",
            message: "Ainult roomi looja saab alustada."
        });
        return;
    }

    room.started = true;

    for (const p of room.players.values()) {
        p.x = 2500 + Math.random() * 15000;
        p.y = 2500 + Math.random() * 15000;
        p.angle = Math.random() * Math.PI * 2;
        p.length = 20;
        p.score = 0;
        p.alive = true;
    }

    for (const p of room.players.values()) {
        send(p.ws, {
            type: "gameStart",
            id: p.id
        });
    }
}

function playerState(ws, data) {
    const room = rooms.get(ws.roomCode);

    if (!room || !room.started) return;

    const p = room.players.get(ws.playerId);

    if (!p || !p.alive) return;

    if (Number.isFinite(data.x)) p.x = data.x;
    if (Number.isFinite(data.y)) p.y = data.y;
    if (Number.isFinite(data.angle)) p.angle = data.angle;
    if (Number.isFinite(data.length)) p.length = Math.max(10, data.length);
    if (Number.isFinite(data.score)) p.score = Math.max(0, data.score);

    if (typeof data.name === "string") {
        p.name = data.name.slice(0, 16);
    }

    if (typeof data.color === "string") {
        p.color = data.color;
    }

    if (typeof data.skin === "string") {
        p.skin = data.skin;
    }

    checkCollisions(room, p);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;

    const ab2 = abx * abx + aby * aby;

    if (ab2 === 0) {
        return Math.hypot(px - ax, py - ay);
    }

    let t =
        ((px - ax) * abx + (py - ay) * aby) /
        ab2;

    t = Math.max(0, Math.min(1, t));

    const x = ax + abx * t;
    const y = ay + aby * t;

    return Math.hypot(px - x, py - y);
}

function checkCollisions(room, current) {
    for (const other of room.players.values()) {
        if (other.id === current.id) continue;
        if (!other.alive) continue;

        const headDistance =
            Math.hypot(
                current.x - other.x,
                current.y - other.y
            );

        if (headDistance < 38) {
            if (current.length >= other.length) {
                killPlayer(room, other, current);
            } else {
                killPlayer(room, current, other);
            }

            continue;
        }

        const otherTailLength =
            Math.min(
                100,
                Math.floor(other.length)
            );

        for (let i = 8; i < otherTailLength; i += 4) {
            const tx =
                other.x -
                Math.cos(other.angle) * i * 8;

            const ty =
                other.y -
                Math.sin(other.angle) * i * 8;

            const d =
                Math.hypot(
                    current.x - tx,
                    current.y - ty
                );

            if (d < 25) {
                killPlayer(room, current, other);
                break;
            }
        }
    }
}

function killPlayer(room, victim, killer) {
    if (!victim.alive) return;

    victim.alive = false;

    send(victim.ws, {
        type: "gameOver",
        reason:
            killer.name +
            " võitis sinu vastu!"
    });

    broadcast(room, {
        type: "playerKilled",
        id: victim.id,
        killer: killer.id
    });

    if (killer && killer.ws) {
        send(killer.ws, {
            type: "killReward",
            coins: 10
        });
    }
}

wss.on("connection", ws => {
    ws.on("message", raw => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            send(ws, {
                type: "error",
                message: "Vigane sõnum."
            });
            return;
        }

        if (data.type === "createRoom") {
            createRoom(ws, data);
            return;
        }

        if (data.type === "joinRoom") {
            joinRoom(ws, data);
            return;
        }

        if (data.type === "startGame") {
            startRoom(ws);
            return;
        }

        if (data.type === "state") {
            playerState(ws, data);
            return;
        }
    });

    ws.on("close", () => {
        const code = ws.roomCode;

        if (!code) return;

        const room = rooms.get(code);

        if (!room) return;

        room.players.delete(ws.playerId);

        if (room.players.size === 0) {
            rooms.delete(code);
            return;
        }

        const first = room.players.values().next().value;

        if (first) {
            for (const p of room.players.values()) {
                p.host = false;
            }

            first.host = true;
        }

        broadcast(room, {
            type: "lobby",
            players: lobby(room)
        });
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Snake Arena running on 0.0.0.0:${PORT}`);
});
