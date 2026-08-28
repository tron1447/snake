const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const WORLD = 18000;
const MAX_PLAYERS = 12;

app.use(express.static(path.join(__dirname)));

const rooms = new Map();

const COLORS = [
    "#63ff78",
    "#4da6ff",
    "#ff5268",
    "#ffd84d",
    "#b86cff",
    "#ff8a3d",
    "#00e5d4"
];

function makeCode() {
    let code;

    do {
        code = Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase();
    } while (rooms.has(code));

    return code;
}

function safeName(name) {
    return String(name || "Player")
        .replace(/[<>]/g, "")
        .trim()
        .substring(0, 16) || "Player";
}

function randomSpawn() {
    return {
        x: 1500 + Math.random() * (WORLD - 3000),
        y: 1500 + Math.random() * (WORLD - 3000)
    };
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

function publicPlayer(p) {
    return {
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        angle: p.angle,
        length: p.length,
        score: p.score,
        kills: p.kills,
        color: p.color,
        alive: p.alive,
        boosting: p.boosting,

        // ainult vajalik kehainfo
        body: p.body.slice(0, 180)
    };
}

function roomState(room) {
    return {
        type: "state",
        players: [...room.players.values()]
            .map(publicPlayer)
    };
}

function respawnPlayer(p) {
    const s = randomSpawn();

    p.x = s.x;
    p.y = s.y;

    p.angle =
        Math.random() * Math.PI * 2;

    p.targetAngle = p.angle;

    p.length = 25;

    p.score = 0;

    p.alive = true;
    p.boosting = false;

    p.body = [];

    for (let i = 0; i < 25; i++) {
        p.body.push({
            x:
                p.x -
                Math.cos(p.angle) * i * 8,

            y:
                p.y -
                Math.sin(p.angle) * i * 8
        });
    }
}

function createPlayer(ws, data) {
    const p = {
        id:
            Math.random()
                .toString(36)
                .substring(2, 10),

        ws,

        room: null,

        name: safeName(data.name),

        color:
            typeof data.color === "string"
                ? data.color
                : COLORS[
                    Math.floor(
                        Math.random() * COLORS.length
                    )
                ],

        x: 0,
        y: 0,

        angle: 0,
        targetAngle: 0,

        length: 25,

        score: 0,
        kills: 0,

        alive: true,
        boosting: false,

        body: [],

        lastInput: Date.now()
    };

    respawnPlayer(p);

    return p;
}

function leaveRoom(p) {
    if (!p.room) return;

    const room = p.room;

    room.players.delete(p.id);

    p.room = null;

    if (room.players.size === 0) {
        rooms.delete(room.code);
        return;
    }

    broadcast(room, roomState(room));
}

wss.on("connection", ws => {

    const p = createPlayer(ws, {});

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

        /*
         CREATE ROOM
        */

        if (data.type === "create") {

            leaveRoom(p);

            const code = makeCode();

            const room = {
                code,
                players: new Map(),
                created: Date.now()
            };

            rooms.set(
                code,
                room
            );

            p.name =
                safeName(data.name);

            if (typeof data.color === "string") {
                p.color = data.color;
            }

            respawnPlayer(p);

            p.room = room;

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
                roomState(room)
            );

            return;
        }

        /*
         JOIN ROOM
        */

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

            if (
                room.players.size >=
                MAX_PLAYERS
            ) {

                send(ws, {
                    type: "error",
                    message: "Room on täis."
                });

                return;
            }

            leaveRoom(p);

            p.name =
                safeName(data.name);

            if (typeof data.color === "string") {
                p.color = data.color;
            }

            respawnPlayer(p);

            p.room = room;

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
                roomState(room)
            );

            return;
        }

        /*
         START
        */

        if (data.type === "start") {

            if (!p.room) return;

            for (const player of p.room.players.values()) {
                respawnPlayer(player);
            }

            broadcast(
                p.room,
                {
                    type: "gameStart"
                }
            );

            broadcast(
                p.room,
                roomState(p.room)
            );

            return;
        }

        /*
         INPUT
        */

        if (data.type === "input") {

            if (!p.room || !p.alive)
                return;

            if (
                Number.isFinite(
                    data.angle
                )
            ) {

                p.targetAngle =
                    data.angle;

            }

            p.boosting =
                data.boosting === true;

            p.lastInput =
                Date.now();

            return;
        }

        /*
         PLAYER KILLED
        */

        if (data.type === "kill") {

            if (!p.room) return;

            const victim =
                p.room.players.get(
                    String(data.victim)
                );

            if (!victim) return;

            if (!victim.alive)
                return;

            victim.alive = false;
            victim.boosting = false;

            p.kills++;
            p.score += 10;
            p.length += 12;

            broadcast(
                p.room,
                {
                    type: "kill",
                    killer: p.id,
                    victim: victim.id
                }
            );

            broadcast(
                p.room,
                roomState(p.room)
            );

            setTimeout(() => {

                if (
                    p.room &&
                    p.room === room
                ) {
                    respawnPlayer(victim);

                    broadcast(
                        p.room,
                        {
                            type: "respawn",
                            id: victim.id
                        }
                    );

                    broadcast(
                        p.room,
                        roomState(p.room)
                    );
                }

            }, 1200);

            return;
        }

        /*
         RESET
        */

        if (data.type === "reset") {

            if (!p.room) return;

            respawnPlayer(p);

            broadcast(
                p.room,
                roomState(p.room)
            );
        }
    });

    ws.on("close", () => {
        leaveRoom(p);
    });

    ws.on("error", () => {
        leaveRoom(p);
    });
});

