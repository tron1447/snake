const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 14000;

const server = http.createServer((req, res) => {
    let filePath;

    if (req.url === "/" || req.url === "/index.html") {
        filePath = path.join(__dirname, "index.html");
    } else {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end("index.html puudub");
            return;
        }

        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8"
        });

        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

const clients = new Map();
const rooms = new Map();

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function randomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {
        code = "";

        for (let i = 0; i < 5; i++) {
            code += chars[
                Math.floor(Math.random() * chars.length)
            ];
        }
    } while (rooms.has(code));

    return code;
}

function cleanName(name) {
    return String(name || "Player")
        .replace(/[<>]/g, "")
        .slice(0, 16) || "Player";
}

function createPlayer(id, name, color) {
    const angle = Math.random() * Math.PI * 2;

    const p = {
        id,

        name: cleanName(name),

        color: color || "#54ff6b",

        x: 1500 + Math.random() * (WORLD - 3000),

        y: 1500 + Math.random() * (WORLD - 3000),

        angle,

        targetAngle: angle,

        length: 75,

        score: 0,

        kills: 0,

        boost: false,

        alive: true,

        body: []
    };

    for (let i = 0; i < 75; i++) {
        p.body.push({
            x: p.x - Math.cos(angle) * i * 7,
            y: p.y - Math.sin(angle) * i * 7
        });
    }

    return p;
}

function roomInfo(room) {
    return {
        code: room.code,

        started: room.started,

        hostId: room.hostId,

        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            isHost: p.id === room.hostId
        }))
    };
}

function sendRoomInfo(room) {
    const info = roomInfo(room);

    for (const p of room.players) {
        send(clients.get(p.id), {
            type: "roomInfo",
            ...info
        });
    }
}

function updatePlayer(p) {
    if (!p.alive) return;

    let diff = p.targetAngle - p.angle;

    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    p.angle += diff * 0.13;

    const speed = p.boost ? 10 : 7.4;

    p.x += Math.cos(p.angle) * speed;
    p.y += Math.sin(p.angle) * speed;

    if (p.boost && p.length > 70) {
        p.length -= 0.045;
    }

    if (
        p.x < 35 ||
        p.y < 35 ||
        p.x > WORLD - 35 ||
        p.y > WORLD - 35
    ) {
        p.alive = false;
        return;
    }

    p.body.unshift({
        x: p.x,
        y: p.y
    });

    const wanted = Math.max(
        60,
        Math.floor(p.length)
    );

    while (p.body.length < wanted) {
        const last = p.body[p.body.length - 1];

        p.body.push({
            x: last.x,
            y: last.y
        });
    }

    while (p.body.length > wanted) {
        p.body.pop();
    }
}

function collisionCheck(room) {
    const players = room.players;

    for (let i = 0; i < players.length; i++) {
        const attacker = players[i];

        if (!attacker.alive) continue;

        for (let j = 0; j < players.length; j++) {
            const victim = players[j];

            if (
                attacker.id === victim.id ||
                !victim.alive
            ) {
                continue;
            }

            for (
                let k = 12;
                k < victim.body.length;
                k += 2
            ) {
                const part = victim.body[k];

                if (
                    Math.hypot(
                        attacker.x - part.x,
                        attacker.y - part.y
                    ) < 31
                ) {
                    attacker.alive = false;

                    victim.kills++;
                    victim.score += 100;
                    victim.length += 25;

                    break;
                }
            }

            if (!attacker.alive) break;
        }
    }

    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            const a = players[i];
            const b = players[j];

            if (!a.alive || !b.alive) continue;

            if (
                Math.hypot(
                    a.x - b.x,
                    a.y - b.y
                ) < 48
            ) {
                if (a.length > b.length) {
                    b.alive = false;
                    a.kills++;
                    a.score += 100;
                } else if (b.length > a.length) {
                    a.alive = false;
                    b.kills++;
                    b.score += 100;
                } else {
                    a.alive = false;
                    b.alive = false;
                }
            }
        }
    }
}

