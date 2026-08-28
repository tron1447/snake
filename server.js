const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

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
            res.end("Server error");
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

const rooms = new Map();

const clients = new Map();

function randomCode() {

    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

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

function send(ws, data) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(JSON.stringify(data));
    }
}

function makePlayer(id, name, color) {

    return {
        id,
        name: name || "Player",
        color: color || "#54ff6b",

        x: 7000,
        y: 7000,

        angle: Math.random() * Math.PI * 2,
        targetAngle: Math.random() * Math.PI * 2,

        speed: 7,

        length: 75,

        score: 0,

        kills: 0,

        alive: true,

        body: []
    };
}

function setupBody(player) {

    player.body = [];

    for (let i = 0; i < player.length; i++) {

        player.body.push({
            x:
                player.x -
                Math.cos(player.angle) * i * 7,

            y:
                player.y -
                Math.sin(player.angle) * i * 7
        });
    }
}

function broadcastRoom(room) {

    const players = room.players.map(p => ({
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
    }));

    for (const p of room.players) {

        const ws = clients.get(p.id);

        send(ws, {
            type: "state",
            players
        });
    }
}

function updatePlayer(player) {

    if (!player.alive) {
        return;
    }

    let diff =
        player.targetAngle -
        player.angle;

    while (diff > Math.PI) {
        diff -= Math.PI * 2;
    }

    while (diff < -Math.PI) {
        diff += Math.PI * 2;
    }

    player.angle += diff * 0.13;

    const speed =
        player.boost
            ? 11.5
            : 7.4;

    player.speed = speed;

    player.x +=
        Math.cos(player.angle) * speed;

    player.y +=
        Math.sin(player.angle) * speed;

    const WORLD = 14000;

    if (
        player.x < 30 ||
        player.y < 30 ||
        player.x > WORLD - 30 ||
        player.y > WORLD - 30
    ) {

        player.alive = false;
        return;
    }

    player.body.unshift({
        x: player.x,
        y: player.y
    });

    const wanted =
        Math.max(
            60,
            Math.floor(player.length)
        );

    while (
        player.body.length < wanted
    ) {

        const last =
            player.body[
                player.body.length - 1
            ];

        player.body.push({
            x: last.x,
            y: last.y
        });
    }

    while (
        player.body.length > wanted
    ) {

        player.body.pop();
    }

    if (player.boost && player.length > 60) {
        player.length -= 0.12;
    }
}

function checkKills(room) {

    const players = room.players;

    for (const attacker of players) {

        if (!attacker.alive) {
            continue;
        }

        for (const victim of players) {

            if (
                attacker.id === victim.id ||
                !victim.alive
            ) {
                continue;
            }

            for (
                let i = 10;
                i < victim.body.length;
                i += 2
            ) {

                const part =
                    victim.body[i];

                const dx =
                    attacker.x - part.x;

                const dy =
                    attacker.y - part.y;

                if (
                    Math.hypot(dx, dy) < 30
                ) {

                    victim.alive = false;

                    attacker.kills += 1;

                    attacker.score += 100;

                    attacker.length += 25;

                    break;
                }
            }
        }
    }
}

wss.on("connection", ws => {

    const id =
        Math.random()
        .toString(36)
        .slice(2) +
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

        if (data.type === "createRoom") {

            const code = randomCode();

            const player =
                makePlayer(
                    id,
                    data.name,
                    data.color
                );

            setupBody(player);

            const room = {
                code,
                started: false,
                players: [player]
            };

            rooms.set(code, room);

            ws.roomCode = code;

            send(ws, {
                type: "roomCreated",
                code,
                id
            });

            return;
        }

        if (data.type === "joinRoom") {

            const code =
                String(data.code || "")
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
                    message: "See mäng on juba alanud."
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

            const player =
                makePlayer(
                    id,
                    data.name,
                    data.color
                );

            player.x =
                3000 +
                Math.random() * 8000;

            player.y =
                3000 +
                Math.random() * 8000;

            setupBody(player);

            room.players.push(player);

            ws.roomCode = code;

            send(ws, {
                type: "roomJoined",
                code,
                id
            });

            return;
        }

        if (data.type === "start") {

            const code = ws.roomCode;

            if (!code) {
                return;
            }

            const room = rooms.get(code);

            if (!room) {
                return;
            }

            room.started = true;

            for (const p of room.players) {

                send(
                    clients.get(p.id),
                    {
                        type: "gameStart"
                    }
                );
            }

            return;
        }

        if (data.type === "input") {

            const code = ws.roomCode;

            if (!code) {
                return;
            }

            const room = rooms.get(code);

            if (!room) {
                return;
            }

            const player =
                room.players.find(
                    p => p.id === id
                );

            if (!player) {
                return;
            }

            if (
                typeof data.angle === "number"
            ) {

                player.targetAngle =
                    data.angle;
            }

            player.boost =
                Boolean(data.boost);

            return;
        }
    });

    ws.on("close", () => {

        clients.delete(id);

        const code = ws.roomCode;

        if (!code) {
            return;
        }

        const room = rooms.get(code);

        if (!room) {
            return;
        }

        room.players =
            room.players.filter(
                p => p.id !== id
            );

        if (room.players.length === 0) {

            rooms.delete(code);

        } else {

            broadcastRoom(room);

        }
    });
});

/*
   Serveri game loop.
   Multiplayeri mängijad liiguvad siin
   kogu aeg edasi isegi siis, kui klient
   ei saada uusi nuppe.
*/

setInterval(() => {

    for (const room of rooms.values()) {

        if (!room.started) {
            continue;
        }

        for (const player of room.players) {
            updatePlayer(player);
        }

        checkKills(room);

        broadcastRoom(room);
    }

}, 50);

server.listen(PORT, () => {

    console.log(
        `Snake Arena töötab pordil ${PORT}`
    );

});
