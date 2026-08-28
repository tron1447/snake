const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 14000;

const server = http.createServer((req,res)=>{

    let file;

    if(
        req.url === "/" ||
        req.url === "/index.html"
    ){

        file =
            path.join(
                __dirname,
                "index.html"
            );

    }else{

        res.writeHead(404);
        res.end("Not found");
        return;
    }

    fs.readFile(
        file,
        (err,data)=>{

            if(err){

                res.writeHead(500);

                res.end(
                    "Could not load index.html"
                );

                return;
            }

            res.writeHead(
                200,
                {
                    "Content-Type":
                    "text/html; charset=utf-8"
                }
            );

            res.end(data);
        }
    );
});

const wss =
    new WebSocket.Server({
        server
    });

const clients = new Map();

const rooms = new Map();

function send(ws,data){

    if(
        ws &&
        ws.readyState ===
        WebSocket.OPEN
    ){

        ws.send(
            JSON.stringify(data)
        );
    }
}

function randomCode(){

    const chars=
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do{

        code="";

        for(
            let i=0;
            i<5;
            i++
        ){

            code+=
                chars[
                    Math.floor(
                        Math.random()*
                        chars.length
                    )
                ];
        }

    }while(rooms.has(code));

    return code;
}

function createPlayer(
    id,
    name,
    color
){

    const p={

        id,

        name:
            String(name||"Player")
            .replace(/[<>]/g,"")
            .slice(0,16),

        color:
            color||
            "#54ff6b",

        x:
            1500+
            Math.random()*
            (WORLD-3000),

        y:
            1500+
            Math.random()*
            (WORLD-3000),

        angle:
            Math.random()*
            Math.PI*2,

        targetAngle:0,

        speed:7.4,

        length:75,

        score:0,

        kills:0,

        boost:false,

        alive:true,

        body:[]
    };

    p.targetAngle=p.angle;

    for(
        let i=0;
        i<75;
        i++
    ){

        p.body.push({

            x:
                p.x-
                Math.cos(p.angle)*
                i*7,

            y:
                p.y-
                Math.sin(p.angle)*
                i*7
        });
    }

    return p;
}

function updatePlayer(p){

    if(!p.alive)
        return;

    let diff=
        p.targetAngle-
        p.angle;

    while(diff>Math.PI)
        diff-=Math.PI*2;

    while(diff<-Math.PI)
        diff+=Math.PI*2;

    p.angle+=diff*.13;

    const speed=
        p.boost
        ?10
        :7.4;

    p.speed=speed;

    p.x+=
        Math.cos(p.angle)*
        speed;

    p.y+=
        Math.sin(p.angle)*
        speed;

    if(
        p.boost&&
        p.length>70
    ){

        p.length-=0.045;
    }

    if(
        p.x<35||
        p.y<35||
        p.x>WORLD-35||
        p.y>WORLD-35
    ){

        p.alive=false;

        return;
    }

    p.body.unshift({

        x:p.x,
        y:p.y
    });

    const wanted=
        Math.max(
            60,
            Math.floor(p.length)
        );

    while(
        p.body.length<wanted
    ){

        const last=
            p.body[
                p.body.length-1
            ];

        p.body.push({

            x:last.x,
            y:last.y
        });
    }

    while(
        p.body.length>wanted
    ){

        p.body.pop();
    }
}

function collisionCheck(room){

    const players=
        room.players;

    /*
       Mängija A pea
       läheb mängija B keha sisse.
       A sureb.
    */

    for(
        const attacker of players
    ){

        if(!attacker.alive)
            continue;

        for(
            const victim of players
        ){

            if(
                attacker.id===
                victim.id||
                !victim.alive
            )
                continue;

            let hit=false;

            for(
                let i=12;
                i<victim.body.length;
                i+=2
            ){

                const part=
                    victim.body[i];

                const dx=
                    attacker.x-
                    part.x;

                const dy=
                    attacker.y-
                    part.y;

                if(
                    Math.hypot(
                        dx,
                        dy
                    )<31
                ){

                    hit=true;

                    break;
                }
            }

            if(hit){

                victim.alive=false;

                attacker.kills++;

                attacker.score+=100;

                attacker.length+=25;
            }
        }
    }
}

function getPublicPlayer(p){

    return {

        id:p.id,

        name:p.name,

        color:p.color,

        x:p.x,

        y:p.y,

        angle:p.angle,

        length:p.length,

        score:p.score,

        kills:p.kills,

        alive:p.alive,

        /*
           Saadame terve keha.
           Selle tõttu näeb teine mängija
           päriselt ussi, mitte pulka.
        */

        body:p.body
    };
}

