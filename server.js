const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const HOST = "0.0.0.0";

const WORLD = 20000;
const rooms = new Map();
const clients = new Map();

function randomCode() {
    let code = "";
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    do {
        code = "";
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));

    return code;
}

function randomId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function safeName(name) {
    return String(name || "Player")
        .replace(/[<>]/g, "")
        .substring(0, 16) || "Player";
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function roomPlayers(room) {
    const result = [];

    for (const id of room.players) {
        const p = clients.get(id);

        if (!p) continue;

        result.push({
            id: p.id,
            name: p.name,
            color: p.color,
            skin: p.skin,
            length: p.length,
            score: p.score,
            kills: p.kills,
            x: p.x,
            y: p.y,
            angle: p.angle,
            alive: p.alive
        });
    }

    return result;
}

function broadcastRoom(room, data) {
    for (const id of room.players) {
        const p = clients.get(id);
        if (p) send(p.ws, data);
    }
}

function sendLobby(room) {
    broadcastRoom(room, {
        type: "lobby",
        players: roomPlayers(room)
    });
}

function createPlayer(ws, data) {
    const id = randomId();

    const player = {
        id,
        ws,

        name: safeName(data.name),

        color: data.color || "#63ff78",

        skin: data.skin || "green",

        room: null,

        x: 3000 + Math.random() * 14000,
        y: 3000 + Math.random() * 14000,

        angle: Math.random() * Math.PI * 2,

        length: 25,

        score: 0,

        kills: 0,

        alive: true,

        started: false,

        lastState: Date.now()
    };

    clients.set(id, player);

    return player;
}

function createRoom(player) {
    const code = randomCode();

    const room = {
        code,
        host: player.id,
        players: new Set(),
        started: false
    };

    rooms.set(code, room);

    room.players.add(player.id);
    player.room = code;

    send(player.ws, {
        type: "roomCreated",
        id: player.id,
        code
    });

    sendLobby(room);
}

function joinRoom(player, code) {
    const room = rooms.get(String(code).toUpperCase());

    if (!room) {
        send(player.ws, {
            type: "error",
            message: "Roomi ei leitud."
        });
        return;
    }

    if (room.started) {
        send(player.ws, {
            type: "error",
            message: "See mäng on juba alanud."
        });
        return;
    }

    if (room.players.size >= 12) {
        send(player.ws, {
            type: "error",
            message: "Room on täis."
        });
        return;
    }

    room.players.add(player.id);
    player.room = room.code;

    send(player.ws, {
        type: "roomJoined",
        id: player.id,
        code: room.code
    });

    sendLobby(room);
}

function startRoom(player) {
    if (!player.room) {
        send(player.ws, {
            type: "error",
            message: "Sa ei ole roomis."
        });
        return;
    }

    const room = rooms.get(player.room);

    if (!room) return;

    if (room.host !== player.id) {
        send(player.ws, {
            type: "error",
            message: "Ainult roomi looja saab mängu alustada."
        });
        return;
    }

    room.started = true;

    for (const id of room.players) {
        const p = clients.get(id);

        if (!p) continue;

        p.started = true;
        p.alive = true;

        p.x = 2500 + Math.random() * 15000;
        p.y = 2500 + Math.random() * 15000;
        p.angle = Math.random() * Math.PI * 2;
        p.length = 25;
        p.score = 0;
        p.kills = 0;

        send(p.ws, {
            type: "gameStart",
            id: p.id
        });
    }
}

function removePlayer(player) {
    if (!player) return;

    if (player.room) {
        const room = rooms.get(player.room);

        if (room) {
            room.players.delete(player.id);

            if (room.players.size === 0) {
                rooms.delete(room.code);
            } else {
                if (room.host === player.id) {
                    room.host = [...room.players][0];
                }

                sendLobby(room);
            }
        }
    }

    clients.delete(player.id);
}

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
            res.writeHead(500, {
                "Content-Type": "text/plain"
            });

            res.end("index.html not found");
            return;
        }

        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8"
        });

        res.end(data);
    });
});

const wss = new WebSocket.Server({
    server
});