/*
SERVER TICK

Kõik multiplayeri mängijad liiguvad
serveris pidevalt.
Seetõttu ei jää vastane boostimise ajal
seisma.
*/

setInterval(() => {

    const now = Date.now();

    for (const room of rooms.values()) {

        for (const p of room.players.values()) {

            if (!p.alive)
                continue;

            /*
             sujuv pööramine
            */

            let diff =
                p.targetAngle -
                p.angle;

            while (diff > Math.PI) {
                diff -= Math.PI * 2;
            }

            while (diff < -Math.PI) {
                diff += Math.PI * 2;
            }

            p.angle +=
                diff * 0.18;

            /*
             boost
            */

            const speed =
                p.boosting
                    ? 10
                    : 7;

            p.x +=
                Math.cos(p.angle) *
                speed;

            p.y +=
                Math.sin(p.angle) *
                speed;

            /*
             map boundary
            */

            if (p.x < 30)
                p.x = 30;

            if (p.x > WORLD - 30)
                p.x = WORLD - 30;

            if (p.y < 30)
                p.y = 30;

            if (p.y > WORLD - 30)
                p.y = WORLD - 30;

            /*
             keha
            */

            p.body.unshift({
                x: p.x,
                y: p.y
            });

            /*
             boost jätab ainult
             väikese koguse pikkust maha
            */

            if (
                p.boosting &&
                p.length > 30
            ) {

                p.length -= 0.025;

            }

            const wanted =
                Math.floor(
                    p.length
                );

            while (
                p.body.length < wanted
            ) {

                const last =
                    p.body[
                        p.body.length - 1
                    ] || {
                        x: p.x,
                        y: p.y
                    };

                p.body.push({
                    x: last.x,
                    y: last.y
                });
            }

            while (
                p.body.length > wanted
            ) {

                p.body.pop();

            }

            /*
             timeout kaitseb
             katkise kliendi eest
            */

            if (
                now - p.lastInput >
                10000
            ) {

                p.boosting = false;

            }
        }

        /*
         20 FPS server update
        */

        broadcast(
            room,
            roomState(room)
        );
    }

}, 50);

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Snake.io server running on port ${PORT}`
        );
    }
);
