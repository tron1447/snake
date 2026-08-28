const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 14000;

const server = http.createServer((req, res) => {

    let filePath;

    if (
        req.url === "/" ||
        req.url === "/index.html"
    ) {

        filePath =
            path.join(__dirname, "index.html");

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
            "Content-Type":
                "text/html; charset=utf-8"
        });

        res.end(data);

    });

});

const wss =
    new WebSocket.Server({
        server
    });

const rooms = new Map();
const clients = new Map();

function randomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {

        code = "";

        for (let i = 0; i < 5; i++) {

            code += chars[
                Math.floor(
                    Math.random() * chars.length
                )
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

        ws.send(
            JSON.stringify(data)
        );

    }

}

function makePlayer(id, name, color) {

    const p = {

        id,

        name:
            String(name || "Player")
            .replace(/[<>]/g, "")
            .slice(0, 16),

        color:
            color || "#54ff6b",

        x:
            1500 +
            Math.random() *
            (WORLD - 3000),

        y:
            1500 +
            Math.random() *
            (WORLD - 3000),

        angle:
            Math.random() *
            Math.PI *
            2,

        targetAngle: 0,

        speed: 7,

        length: 75,

        score: 0,

        kills: 0,

        boost: false,

        alive: true,

        body: []

    };

    p.targetAngle = p.angle;

    setupBody(p);

    return p;

}

function setupBody(player) {

    player.body = [];

    for (
        let i = 0;
        i < player.length;
        i++
    ) {

        player.body.push({

            x:
                player.x -
                Math.cos(player.angle) *
                i *
                7,

            y:
                player.y -
                Math.sin(player.angle) *
                i *
                7

        });

    }

}

function updatePlayer(player) {

    if (!player.alive)
        return;

    let diff =
        player.targetAngle -
        player.angle;

    while (diff > Math.PI)
        diff -= Math.PI * 2;

    while (diff < -Math.PI)
        diff += Math.PI * 2;

    player.angle += diff * 0.13;

    /*
       Sama kiirus nagu kliendil.
    */

    const speed =
        player.boost
            ? 10
            : 7.4;

    player.speed = speed;

    player.x +=
        Math.cos(player.angle) *
        speed;

    player.y +=
        Math.sin(player.angle) *
        speed;

    /*
       Boost ei võta liiga palju pikkust.
    */

    if (
        player.boost &&
        player.length > 70
    ) {

        player.length -= 0.045;

    }

    if (
        player.x < 35 ||
        player.y < 35 ||
        player.x > WORLD - 35 ||
        player.y > WORLD - 35
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
        player.body.length <
        wanted
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
        player.body.length >
        wanted
    ) {

        player.body.pop();

    }

}

function checkCollisions(room) {

    const players =
        room.players;

    /*
       TEISE MÄNGIJA PEA
       -> SINU KEHA
       = teine sureb
    */

    for (const attacker of players) {

        if (!attacker.alive)
            continue;

        for (const victim of players) {

            if (
                attacker.id === victim.id ||
                !victim.alive
            )
                continue;

            for (
                let i = 12;
                i < victim.body.length;
                i += 2
            ) {

                const part =
                    victim.body[i];

                const dx =
                    attacker.x -
                    part.x;

                const dy =
                    attacker.y -
                    part.y;

                if (
                    Math.hypot(dx, dy) < 31
                ) {

                    victim.alive = false;

                    attacker.kills++;

                    attacker.score += 100;

                    attacker.length += 25;

                    break;

                }

            }

        }

    }

    /*
       Oma keha collisionit
       serveris samuti EI kontrollita.

       Seega saab mängija
       oma keha ületada.
    */

}

function broadcast(room) {

    const players =
        room.players.map(p => ({

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

    for (const player of room.players) {

        send(
            clients.get(player.id),
            {
                type: "state",
                players
            }
        );

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

            data =
                JSON.parse(
                    raw.toString()
                );

        } catch {

            return;

        }

        /*
           CREATE ROOM
        */

        if (
            data.type ===
            "createRoom"
        ) {

            const code =
                randomCode();

            const player =
                makePlayer(
                    id,
                    data.name,
                    data.color
                );

            const room = {

                code,

                started: false,

                players: [player]

            };

            rooms.set(
                code,
                room
            );

            ws.roomCode =
                code;

            send(ws, {

                type:
                    "roomCreated",

                code,

                id

            });

            return;

        }

        /*
           JOIN ROOM
        */

        if (
            data.type ===
            "joinRoom"
        ) {

            const code =
                String(
                    data.code || ""
                )
                .toUpperCase();

            const room =
                rooms.get(code);

            if (!room) {

                send(ws, {

                    type: "error",

                    message:
                        "Roomi ei leitud."

                });

                return;

            }

            if (room.started) {

                send(ws, {

                    type: "error",

                    message:
                        "Mäng on juba alanud."

                });

                return;

            }

            if (
                room.players.length >= 8
            ) {

                send(ws, {

                    type: "error",

                    message:
                        "Room on täis."

                });

                return;

            }

            const player =
                makePlayer(
                    id,
                    data.name,
                    data.color
                );

            room.players.push(
                player
            );

            ws.roomCode =
                code;

            send(ws, {

                type:
                    "roomJoined",

                code,

                id

            });

            return;

        }

        /*
           START
        */

        if (
            data.type === "start"
        ) {

            const code =
                ws.roomCode;

            if (!code)
                return;

            const room =
                rooms.get(code);

            if (!room)
                return;

            room.started = true;

            for (
                const player of
                room.players
            ) {

                send(
                    clients.get(
                        player.id
                    ),
                    {
                        type:
                            "gameStart"
                    }
                );

            }

            return;

        }

        /*
           INPUT
        */

        if (
            data.type === "input"
        ) {

            const code =
                ws.roomCode;

            if (!code)
                return;

            const room =
                rooms.get(code);

            if (!room)
                return;

            const player =
                room.players.find(
                    p =>
                        p.id === id
                );

            if (!player)
                return;

            if (
                typeof data.targetAngle ===
                "number"
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

        const code =
            ws.roomCode;

        if (!code)
            return;

        const room =
            rooms.get(code);

        if (!room)
            return;

        room.players =
            room.players.filter(
                p => p.id !== id
            );

        if (
            room.players.length === 0
        ) {

            rooms.delete(code);

        } else {

            broadcast(room);

        }

    });

});

/*
   SERVERI MÄNGULUPP.

   20 korda sekundis.
*/

setInterval(() => {

    for (
        const room of
        rooms.values()
    ) {

        if (!room.started)
            continue;

        for (
            const player of
            room.players
        ) {

            updatePlayer(player);

        }

        checkCollisions(room);

        broadcast(room);

    }

}, 50);

server.listen(
    PORT,
    () => {

        console.log(
            `Snake Arena server töötab pordil ${PORT}`
        );

    }
);