function publicPlayer(p) {
    return {
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        angle: p.angle,
        length: p.length,
        score: p.score,
        kills: p.kills,
        alive: p.alive,
        body: p.body
    };
}

function broadcastGame(room) {
    const players = room.players.map(publicPlayer);

    for (const p of room.players) {
        send(clients.get(p.id), {
            type: "state",
            players
        });
    }
}

wss.on("connection", ws => {
    const id =
        Math.random().toString(36).slice(2) +
        Date.now().toString(36);

    clients.set(id, ws);

    send(ws, {
        type: "connected",
        id
    });

    ws.on("message", raw => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        /*
        =========================
        CREATE ROOM
        =========================
        */

        if (data.type === "createRoom") {
            const code = randomCode();

            const player = createPlayer(
                id,
                data.name,
                data.color
            );

            const room = {
                code,

                hostId: id,

                started: false,

                players: [player]
            };

            rooms.set(code, room);

            ws.roomCode = code;

            send(ws, {
                type: "roomCreated",
                code,
                id,
                host: true
            });

            sendRoomInfo(room);

            return;
        }

        /*
        =========================
        JOIN ROOM
        =========================
        */

        if (data.type === "joinRoom") {
            const code = String(data.code || "")
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

            if (room.players.length >= 8) {
                send(ws, {
                    type: "error",
                    message: "Room on täis."
                });

                return;
            }

            const player = createPlayer(
                id,
                data.name,
                data.color
            );

            room.players.push(player);

            ws.roomCode = code;

            send(ws, {
                type: "roomJoined",
                code,
                id,
                host: false
            });

            sendRoomInfo(room);

            return;
        }

        /*
        =========================
        START GAME
        AINULT HOST
        =========================
        */

        if (data.type === "start") {
            const code = ws.roomCode;

            const room = rooms.get(code);

            if (!room) {
                send(ws, {
                    type: "error",
                    message: "Sa ei ole roomis."
                });

                return;
            }

            /*
              KONTROLLIME SERVERIS,
              KAS TA ON PÄRISELT HOST.
            */

            if (room.hostId !== id) {
                send(ws, {
                    type: "error",
                    message:
                        "Ainult roomi host saab mängu alustada!"
                });

                return;
            }

            if (room.players.length < 1) {
                return;
            }

            room.started = true;

            for (const p of room.players) {
                send(clients.get(p.id), {
                    type: "gameStart"
                });
            }

            return;
        }

        /*
        =========================
        INPUT
        =========================
        */

        if (data.type === "input") {
            const room = rooms.get(ws.roomCode);

            if (!room || !room.started) return;

            const player = room.players.find(
                p => p.id === id
            );

            if (!player) return;

            if (
                typeof data.targetAngle === "number"
            ) {
                player.targetAngle =
                    data.targetAngle;
            }

            player.boost =
                Boolean(data.boost);
        }
    });

    ws.on("close", () => {
        clients.delete(id);

        const code = ws.roomCode;

        if (!code) return;

        const room = rooms.get(code);

        if (!room) return;

        room.players =
            room.players.filter(
                p => p.id !== id
            );

        /*
        Kui host lahkub enne mängu,
        anname hosti järgmisele mängijale.
        */

        if (
            room.hostId === id &&
            room.players.length > 0
        ) {
            room.hostId =
                room.players[0].id;
        }

        if (room.players.length === 0) {
            rooms.delete(code);
            return;
        }

        sendRoomInfo(room);
    });
});

/*
=========================
GAME LOOP
=========================
*/

setInterval(() => {
    for (const room of rooms.values()) {
        if (!room.started) continue;

        for (const p of room.players) {
            updatePlayer(p);
        }

        collisionCheck(room);

        broadcastGame(room);
    }
}, 50);

server.listen(PORT, () => {
    console.log(
        `Snake Arena töötab pordil ${PORT}`
    );
});
