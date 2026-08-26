const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WIDTH = 150;
const HEIGHT = 150;

const MAX_PLAYERS = 8;
const TICK = 100;

const COLORS = [
    "#42ff72",
    "#43a5ff",
    "#ff4fd8",
    "#ffd43b",
    "#ff7043",
    "#b65cff",
    "#00e5ff",
    "#ff3d71"
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

    res.end("🐍 Snake Online server töötab!");

});

const wss = new WebSocket.Server({
    server
});

const rooms = {};


/* =========================
   HELPERS
========================= */

function makeId() {

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


function validDirection(direction) {

    return [
        "up",
        "down",
        "left",
        "right"
    ].includes(direction);

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

function wallAt(room, x, y) {

    return room.walls.some(wall =>
        wall.x === x &&
        wall.y === y
    );

}


function snakeAt(room, x, y) {

    return Object.values(room.players)
        .some(player => {

            if(!player.alive)
                return false;

            return player.snake.some(part =>
                part.x === x &&
                part.y === y
            );

        });

}


function randomPosition(room) {

    for(let i = 0; i < 1000; i++) {

        const position = {

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
                position.x,
                position.y
            ) &&
            !snakeAt(
                room,
                position.x,
                position.y
            )
        ) {

            return position;

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

    /* horisontaalsed seinad */

    for(
        let x = 15;
        x < WIDTH - 15;
        x++
    ) {

        if(x < 65 || x > 85) {

            walls.push({
                x,
                y: 45
            });

        }

        if(x < 45 || x > 65) {

            walls.push({
                x,
                y: 105
            });

        }

    }


    /* vertikaalsed seinad */

    for(
        let y = 15;
        y < HEIGHT - 15;
        y++
    ) {

        if(y < 65 || y > 85) {

            walls.push({
                x: 45,
                y
            });

        }

        if(y < 45 || y > 65) {

            walls.push({
                x: 105,
                y
            });

        }

    }

    return walls;

}


/* =========================
   PLAYER
========================= */

function startPosition(index) {

    const positions = [

        { x: 20, y: 20 },

        { x: WIDTH - 21, y: HEIGHT - 21 },

        { x: WIDTH - 21, y: 20 },

        { x: 20, y: HEIGHT - 21 },

        { x: 75, y: 20 },

        { x: 75, y: HEIGHT - 21 },

        { x: 20, y: 75 },

        { x: WIDTH - 21, y: 75 }

    ];

    return positions[
        index % positions.length
    ];

}


function startDirection(index) {

    const directions = [
        "right",
        "left",
        "left",
        "right",
        "down",
        "up",
        "right",
        "left"
    ];

    return directions[
        index % directions.length
    ];

}


function createPlayer(
    playerId,
    name,
    index
) {

    const start =
        startPosition(index);

    const direction =
        startDirection(index);

    const backwards =
        direction === "right"
        ? -1
        : direction === "left"
        ? 1
        : 0;

    const verticalBack =
        direction === "down"
        ? -1
        : direction === "up"
        ? 1
        : 0;

    return {

        id: playerId,

        name:
            String(name || "Player")
            .replace(/[<>]/g, "")
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
                    start.x + backwards,
                y:
                    start.y + verticalBack
            },

            {
                x:
                    start.x + backwards * 2,
                y:
                    start.y + verticalBack * 2
            }

        ],

        direction: direction,

        nextDirection: direction,

        score: 0,

        coins: 0,

        alive: true,

        respawnTimer: 0,

        shield: false,

        boost: 0,

        boostCooldown: 0

    };

}


/* =========================
   FOOD
========================= */

function addFood(room) {

    const position =
        randomPosition(room);

    room.food.push({

        x: position.x,

        y: position.y

    });

}


/* =========================
   POWERUPS
========================= */

function addPowerup(room) {

    const position =
        randomPosition(room);

    const types = [
        "speed",
        "shield",
        "coin"
    ];

    const type =
        types[
            Math.floor(
                Math.random() *
                types.length
            )
        ];

    room.powerups.push({

        x: position.x,

        y: position.y,

        type: type

    });

}


/* =========================
   RESET PLAYER
========================= */

function resetPlayer(
    room,
    player
) {

    const index =
        Object.keys(
            room.players
        ).indexOf(
            player.id
        );

    const start =
        startPosition(index);

    const direction =
        startDirection(index);

    const backwards =
        direction === "right"
        ? -1
        : direction === "left"
        ? 1
        : 0;

    const verticalBack =
        direction === "down"
        ? -1
        : direction === "up"
        ? 1
        : 0;

    player.snake = [

        {
            x: start.x,
            y: start.y
        },

        {
            x:
                start.x + backwards,
            y:
                start.y + verticalBack
        },

        {
            x:
                start.x + backwards * 2,
            y:
                start.y + verticalBack * 2
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

    player.boostCooldown = 0;

}


/* =========================
   KILL
========================= */

function killPlayer(
    room,
    player
) {

    if(!player.alive)
        return;

    if(player.shield) {

        player.shield = false;

        return;

    }

    player.alive = false;

    if(
        room.mode === "classic" ||
        room.mode === "power" ||
        room.mode === "maze"
    ) {

        player.respawnTimer = 25;

    } else {

        player.respawnTimer = -1;

    }

}


/* =========================
   NEXT HEAD
========================= */

function getNextHead(player) {

    const head = {

        x: player.snake[0].x,

        y: player.snake[0].y

    };

    if(player.direction === "up")
        head.y--;

    if(player.direction === "down")
        head.y++;

    if(player.direction === "left")
        head.x--;

    if(player.direction === "right")
        head.x++;

    return head;

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
                player.respawnTimer <= 0
            ) {

                resetPlayer(
                    room,
                    player
                );

            }

        }

        return;

    }


    /*
       Väga oluline:
       ussile on alati suund.
    */

    if(
        !validDirection(
            player.direction
        )
    ) {

        player.direction = "right";

    }


    if(
        validDirection(
            player.nextDirection
        )
    ) {

        const opposite = {

            up: "down",

            down: "up",

            left: "right",

            right: "left"

        };

        if(
            player.nextDirection !==
            opposite[player.direction]
        ) {

            player.direction =
                player.nextDirection;

        }

    }


    const head =
        getNextHead(player);


    /* piir */

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


    /* sein */

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


    /* teine uss */

    for(
        const other of Object.values(
            room.players
        )
    ) {

        if(!other.alive)
            continue;

        for(
            const part of other.snake
        ) {

            if(
                part.x === head.x &&
                part.y === head.y
            ) {

                killPlayer(
                    room,
                    player
                );

                return;

            }

        }

    }


    player.snake.unshift(
        head
    );


    /* toit */

    const foodIndex =
        room.food.findIndex(food =>
            food.x === head.x &&
            food.y === head.y
        );


    if(foodIndex >= 0) {

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


    /* powerup */

    const powerIndex =
        room.powerups.findIndex(power =>
            power.x === head.x &&
            power.y === head.y
        );


    if(powerIndex >= 0) {

        const power =
            room.powerups[
                powerIndex
            ];

        room.powerups.splice(
            powerIndex,
            1
        );


        if(
            power.type === "speed"
        ) {

            player.boost = 100;

        }


        if(
            power.type === "shield"
        ) {

            player.shield = true;

        }


        if(
            power.type === "coin"
        ) {

            player.coins += 10;

            player.score += 2;

        }

    }


    if(player.boost > 0) {

        player.boost--;

    }


    if(
        player.boostCooldown > 0
    ) {

        player.boostCooldown--;

    }

}


/* =========================
   BOOST
========================= */

function boostPlayer(
    player
) {

    if(!player)
        return;

    if(!player.alive)
        return;

    if(
        player.boostCooldown > 0
    )
        return;

    /*
       Boost kestab 30 ticki.
    */

    player.boost = Math.max(
        player.boost,
        30
    );

    player.boostCooldown = 45;

}


/* =========================
   GAME SPEED
========================= */

function gameTick(room) {

    Object.values(
        room.players
    ).forEach(
        player => {

            movePlayer(
                room,
                player
            );

        }
    );


    /*
       Boostitud mängijad liiguvad
       veel ühe sammu.
    */

    Object.values(
        room.players
    ).forEach(
        player => {

            if(
                player.alive &&
                player.boost > 0 &&
                Math.random() < 0.65
            ) {

                movePlayer(
                    room,
                    player
                );

            }

        }
    );


    if(
        room.mode === "power" &&
        Math.random() < 0.04 &&
        room.powerups.length < 15
    ) {

        addPowerup(room);

    }


    checkWinner(room);

    broadcast(room);

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


    const players =
        Object.values(
            room.players
        );


    if(players.length < 2)
        return;


    const alive =
        players.filter(
            player =>
                player.alive
        );


    if(alive.length === 1) {

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

            send(
                client,
                {

                    type: "winner",

                    winner: {

                        name:
                            winner.name,

                        score:
                            winner.score

                    }

                }
            );

        }
    );


    setTimeout(
        () => {

            if(!rooms[room.code])
                return;

            Object.values(
                room.players
            ).forEach(
                player => {

                    player.score = 0;

                    player.coins = 0;

                    player.alive = true;

                    player.respawnTimer = 0;

                }
            );

            startGame(room);

        },
        3500
    );

}


