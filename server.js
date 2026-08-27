const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const WORLD = 20000;
const MAX_PLAYERS = 20;

const rooms = new Map();

function randomId() {
    return Math.random().toString(36).slice(2, 12);
}

function makeRoomCode() {
    let code;

    do {
        code = Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();
    } while (rooms.has(code));

    return code;
}

function safeName(name) {
    return String(name || "Player")
        .replace(/[<>]/g, "")
        .substring(0, 16) || "Player";
}

function safeColor(color) {
    if (typeof color !== "string") {
        return "#63ff78";
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        return "#63ff78";
    }

    return color;
}

function send(ws, data) {
    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(room, data) {
    for (const player of room.players.values()) {
        send(player.ws, data);
    }
}

function sendLobby(room) {
    const players = [];

    for (const p of room.players.values()) {
        players.push({
            id: p.id,
            name: p.name,
            color: p.color,
            skin: p.skin,
            host: p.host
        });
    }

    broadcast(room, {
        type: "lobby",
        players
    });
}

function playerInfo(p) {
    return {
        x: p.x,
        y: p.y,
        angle: p.angle,
        length: p.length,
        color: p.color,
        skin: p.skin,
        name: p.name,
        alive: p.alive
    };
}

function sendPlayers(room) {
    const players = {};

    for (const [id, p] of room.players) {
        if (!p.alive) continue;

        players[id] = playerInfo(p);
    }

    broadcast(room, {
        type: "players",
        players
    });
}

function createPlayer(ws) {
    return {
        ws,

        id: randomId(),

        room: null,

        host: false,

        name: "Player",

        color: "#63ff78",

        skin: "green",

        x: 10000,

        y: 10000,

        angle: 0,

        length: 20,

        alive: true,

        trail: [],

        lastState: 0,

        coins: 0
    };
}

function resetPlayer(p) {
    p.x =
        3000 +
        Math.random() * 14000;

    p.y =
        3000 +
        Math.random() * 14000;

    p.angle =
        Math.random() *
        Math.PI *
        2;

    p.length = 20;

    p.alive = true;

    p.trail = [
        {
            x: p.x,
            y: p.y
        }
    ];
}

function addTrailPoint(p) {
    const last =
        p.trail[p.trail.length - 1];

    if (!last) {
        p.trail.push({
            x: p.x,
            y: p.y
        });

        return;
    }

    const dx = p.x - last.x;
    const dy = p.y - last.y;

    if (dx * dx + dy * dy < 16) {
        return;
    }

    p.trail.push({
        x: p.x,
        y: p.y
    });

    const maxPoints =
        Math.min(
            1200,
            Math.max(
                30,
                Math.floor(p.length * 1.5)
            )
        );

    if (p.trail.length > maxPoints) {
        p.trail.splice(
            0,
            p.trail.length - maxPoints
        );
    }
}

function distance(a, b) {
    return Math.hypot(
        a.x - b.x,
        a.y - b.y
    );
}

function killPlayer(killer, victim) {
    if (!killer.alive || !victim.alive) {
        return;
    }

    victim.alive = false;

    killer.coins += 10;

    send(killer.ws, {
        type: "kill",
        victimId: victim.id,
        coins: 10,
        totalCoins: killer.coins
    });

    send(victim.ws, {
        type: "gameOver",
        reason:
            killer.name +
            " elimineeris sind!"
    });

    broadcast(
        killer.room,
        {
            type: "playerKilled",
            killerId: killer.id,
            victimId: victim.id,
            killerName: killer.name
        }
    );
}

function checkCollisions(room) {
    const players =
        [...room.players.values()]
            .filter(p => p.alive);

    for (const victim of players) {
        if (!victim.alive) continue;

        for (const killer of players) {
            if (
                killer.id === victim.id ||
                !killer.alive
            ) {
                continue;
            }

            const trail = killer.trail;

            const skip =
                Math.min(
                    12,
                    trail.length
                );

            for (
                let i = skip;
                i < trail.length;
                i++
            ) {
                const point = trail[i];

                const d =
                    distance(
                        victim,
                        point
                    );

                if (d < 19) {
                    killPlayer(
                        killer,
                        victim
                    );

                    break;
                }
            }

            if (!victim.alive) {
                break;
            }
        }
    }
}

function updateRoom(room) {
    if (!room.started) return;

    checkCollisions(room);

    sendPlayers(room);
}

const server = http.createServer(
    (req, res) => {
        let requestPath =
            decodeURIComponent(
                req.url.split("?")[0]
            );

        if (requestPath === "/") {
            requestPath = "/index.html";
        }

        const filePath =
            path.join(
                __dirname,
                requestPath
            );

        if (
            !filePath.startsWith(
                __dirname
            )
        ) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }

        fs.stat(
            filePath,
            (err, stat) => {
                if (
                    err ||
                    !stat.isFile()
                ) {
                    res.writeHead(404);
                    res.end("Not found");
                    return;
                }

                const ext =
                    path.extname(
                        filePath
                    ).toLowerCase();

                const types = {
                    ".html":
                        "text/html; charset=utf-8",
                    ".css":
                        "text/css; charset=utf-8",
                    ".js":
                        "application/javascript; charset=utf-8",
                    ".json":
                        "application/json; charset=utf-8"
                };

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            types[ext] ||
                            "application/octet-stream"
                    }
                );

                fs.createReadStream(
                    filePath
                ).pipe(res);
            }
        );
    }
);

const wss =
    new WebSocket.Server({
        server
    });

