const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("🐍 Snake Online server töötab!");
});

const wss = new WebSocket.Server({
    server: server
});

const rooms = {};

const COLORS = [
    "#45ff7b",
    "#42a5ff",
    "#ff4fd8",
    "#ffd43b"
];

function makeRoomCode() {
    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {
        code = "";

        for (let i = 0; i < 6; i++) {
            code += chars[
                Math.floor(Math.random() * chars.length)
            ];
        }

    } while (rooms[code]);

    return code;
}

function createSnake(index) {

    const positions = [
        { x: 3, y: 3 },
        { x: 16, y: 16 },
        { x: 16, y: 3 },
        { x: 3, y: 16 }
    ];

    const pos =
        positions[index] || positions[0];

    return [
        { x: pos.x, y: pos.y },
        { x: pos.x - 1, y: pos.y },
        { x: pos.x - 2, y: pos.y }
    ];
}

function createPlayer(id, name, index) {

    return {
        id: id,
        name: name,
        color: COLORS[index % COLORS.length],

        snake: createSnake(index),

        direction: "right",
        nextDirection: "right",

        score: 0,
        alive: true
    };
}

function createFood(room) {

    let food;

    do {

        food = {
            x: Math.floor(Math.random() * 20),
            y: Math.floor(Math.random() * 20)
        };

    } while (
        Object.values(room.players).some(player =>
            player.snake.some(part =>
                part.x === food.x &&
                part.y === food.y
            )
        )
    );

    return food;
}

function send(ws, data) {

    if (ws.readyState === WebSocket.OPEN) {

        ws.send(
            JSON.stringify(data)
        );

    }
}

function broadcast(room) {

    const state = {
        players: room.players,
        food: room.food
    };

    room.clients.forEach(client => {

        send(client, {
            type: "state",
            state: state
        });

    });
}

function startGame(room) {

    if (room.started)
        return;

    room.started = true;

    room.clients.forEach(client => {

        send(client, {
            type: "start"
        });

    });

    room.interval = setInterval(
        () => gameTick(room),
        130
    );
}

function gameTick(room) {

    const players =
        Object.values(room.players);

    players.forEach(player => {

        if (!player.alive)
            return;

        player.direction =
            player.nextDirection;

        const head = {
            x: player.snake[0].x,
            y: player.snake[0].y
        };

        if (player.direction === "up")
            head.y--;

        if (player.direction === "down")
            head.y++;

        if (player.direction === "left")
            head.x--;

        if (player.direction === "right")
            head.x++;


        // Seinad

        if (
            head.x < 0 ||
            head.x >= 20 ||
            head.y < 0 ||
            head.y >= 20
        ) {

            player.alive = false;

            return;
        }


        // Iseenda sisse

        if (
            player.snake.some(part =>
                part.x === head.x &&
                part.y === head.y
            )
        ) {

            player.alive = false;

            return;
        }


        // Teiste mängijate sisse

        for (const other of players) {

            if (
                other.id === player.id ||
                !other.alive
            )
                continue;

            if (
                other.snake.some(part =>
                    part.x === head.x &&
                    part.y === head.y
                )
            ) {

                player.alive = false;

                return;
            }
        }


        player.snake.unshift(head);


        // Toit

        const foodIndex =
            room.food.findIndex(food =>
                food.x === head.x &&
                food.y === head.y
            );

        if (foodIndex !== -1) {

            room.food.splice(
                foodIndex,
                1
            );

            player.score++;

            room.food.push(
                createFood(room)
            );

        } else {

            player.snake.pop();

        }

    });


    broadcast(room);


    // Kui kõik on surnud

    const alivePlayers =
        players.filter(
            player => player.alive
        );

    if (alivePlayers.length === 0) {

        clearInterval(room.interval);

        room.started = false;

    }
}


wss.on("connection", ws => {

    const id =
        Math.random()
            .toString(36)
            .substring(2, 10);

    ws.playerId = id;
    ws.room = null;


    send(ws, {
        type: "connected",
        id: id
    });


    ws.on("message", message => {

        let data;

        try {

            data =
                JSON.parse(message.toString());

        } catch {

            return;

        }


        // LOE TUBA

        if (data.type === "createRoom") {

            const roomCode =
                makeRoomCode();

            rooms[roomCode] = {

                players: {},

                clients: new Set(),

                food: [],

                started: false,

                interval: null

            };

            const room =
                rooms[roomCode];


            ws.room = roomCode;

            room.clients.add(ws);


            room.players[id] =
                createPlayer(
                    id,
                    data.name || "Player",
                    0
                );


            room.food.push(
                createFood(room)
            );


            send(ws, {
                type: "roomCreated",
                room: roomCode
            });


            broadcast(room);

            startGame(room);

            return;
        }


        // LIITU TUPA

        if (data.type === "joinRoom") {

            const roomCode =
                String(data.room)
                    .toUpperCase();


            const room =
                rooms[roomCode];


            if (!room) {

                send(ws, {
                    type: "error",
                    message:
                        "Sellist tuba ei ole."
                });

                return;
            }


            const playerCount =
                Object.keys(room.players).length;


            if (playerCount >= 4) {

                send(ws, {
                    type: "error",
                    message:
                        "Tuba on täis."
                });

                return;
            }


            ws.room = roomCode;

            room.clients.add(ws);


            room.players[id] =
                createPlayer(
                    id,
                    data.name || "Player",
                    playerCount
                );


            send(ws, {
                type: "roomJoined",
                room: roomCode
            });


            broadcast(room);

            return;
        }


        // SUUNA MUUTMINE

        if (data.type === "direction") {

            if (!ws.room)
                return;

            const room =
                rooms[ws.room];

            if (!room)
                return;

            const player =
                room.players[id];

            if (!player)
                return;

            if (!player.alive)
                return;


            const direction =
                data.direction;


            const opposite = {

                up: "down",

                down: "up",

                left: "right",

                right: "left"

            };


            if (
                direction &&
                opposite[direction] !==
                player.direction
            ) {

                player.nextDirection =
                    direction;

            }

        }

    });


    ws.on("close", () => {

        if (!ws.room)
            return;


        const room =
            rooms[ws.room];

        if (!room)
            return;


        delete room.players[id];

        room.clients.delete(ws);


        if (room.clients.size === 0) {

            clearInterval(
                room.interval
            );

            delete rooms[ws.room];

        } else {

            broadcast(room);

        }

    });

});


server.listen(
    PORT,
    () => {

        console.log(
            `🐍 Snake Online server töötab pordil ${PORT}`
        );

    }
);
