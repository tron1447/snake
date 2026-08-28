const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 14000;

const server = http.createServer((req,res)=>{

    if(
        req.url !== "/" &&
        req.url !== "/index.html"
    ){

        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const file =
        path.join(
            __dirname,
            "index.html"
        );

    fs.readFile(
        file,
        (err,data)=>{

            if(err){

                res.writeHead(500);
                res.end(
                    "index.html puudub"
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

const clients =
    new Map();

const rooms =
    new Map();

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

            code +=
                chars[
                    Math.floor(
                        Math.random()*
                        chars.length
                    )
                ];
        }

    }while(
        rooms.has(code)
    );

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

/*
    KÕIGE OLULISEM OSA

    A pea -> B keha
    A SUREB.

    B pea -> A keha
    B SUREB.
*/

function collisionCheck(room){

    const players=
        room.players;

    for(
        const attacker of players
    ){

        if(!attacker.alive)
            continue;

        for(
            const victim of players
        ){

            if(
                attacker.id === victim.id ||
                !victim.alive
            )
                continue;

            /*
                ATTACKER HEAD
                -> VICTIM BODY
            */

            let hitBody=false;

            for(
                let i=12;
                i<victim.body.length;
                i+=2
            ){

                const part=
                    victim.body[i];

                const distance=
                    Math.hypot(
                        attacker.x-part.x,
                        attacker.y-part.y
                    );

                if(distance<31){

                    hitBody=true;
                    break;
                }
            }

            if(hitBody){

                /*
                    JUST ATTACKER SUREB!
                */

                attacker.alive=false;

                /*
                    Victim saab killi.
                */

                victim.kills++;
                victim.score+=100;
                victim.length+=25;

                break;
            }
        }
    }

    /*
       PEAD VASTAMISI
       Kui kaks pead kokku lähevad,
       väiksem sureb.
    */

    for(
        let i=0;
        i<players.length;
        i++
    ){

        for(
            let j=i+1;
            j<players.length;
            j++
        ){

            const a=players[i];
            const b=players[j];

            if(
                !a.alive||
                !b.alive
            )
                continue;

            if(
                Math.hypot(
                    a.x-b.x,
                    a.y-b.y
                )<48
            ){

                if(a.length>b.length){

                    b.alive=false;

                    a.kills++;
                    a.score+=100;

                }else if(
                    b.length>a.length
                ){

                    a.alive=false;

                    b.kills++;
                    b.score+=100;

                }else{

                    a.alive=false;
                    b.alive=false;
                }
            }
        }
    }
}

function publicPlayer(p){

    return{

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

        body:p.body
    };
}

function broadcast(room){

    const state=
        room.players.map(
            publicPlayer
        );

    for(
        const p of room.players
    ){

        send(
            clients.get(p.id),
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
                id
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

                /*
                    CREATE ROOM
                */

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

                    rooms.set(
                        code,
                        {
                            code,
                            started:false,
                            players:[player]
                        }
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

                /*
                    JOIN ROOM
                */

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

                /*
                    START
                */

                if(
                    data.type===
                    "start"
                ){

                    const room=
                        rooms.get(
                            ws.roomCode
                        );

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

                /*
                    INPUT
                */

                if(
                    data.type===
                    "input"
                ){

                    const room=
                        rooms.get(
                            ws.roomCode
                        );

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
    Multiplayer game loop
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
            "Snake Arena server töötab pordil "+
            PORT
        );
    }
);