wss.on("connection", ws => {
    let player = null;

    ws.on("message", raw => {
        try {
            const data = JSON.parse(raw.toString());

            if (!player) {
                if (data.type === "hello" || data.type === "createRoom" || data.type === "joinRoom") {
                    player = createPlayer(ws, data);
                } else {
                    return;
                }
            }

            if (data.type === "createRoom") {
                if (!player.room) {
                    createRoom(player);
                }
                return;
            }

            if (data.type === "joinRoom") {
                if (!player.room) {
                    joinRoom(player, data.code);
                }
                return;
            }

            if (data.type === "startGame") {
                startRoom(player);
                return;
            }

            if (data.type === "state") {
                updatePlayer(player, data);
                return;
            }

        } catch (err) {
            console.log("Message error:", err.message);
        }
    });

    ws.on("close", () => {
        removePlayer(player);
    });

    ws.on("error", () => {
        removePlayer(player);
    });
});

function updatePlayer(player, data) {
    if (!player || !player.started || !player.alive) return;

    player.x = clamp(Number(data.x) || player.x, 20, WORLD - 20);
    player.y = clamp(Number(data.y) || player.y, 20, WORLD - 20);

    player.angle = Number(data.angle) || player.angle;

    player.length = clamp(
        Number(data.length) || player.length,
        10,
        500
    );

    player.name = safeName(data.name);
    player.color = data.color || player.color;
    player.skin = data.skin || player.skin;

    player.lastState = Date.now();
}

function makeBody(player) {
    const body = [];

    const count = Math.floor(
        clamp(player.length, 10, 500)
    );

    const spacing = 8;

    for (let i = 0; i < count; i++) {
        body.push({
            x: player.x - Math.cos(player.angle) * i * spacing,
            y: player.y - Math.sin(player.angle) * i * spacing
        });
    }

    return body;
}

/*
    SERVER-SIDE SNAKE COLLISION

    Kui A pea läheb B keha sisse:
    B EI tapa A.
    A sureb.

    Kui A pea läheb B keha sisse,
    siis B saab kill'i.

    See on Snake.io tüüpi loogika.
*/

function collisionLoop() {
    for (const room of rooms.values()) {
        if (!room.started) continue;

        const alive = [];

        for (const id of room.players) {
            const p = clients.get(id);

            if (p && p.alive && p.started) {
                alive.push(p);
            }
        }

        for (const attacker of alive) {
            if (!attacker.alive) continue;

            for (const victim of alive) {
                if (attacker.id === victim.id) continue;
                if (!victim.alive) continue;

                const body = makeBody(victim);

                /*
                    Esimesed kehaosad jäetakse vahele,
                    et pea ja kael ei põhjustaks valet kokkupõrget.
                */

                for (let i = 7; i < body.length; i++) {
                    const part = body[i];

                    const d = Math.hypot(
                        attacker.x - part.x,
                        attacker.y - part.y
                    );

                    if (d < 25) {
                        killPlayer(attacker, victim);
                        break;
                    }
                }

                if (!attacker.alive) break;
            }
        }
    }
}

function killPlayer(deadPlayer, killer) {
    if (!deadPlayer.alive) return;

    deadPlayer.alive = false;

    if (killer && killer.alive) {
        killer.kills += 1;

        /*
            IGA KILL = 10 COINI.
            Coins saadetakse kliendile.
        */

        killer.score += 10;
    }

    send(deadPlayer.ws, {
        type: "gameOver",
        reason: killer
            ? killer.name + " tappis su!"
            : "Sa surid!"
    });

    if (killer) {
        send(killer.ws, {
            type: "kill",
            coins: 10,
            score: killer.score,
            kills: killer.kills
        });
    }

    if (killer) {
        broadcastRoom(
            rooms.get(deadPlayer.room),
            {
                type: "playerKilled",
                deadId: deadPlayer.id,
                killerId: killer.id
            }
        );
    }

    setTimeout(() => {
        if (!clients.has(deadPlayer.id)) return;

        deadPlayer.alive = true;

        deadPlayer.x =
            2500 + Math.random() * 15000;

        deadPlayer.y =
            2500 + Math.random() * 15000;

        deadPlayer.angle =
            Math.random() * Math.PI * 2;

        deadPlayer.length = 25;
        deadPlayer.score = 0;
        deadPlayer.kills = 0;

    }, 3000);
}

function broadcastPlayers() {
    for (const room of rooms.values()) {
        if (!room.started) continue;

        const players = {};

        for (const id of room.players) {
            const p = clients.get(id);

            if (!p) continue;

            players[id] = {
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
                alive: p.alive
            };
        }

        broadcastRoom(room, {
            type: "players",
            players
        });
    }
}

setInterval(collisionLoop, 50);
setInterval(broadcastPlayers, 50);

server.listen(PORT, HOST, () => {
    console.log(`Snake Arena server running on ${HOST}:${PORT}`);
});
