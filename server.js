const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WIDTH = 150;
const HEIGHT = 150;

const MAX_PLAYERS = 4;

const TICK = 100;

const COLORS = [
    "#43ff72",
    "#45a5ff",
    "#ff4fd8",
    "#ffd43b"
];

const MODES = [
    "classic",
    "battle",
    "power",
    "maze",
    "last"
];

const server = http.createServer((req, res) => {

    res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("🐍 Snake Online 3.0 server töötab!");

});

const wss = new WebSocket.Server({
    server
});

const rooms = {};


/* =========================
   UTIL
========================= */

function id() {

    return Math.random()
        .toString(36)
        .slice(2, 10);

}


function makeRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {

        code = "";

        for(let i = 0; i < 6; i++) {

            code += chars[
                Math.floor(
                    Math.random() * chars.length
                )
            ];

        }

    } while(rooms[code]);

    return code;

}


function send(ws, data) {

    if(
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {

        ws.send(
            JSON.stringify(data)
        );

    }

}


/* =========================
   ROOM
========================= */

function createRoom(mode) {

    return {

        code: "",

        mode:
            MODES.includes(mode)
            ? mode
            : "classic",

        players: {},

        clients: new Set(),

        food: [],

        powerups: [],

        walls: [],

        started: false,

        interval: null

    };

}


/* =========================
   COLLISION
========================= */

function snakeAt(room, x, y) {

    return Object.values(
        room.players
    ).some(player => {

        return player.snake.some(part => {

            return (
                part.x === x &&
                part.y === y
            );

        });

    });

}


function wallAt(room, x, y) {

    return room.walls.some(wall => {

        return (
            wall.x === x &&
            wall.y === y
        );

    });

}


function randomPosition(room) {

    for(
        let tries = 0;
        tries < 500;
        tries++
    ) {

        const pos = {

            x: Math.floor(
                Math.random() * WIDTH
            ),

            y: Math.floor(
                Math.random() * HEIGHT
            )

        };

        if(
            !wallAt(
                room,
                pos.x,
                pos.y
            ) &&
            !snakeAt(
                room,
                pos.x,
                pos.y
            )
        ) {

            return pos;

        }

    }

    return {
        x: Math.floor(WIDTH / 2),
        y: Math.floor(HEIGHT / 2)
    };

}


/* =========================
   MAZE
========================= */

function createMaze() {

    const walls = [];

    /*
       suured pikad seinad
    */

    for(
        let x = 15;
        x < WIDTH - 15;
        x++
    ) {

        if(
            x < 70 ||
            x > 80
        ) {

            walls.push({
                x,
                y: 40
            });

        }

        if(
            x < 50 ||
            x > 60
        ) {

            walls.push({
                x,
                y: 110
            });

        }

    }


    for(
        let y = 15;
        y < HEIGHT - 15;
        y++
    ) {

        if(
            y < 70 ||
            y > 80
        ) {

            walls.push({
                x: 40,
                y
            });

        }

        if(
            y < 50 ||
            y > 60
        ) {

            walls.push({
                x: 110,
                y
            });

        }

    }


    return walls;

}


/* =========================
   PLAYER
========================= */

function createPlayer(
    playerId,
    name,
    index
) {

    const starts = [

        {
            x: 20,
            y: 20
        },

        {
            x: WIDTH - 21,
            y: HEIGHT - 21
        },

        {
            x: WIDTH - 21,
            y: 20
        },

        {
            x: 20,
            y: HEIGHT - 21
        }

    ];

    const start =
        starts[
            index % starts.length
        ];


    const direction =
        index === 1 ||
        index === 3
        ? "left"
        : "right";


    return {

        id: playerId,

        name:
            String(name || "Player")
            .slice(0, 12),

        color:
            COLORS[
                index % COLORS.length
            ],

        snake: [

            {
                x: start.x,
                y: start.y
            },

            {
                x:
                    start.x -
                    (
                        direction === "right"
                        ? 1
                        : -1
                    ),

                y: start.y
            },

            {
                x:
                    start.x -
                    (
                        direction === "right"
                        ? 2
                        : -2
                    ),

                y: start.y
            }

        ],

        direction,

        nextDirection: direction,

        score: 0,

        coins: 0,

        alive: true,

        respawnTimer: 0,

        shield: false,

        boost: 0

    };

}


/* =========================
   FOOD
========================= */

function addFood(room) {

    const pos =
        randomPosition(room);

    room.food.push({

        x: pos.x,

        y: pos.y,

        type: "apple"

    });

}


/* =========================
   POWER
========================= */

function addPower(room) {

    const pos =
        randomPosition(room);

    const types = [
        "speed",
        "shield",
        "coin"
    ];

    room.powerups.push({

        x: pos.x,

        y: pos.y,

        type:
            types[
                Math.floor(
                    Math.random() *
                    types.length
                )
            ]

    });

}


/* =========================
   RESET
========================= */

function resetPlayer(
    room,
    player,
    index
) {

    const starts = [

        {
            x: 20,
            y: 20
        },

        {
            x: WIDTH - 21,
            y: HEIGHT - 21
        },

        {
            x: WIDTH - 21,
            y: 20
        },

        {
            x: 20,
            y: HEIGHT - 21
        }

    ];

    const start =
        starts[
            index % starts.length
        ];


    const direction =
        index === 1 ||
        index === 3
        ? "left"
        : "right";


    player.snake = [

        {
            x: start.x,
            y: start.y
        },

        {
            x:
                start.x -
                (
                    direction === "right"
                    ? 1
                    : -1
                ),

            y: start.y
        },

        {
            x:
                start.x -
                (
                    direction === "right"
                    ? 2
                    : -2
                ),

            y: start.y
        }

    ];

    player.direction =
        direction;

    player.nextDirection =
        direction;

    player.alive = true;

    player.respawnTimer = 0;

    player.shield = false;

    player.boost = 0;

}


/* =========================
   KILL
========================= */

function killPlayer(
    room,
    player
) {

    if(player.shield) {

        player.shield = false;

        return;

    }

    player.alive = false;

    player.respawnTimer = 30;


    if(
        room.mode === "last" ||
        room.mode === "battle"
    ) {

        player.respawnTimer = -1;

    }

}


/* =========================
   MOVE
========================= */

function movePlayer(
    room,
    player
) {

    if(!player.alive) {

        if(
            player.respawnTimer > 0
        ) {

            player.respawnTimer--;

            if(
                player.respawnTimer === 0
            ) {

                const index =
                    Object.keys(
                        room.players
                    ).indexOf(
                        player.id
                    );

                resetPlayer(
                    room,
                    player,
                    index
                );

            }

        }

        return;

    }


    player.direction =
        player.nextDirection;


    const head = {

        x:
            player.snake[0].x,

        y:
            player.snake[0].y

    };


    if(
        player.direction === "up"
    ) head.y--;

    if(
        player.direction === "down"
    ) head.y++;

    if(
        player.direction === "left"
    ) head.x--;

    if(
        player.direction === "right"
    ) head.x++;


    /* seinad */

    if(
        head.x < 0 ||
        head.y < 0 ||
        head.x >= WIDTH ||
        head.y >= HEIGHT
    ) {

        killPlayer(
            room,
            player
        );

        return;

    }


    if(
        wallAt(
            room,
            head.x,
            head.y
        )
    ) {

        killPlayer(
            room,
            player
        );

        return;

    }


    /* teiste ussid */

    for(
        const other of Object.values(
            room.players
        )
    ) {

        if(!other.alive)
            continue;

        if(
            other.snake.some(part =>
                part.x === head.x &&
                part.y === head.y
            )
        ) {

            killPlayer(
                room,
                player
            );

            return;

        }

    }


    player.snake.unshift(head);


    /* toit */

    const foodIndex =
        room.food.findIndex(food =>
            food.x === head.x &&
            food.y === head.y
        );


    if(foodIndex !== -1) {

        room.food.splice(
            foodIndex,
            1
        );

        player.score++;

        player.coins++;

        addFood(room);

    } else {

        player.snake.pop();

    }


    /* power */

    const powerIndex =
        room.powerups.findIndex(power =>
            power.x === head.x &&
            power.y === head.y
        );


    if(powerIndex !== -1) {

        const power =
            room.powerups[
                powerIndex
            ];

        room.powerups.splice(
            powerIndex,
            1
        );


        if(power.type === "speed") {

            player.boost = 80;

        }


        if(power.type === "shield") {

            player.shield = true;

        }


        if(power.type === "coin") {

            player.coins += 10;

            player.score += 2;

        }

    }


    if(player.boost > 0) {

        player.boost--;

    }

}


/* =========================
   STATE
========================= */

function broadcast(room) {

    const safePlayers = {};

    Object.values(
        room.players
    ).forEach(player => {

        safePlayers[player.id] = {

            id: player.id,

            name: player.name,

            color: player.color,

            snake: player.snake,

            score: player.score,

            coins: player.coins,

            alive: player.alive,

            respawnTimer:
                player.respawnTimer,

            shield: player.shield,

            boost: player.boost

        };

    });


    const state = {

        width: WIDTH,

        height: HEIGHT,

        mode: room.mode,

        players: safePlayers,

        food: room.food,

        powerups: room.powerups,

        walls: room.walls

    };


    room.clients.forEach(client => {

        send(client, {

            type: "state",

            state

        });

    });

}


/* =========================
   WINNER
========================= */

function checkWinner(room) {

    if(
        room.mode !== "battle" &&
        room.mode !== "last"
    ) {

        return;

    }


    const alive =
        Object.values(
            room.players
        )
        .filter(
            player => player.alive
        );


    const count =
        Object.keys(
            room.players
        ).length;


    if(
        count >= 2 &&
        alive.length === 1
    ) {

        finishGame(
            room,
            alive[0]
        );

    }

}


function finishGame(
    room,
    winner
) {

    if(!room.started)
        return;

    room.started = false;

    clearInterval(
        room.interval
    );


    room.clients.forEach(
        client => {

            send(client, {

                type: "winner",

                winner: {

                    name: winner.name,

                    score: winner.score

                }

            });

        }
    );


    setTimeout(
        () => {

            if(!rooms[room.code])
                return;

            Object.values(
                room.players
            ).forEach(player => {

                player.score = 0;

                player.coins = 0;

                player.alive = true;

            });


            startGame(room);

        },
        3500
    );

}


/* =========================
   START
========================= */

function startGame(room) {

    if(room.started)
        return;

    room.started = true;

    room.food = [];

    room.powerups = [];

    room.walls =
        room.mode === "maze"
        ? createMaze()
        : [];


    for(
        let i = 0;
        i < 15;
        i++
    ) {

        addFood(room);

    }


    if(
        room.mode === "power"
    ) {

        for(
            let i = 0;
            i < 10;
            i++
        ) {

            addPower(room);

        }

    }


    room.clients.forEach(
        client => {

            send(client, {
                type: "start"
            });

        }
    );


    room.interval =
        setInterval(
            () => gameTick(room),
            TICK
        );

}


/* =========================
   GAME TICK
========================= */

function gameTick(room) {

    Object.values(
        room.players
    ).forEach(player => {

        movePlayer(
            room,
            player
        );

    });


    if(
        room.mode === "power" &&
        Math.random() < 0.04 &&
        room.powerups.length < 15
    ) {

        addPower(room);

    }


    checkWinner(room);

    broadcast(room);

}


/* =========================
   CONNECTION
========================= */

wss.on(
    "connection",
    ws => {

        const playerId =
            id();

        ws.playerId =
            playerId;

        ws.room = null;


        send(ws, {

            type: "connected",

            id: playerId

        });


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


                /* CREATE */

                if(
                    data.type ===
                    "createRoom"
                ) {

                    const code =
                        makeRoomCode();

                    const room =
                        createRoom(
                            data.mode
                        );

                    room.code =
                        code;

                    rooms[code] =
                        room;

                    ws.room =
                        code;

                    room.clients.add(ws);


                    room.players[playerId] =
                        createPlayer(
                            playerId,
                            data.name,
                            0
                        );


                    send(ws, {

                        type:
                            "roomCreated",

                        room: code,

                        mode:
                            room.mode

                    });


                    broadcast(room);

                    startGame(room);

                    return;

                }


                /* JOIN */

                if(
                    data.type ===
                    "joinRoom"
                ) {

                    const code =
                        String(
                            data.room || ""
                        )
                        .toUpperCase();


                    const room =
                        rooms[code];


                    if(!room) {

                        send(ws, {

                            type: "error",

                            message:
                                "Sellist tuba ei ole."

                        });

                        return;

                    }


                    if(
                        Object.keys(
                            room.players
                        ).length >=
                        MAX_PLAYERS
                    ) {

                        send(ws, {

                            type: "error",

                            message:
                                "Tuba on täis."

                        });

                        return;

                    }


                    ws.room =
                        code;

                    room.clients.add(ws);


                    const index =
                        Object.keys(
                            room.players
                        ).length;


                    room.players[playerId] =
                        createPlayer(
                            playerId,
                            data.name,
                            index
                        );


                    send(ws, {

                        type:
                            "roomJoined",

                        room: code,

                        mode:
                            room.mode

                    });


                    broadcast(room);

                    return;

                }


                /* DIRECTION */

                if(
                    data.type ===
                    "direction"
                ) {

                    if(!ws.room)
                        return;


                    const room =
                        rooms[ws.room];

                    if(!room)
                        return;


                    const player =
                        room.players[
                            playerId
                        ];

                    if(!player)
                        return;


                    if(!player.alive)
                        return;


                    const direction =
                        data.direction;


                    const opposite = {

                        up: "down",

                        down: "up",

                        left: "right",

                        right: "left"

                    };


                    if(
                        [
                            "up",
                            "down",
                            "left",
                            "right"
                        ].includes(
                            direction
                        ) &&
                        opposite[
                            direction
                        ] !==
                        player.direction
                    ) {

                        player.nextDirection =
                            direction;

                    }

                }


                /* BOOST */

                if(
                    data.type ===
                    "boost"
                ) {

                    if(!ws.room)
                        return;


                    const room =
                        rooms[ws.room];

                    if(!room)
                        return;


                    const player =
                        room.players[
                            playerId
                        ];

                    if(!player)
                        return;


                    if(
                        player.coins >= 3
                    ) {

                        player.coins -= 3;

                        player.boost = 30;

                    }

                }

            }
        );


        ws.on(
            "close",
            () => {

                if(!ws.room)
                    return;


                const room =
                    rooms[ws.room];


                if(!room)
                    return;


                delete room.players[
                    playerId
                ];


                room.clients.delete(ws);


                if(
                    room.clients.size === 0
                ) {

                    clearInterval(
                        room.interval
                    );

                    delete rooms[
                        ws.room
                    ];

                } else {

                    broadcast(room);

                }

            }
        );

    }
);


/* =========================
   START SERVER
========================= */

server.listen(
    PORT,
    () => {

        console.log(
            "🐍 Snake Online 3.0 server töötab pordil " +
            PORT
        );

    }
);