function broadcast(room){

    const state=
        room.players.map(
            getPublicPlayer
        );

    for(
        const player of
        room.players
    ){

        const ws=
            clients.get(player.id);

        send(
            ws,
            {
                type:"state",
                players:state
            }
        );
    }
}

wss.on(
    "connection",
    ws=>{

        const id=
            Math.random()
            .toString(36)
            .slice(2)+
            Date.now()
            .toString(36);

        clients.set(
            id,
            ws
        );

        send(
            ws,
            {
                type:"connected",
                id:id
            }
        );

        ws.on(
            "message",
            raw=>{

                let data;

                try{

                    data=
                        JSON.parse(
                            raw.toString()
                        );

                }catch{

                    return;
                }

                /* CREATE ROOM */

                if(
                    data.type===
                    "createRoom"
                ){

                    const code=
                        randomCode();

                    const player=
                        createPlayer(
                            id,
                            data.name,
                            data.color
                        );

                    const room={

                        code,

                        started:false,

                        players:[
                            player
                        ]
                    };

                    rooms.set(
                        code,
                        room
                    );

                    ws.roomCode=code;

                    send(
                        ws,
                        {

                            type:
                                "roomCreated",

                            code,

                            id
                        }
                    );

                    return;
                }

                /* JOIN */

                if(
                    data.type===
                    "joinRoom"
                ){

                    const code=
                        String(
                            data.code||""
                        )
                        .toUpperCase();

                    const room=
                        rooms.get(code);

                    if(!room){

                        send(
                            ws,
                            {

                                type:"error",

                                message:
                                    "Roomi ei leitud."
                            }
                        );

                        return;
                    }

                    if(room.started){

                        send(
                            ws,
                            {

                                type:"error",

                                message:
                                    "Mäng on juba alanud."
                            }
                        );

                        return;
                    }

                    if(
                        room.players.length>=8
                    ){

                        send(
                            ws,
                            {

                                type:"error",

                                message:
                                    "Room on täis."
                            }
                        );

                        return;
                    }

                    const player=
                        createPlayer(
                            id,
                            data.name,
                            data.color
                        );

                    room.players.push(
                        player
                    );

                    ws.roomCode=code;

                    send(
                        ws,
                        {

                            type:
                                "roomJoined",

                            code,

                            id
                        }
                    );

                    return;
                }

                /* START */

                if(
                    data.type===
                    "start"
                ){

                    const code=
                        ws.roomCode;

                    if(!code)
                        return;

                    const room=
                        rooms.get(code);

                    if(!room)
                        return;

                    room.started=true;

                    for(
                        const p of
                        room.players
                    ){

                        send(
                            clients.get(p.id),
                            {
                                type:
                                    "gameStart"
                            }
                        );
                    }

                    return;
                }

                /* INPUT */

                if(
                    data.type===
                    "input"
                ){

                    const code=
                        ws.roomCode;

                    if(!code)
                        return;

                    const room=
                        rooms.get(code);

                    if(!room)
                        return;

                    const player=
                        room.players.find(
                            p=>
                                p.id===id
                        );

                    if(!player)
                        return;

                    if(
                        typeof
                        data.targetAngle===
                        "number"
                    ){

                        player.targetAngle=
                            data.targetAngle;
                    }

                    player.boost=
                        Boolean(
                            data.boost
                        );
                }

            }
        );

        ws.on(
            "close",
            ()=>{

                clients.delete(id);

                const code=
                    ws.roomCode;

                if(!code)
                    return;

                const room=
                    rooms.get(code);

                if(!room)
                    return;

                room.players=
                    room.players.filter(
                        p=>
                            p.id!==id
                    );

                if(
                    room.players.length===0
                ){

                    rooms.delete(code);

                }else{

                    broadcast(room);
                }
            }
        );
    }
);

/*
   20 korda sekundis.
*/

setInterval(
    ()=>{

        for(
            const room of
            rooms.values()
        ){

            if(!room.started)
                continue;

            for(
                const p of
                room.players
            ){

                updatePlayer(p);
            }

            collisionCheck(room);

            broadcast(room);
        }

    },
    50
);

server.listen(
    PORT,
    ()=>{
        console.log(
            "Snake Arena töötab pordil "+
            PORT
        );
    }
);