/* =========================
   START GAME
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
        i < 25;
        i++
    ) {

        addFood(room);

    }


    if(
        room.mode === "power"
    ) {

        for(
            let i = 0;
            i < 12;
            i++
        ) {

            addPowerup(room);

        }

    }


    room.clients.forEach(
        client => {

            send(
                client,
                {
                    type: "start"
                }
            );

        }
    );


    room.interval =
        setInterval(
            () => gameTick(room),
            TICK
        );

}


/* =========================
   BROADCAST
========================= */

function broadcast(room) {

    const players = {};


    Object.values(
        room.players
    ).forEach(
        player => {

            players[player.id] = {

                id: player.id,

                name: player.name,

                color: player.color,

                snake: player.snake,

                direction: player.direction,

                score: player.score,

                coins: player.coins,

                alive: player.alive,

                respawnTimer:
                    player.respawnTimer,

                shield: player.shield,

                boost: player.boost

            };

        }
    );


    const state = {

        width: WIDTH,

        height: HEIGHT,

        mode: room.mode,

        players: players,

        food: room.food,

        powerups: room.powerups,

        walls: room.walls

    };


    room.clients.forEach(
        client => {

            send(
                client,
                {
                    type: "state",
                    state: state
                }
            );

        }
    );

}


/* =========================
   CONNECTION
========================= */