wss.on(
    "connection",
    ws => {
        const player =
            createPlayer(ws);

        ws.player = player;

        ws.on(
            "message",
            raw => {
                let data;

                try {
                    data =
                        JSON.parse(
                            raw.toString()
                        );
                } catch {
                    return;
                }

                /* CREATE ROOM */

                if (
                    data.type ===
                    "createRoom"
                ) {
                    if (player.room) {
                        return;
                    }

                    const code =
                        makeRoomCode();

                    const room = {
                        code,

                        started: false,

                        players:
                            new Map()
                    };

                    player.name =
                        safeName(
                            data.name
                        );

                    player.color =
                        safeColor(
                            data.color
                        );

                    player.skin =
                        String(
                            data.skin ||
                            "green"
                        );

                    player.room = room;

                    player.host = true;

                    room.players.set(
                        player.id,
                        player
                    );

                    rooms.set(
                        code,
                        room
                    );

                    send(
                        ws,
                        {
                            type:
                                "roomCreated",
                            code,
                            id:
                                player.id
                        }
                    );

                    sendLobby(room);

                    return;
                }

                /* JOIN ROOM */

                if (
                    data.type ===
                    "joinRoom"
                ) {
                    const code =
                        String(
                            data.code ||
                            ""
                        )
                            .trim()
                            .toUpperCase();

                    const room =
                        rooms.get(code);

                    if (!room) {
                        send(
                            ws,
                            {
                                type:
                                    "error",
                                message:
                                    "Seda tuba ei ole olemas."
                            }
                        );

                        return;
                    }

                    if (room.started) {
                        send(
                            ws,
                            {
                                type:
                                    "error",
                                message:
                                    "Mäng on juba alanud."
                            }
                        );

                        return;
                    }

                    if (
                        room.players.size >=
                        MAX_PLAYERS
                    ) {
                        send(
                            ws,
                            {
                                type:
                                    "error",
                                message:
                                    "Tuba on täis."
                            }
                        );

                        return;
                    }

                    player.name =
                        safeName(
                            data.name
                        );

                    player.color =
                        safeColor(
                            data.color
                        );

                    player.skin =
                        String(
                            data.skin ||
                            "green"
                        );

                    player.room = room;

                    room.players.set(
                        player.id,
                        player
                    );

                    send(
                        ws,
                        {
                            type:
                                "roomJoined",
                            code,
                            id:
                                player.id
                        }
                    );

                    sendLobby(room);

                    return;
                }

                /* START */

                if (
                    data.type ===
                    "startGame"
                ) {
                    const room =
                        player.room;

                    if (!room) return;

                    if (!player.host) {
                        return;
                    }

                    room.started = true;

                    for (
                        const p of
                        room.players.values()
                    ) {
                        resetPlayer(p);

                        send(
                            p.ws,
                            {
                                type:
                                    "gameStart",
                                id:
                                    p.id
                            }
                        );
                    }

                    return;
                }

                /* PLAYER STATE */

                if (
                    data.type ===
                    "state"
                ) {
                    if (
                        !player.room ||
                        !player.alive
                    ) {
                        return;
                    }

                    if (
                        Number.isFinite(
                            data.x
                        )
                    ) {
                        player.x =
                            Math.max(
                                25,
                                Math.min(
                                    WORLD - 25,
                                    data.x
                                )
                            );
                    }

                    if (
                        Number.isFinite(
                            data.y
                        )
                    ) {
                        player.y =
                            Math.max(
                                25,
                                Math.min(
                                    WORLD - 25,
                                    data.y
                                )
                            );
                    }

                    if (
                        Number.isFinite(
                            data.angle
                        )
                    ) {
                        player.angle =
                            data.angle;
                    }

                    if (
                        Number.isFinite(
                            data.length
                        )
                    ) {
                        player.length =
                            Math.max(
                                20,
                                Math.min(
                                    1000,
                                    data.length
                                )
                            );
                    }

                    if (
                        typeof data.color ===
                        "string"
                    ) {
                        player.color =
                            safeColor(
                                data.color
                            );
                    }

                    if (
                        typeof data.skin ===
                        "string"
                    ) {
                        player.skin =
                            data.skin
                                .substring(
                                    0,
                                    20
                                );
                    }

                    if (
                        typeof data.name ===
                        "string"
                    ) {
                        player.name =
                            safeName(
                                data.name
                            );
                    }

                    addTrailPoint(player);

                    return;
                }

                /* BOOST DROP */

                if (
                    data.type ===
                    "boostDrop"
                ) {
                    if (
                        !player.room ||
                        !player.alive
                    ) {
                        return;
                    }

                    addTrailPoint(player);

                    return;
                }
            }
        );

        ws.on(
            "close",
            () => {
                const room =
                    player.room;

                if (!room) {
                    return;
                }

                room.players.delete(
                    player.id
                );

                if (player.host) {
                    const next =
                        room.players
                            .values()
                            .next()
                            .value;

                    if (next) {
                        next.host = true;
                    }
                }

                if (
                    room.players.size ===
                    0
                ) {
                    rooms.delete(
                        room.code
                    );
                } else {
                    sendLobby(room);
                }
            }
        );
    }
);

setInterval(
    () => {
        for (
            const room of
            rooms.values()
        ) {
            updateRoom(room);
        }
    },
    80
);

setInterval(
    () => {
        for (
            const ws of
            wss.clients
        ) {
            if (
                ws.readyState ===
                WebSocket.OPEN
            ) {
                ws.ping();
            }
        }
    },
    25000
);

server.listen(
    PORT,
    HOST,
    () => {
        console.log(
            `Snake Arena running on ${HOST}:${PORT}`
        );
    }
);
