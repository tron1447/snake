const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const server = http.createServer((req, res) => {
let urlPath = req.url.split("?")[0];

```
if (urlPath === "/") {
    urlPath = "/index.html";
}

const file = path.join(__dirname, urlPath);

if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
}

const ext = path.extname(file);

const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json"
};

res.writeHead(200, {
    "Content-Type": types[ext] || "text/plain"
});

fs.createReadStream(file).pipe(res);
```

});

const wss = new WebSocket.Server({ server });

function makeId() {
return Math.random().toString(36).substring(2, 10);
}

function makeRoomCode() {
let code;

```
do {
    code = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
} while (rooms.has(code));

return code;
```

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
const list = [];

```
for (const p of room.players.values()) {
    list.push({
        id: p.id,
        name: p.name,
        color: p.color,
        skin: p.skin,
        host: p.host
    });
}

broadcast(room, {
    type: "lobby",
    players: list
});
```

}

function playerStates(room) {
const states = {};

```
for (const [id, p] of room.players) {
    states[id] = {
        x: p.x,
        y: p.y,
        angle: p.angle,
        length: p.length,
        color: p.color,
        skin: p.skin,
        name: p.name
    };
}

broadcast(room, {
    type: "players",
    players: states
});
```

}

function distance(a, b) {
return Math.hypot(a.x - b.x, a.y - b.y);
}

function killPlayer(room, victim, killer) {
if (!victim || !killer) return;

```
send(victim.ws, {
    type: "gameOver",
    reason: "🐍 Sind elimineeriti!"
});

broadcast(room, {
    type: "kill",
    killer: killer.id,
    victim: victim.id
});

victim.x = 1000 + Math.random() * 10000;
victim.y = 1000 + Math.random() * 10000;
victim.length = 20;
```

}

function checkCombat(room) {
const list = [...room.players.values()];

```
for (const attacker of list) {
    if (!room.started) continue;

    for (const victim of list) {
        if (attacker === victim) continue;

        if (distance(attacker, victim) > 100) continue;

        if (attacker.length <= victim.length) continue;

        const bodyX =
            victim.x -
            Math.cos(victim.angle) * 60;

        const bodyY =
            victim.y -
            Math.sin(victim.angle) * 60;

        const headToBody = Math.hypot(
            attacker.x - bodyX,
            attacker.y - bodyY
        );

        if (headToBody < 30) {
            killPlayer(room, victim, attacker);
        }
    }
}
```

}

wss.on("connection", ws => {
const player = {
ws,
id: makeId(),
name: "Player",
room: null,
host: false,
x: 6000,
y: 6000,
angle: 0,
length: 20,
color: "#63ff78",
skin: "green"
};

```
ws.player = player;

send(ws, {
    type: "welcome",
    id: player.id
});

ws.on("message", raw => {
    let data;

    try {
        data = JSON.parse(raw.toString());
    } catch {
        return;
    }

    if (data.type === "createRoom") {
        if (player.room) return;

        const code = makeRoomCode();

        const room = {
            code,
            started: false,
            players: new Map()
        };

        player.name = String(data.name || "Player").substring(0, 16);
        player.color = String(data.color || "#63ff78");
        player.skin = String(data.skin || "green");
        player.room = room;
        player.host = true;

        room.players.set(player.id, player);
        rooms.set(code, room);

        send(ws, {
            type: "roomCreated",
            code,
            id: player.id
        });

        lobby(room);
        return;
    }

    if (data.type === "joinRoom") {
        if (player.room) return;

        const code = String(data.code || "")
            .toUpperCase()
            .substring(0, 6);

        const room = rooms.get(code);

        if (!room) {
            send(ws, {
                type: "error",
                message: "Seda tuba ei ole olemas."
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

        if (room.players.size >= 20) {
            send(ws, {
                type: "error",
                message: "Tuba on täis."
            });
            return;
        }

        player.name = String(data.name || "Player").substring(0, 16);
        player.color = String(data.color || "#63ff78");
        player.skin = String(data.skin || "green");
        player.room = room;

        player.x = 1000 + Math.random() * 10000;
        player.y = 1000 + Math.random() * 10000;
        player.angle = Math.random() * Math.PI * 2;
        player.length = 20;

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
        const room = player.room;

        if (!room) return;
        if (!player.host) return;

        room.started = true;

        for (const p of room.players.values()) {
            p.x = 1000 + Math.random() * 10000;
            p.y = 1000 + Math.random() * 10000;
            p.angle = Math.random() * Math.PI * 2;
            p.length = 20;

            send(p.ws, {
                type: "gameStart",
                id: p.id
            });
        }

        return;
    }

    if (data.type === "state") {
        if (!player.room) return;

        if (Number.isFinite(data.x)) {
            player.x = data.x;
        }

        if (Number.isFinite(data.y)) {
            player.y = data.y;
        }

        if (Number.isFinite(data.angle)) {
            player.angle = data.angle;
        }

        if (Number.isFinite(data.length)) {
            player.length = Math.max(20, Math.min(1000, data.length));
        }

        if (typeof data.color === "string") {
            player.color = data.color.substring(0, 20);
        }

        if (typeof data.skin === "string") {
            player.skin = data.skin.substring(0, 20);
        }

        if (typeof data.name === "string") {
            player.name = data.name.substring(0, 16);
        }

        return;
    }

    if (data.type === "attack") {
        const room = player.room;

        if (!room || !room.started) return;

        const target = room.players.get(String(data.target));

        if (!target) return;

        if (player.length <= target.length) return;

        if (distance(player, target) < 100) {
            killPlayer(room, target, player);
        }

        return;
    }
});

ws.on("close", () => {
    const room = player.room;

    if (!room) return;

    room.players.delete(player.id);

    if (player.host) {
        const next = room.players.values().next().value;

        if (next) {
            next.host = true;
        }
    }

    if (room.players.size === 0) {
        rooms.delete(room.code);
    } else {
        lobby(room);
    }
});
```

});

setInterval(() => {
for (const room of rooms.values()) {
if (!room.started) continue;

```
    playerStates(room);
    checkCombat(room);
}
```

}, 100);

server.listen(PORT, () => {
console.log("Snake Arena server running on port " + PORT);
});