wss.on(
    "connection",
    ws => {

        const playerId =
            makeId();

        ws.playerId =
            playerId;

        ws.room = null;


        send(
            ws,
            {
                type: "connected",
                id: playerId
            }
        );


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

                    room.clients.add(
                        ws
                    );


                    room.players[
                        playerId
                    ] =
                        createPlayer(
                            playerId,
                            data.name,
                            0
                        );


                    send(
                        ws,
                        {

                            type:
                                "roomCreated",

                            room: code,

                            mode:
                                room.mode

                        }
                    );


                    broadcast(room);

                    startGame(room);

                    return;

                }


                /* JOIN ROOM */

                if(
                    data.type ===
                    "joinRoom"
                ) {

                    const code =
                        String(
                            data.room || ""
                        )
                        .trim()
                        .toUpperCase();


                    const room =
                        rooms[code];


                    if(!room) {

                        send(
                            ws,
                            {

                                type: "error",

                                message:
                                    "Sellist tuba ei ole."

                            }
                        );

                        return;

                    }


                    if(
                        Object.keys(
                            room.players
                        ).length >=
                        MAX_PLAYERS
                    ) {

                        send(
                            ws,
                            {

                                type: "error",

                                message:
                                    "Tuba on täis."

                            }
                        );

                        return;

                    }


                    if(ws.room) {

                        return;

                    }


                    ws.room =
                        code;

                    room.clients.add(
                        ws
                    );


                    const index =
                        Object.keys(
                            room.players
                        ).length;


                    room.players[
                        playerId
                    ] =
                        createPlayer(
                            playerId,
                            data.name,
                            index
                        );


                    send(
                        ws,
                        {

                            type:
                                "roomJoined",

                            room: code,

                            mode:
                                room.mode

                        }
                    );


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
                        rooms[
                            ws.room
                        ];

                    if(!room)
                        return;


                    const player =
                        room.players[
                            playerId
                        ];

                    if(!player)
                        return;


                    const direction =
                        data.direction;


                    if(
                        !validDirection(
                            direction
                        )
                    )
                        return;


                    const opposite = {

                        up: "down",

                        down: "up",

                        left: "right",

                        right: "left"

                    };


                    if(
                        direction !==
                        opposite[
                            player.direction
                        ]
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
                        rooms[
                            ws.room
                        ];

                    if(!room)
                        return;


                    const player =
                        room.players[
                            playerId
                        ];

                    if(!player)
                        return;


                    /*
                       Boost kasutab münte.
                       Kui münte on 3, võtab 3.
                       Alguses saab tasuta boosti,
                       sest mängijal on 0 coins.
                    */

                    if(
                        player.coins >= 3
                    ) {

                        player.coins -= 3;

                        boostPlayer(
                            player
                        );

                    } else {

                        /*
                           tasuta väike boost
                        */

                        boostPlayer(
                            player
                        );

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
                    rooms[
                        ws.room
                    ];


                if(!room)
                    return;


                delete room.players[
                    playerId
                ];


                room.clients.delete(
                    ws
                );


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
   SERVER START
========================= */

server.listen(
    PORT,
    () => {

        console.log(
            `🐍 Snake Online töötab pordil ${PORT}`
        );

    }
);
