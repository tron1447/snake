const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 20000;

const rooms = new Map();

const server = http.createServer((req,res)=>{
    let url = req.url.split("?")[0];

    if(url === "/") url = "/index.html";

    const file = path.join(__dirname,url);

    if(!fs.existsSync(file)){
        res.writeHead(404);
        return res.end("Not found");
    }

    const ext = path.extname(file);

    const types = {
        ".html":"text/html; charset=utf-8",
        ".js":"application/javascript",
        ".css":"text/css",
        ".json":"application/json"
    };

    res.writeHead(200,{
        "Content-Type":types[ext] || "text/plain"
    });

    fs.createReadStream(file).pipe(res);
});

const wss = new WebSocket.Server({server});

function send(ws,data){
    if(ws && ws.readyState === WebSocket.OPEN){
        ws.send(JSON.stringify(data));
    }
}

function roomCode(){
    let code;

    do{
        code=Math.random()
            .toString(36)
            .substring(2,8)
            .toUpperCase();
    }while(rooms.has(code));

    return code;
}

function id(){
    return Math.random()
        .toString(36)
        .substring(2,10);
}

function randomPosition(){
    return {
        x:3000+Math.random()*14000,
        y:3000+Math.random()*14000
    };
}

function lobby(room){
    const players=[...room.players.values()].map(p=>({
        name:p.name,
        color:p.color,
        host:p.host
    }));

    for(const p of room.players.values()){
        send(p.ws,{
            type:"lobby",
            players
        });
    }
}

function broadcastPlayers(room){
    const players={};

    for(const [pid,p] of room.players){
        players[pid]={
            x:p.x,
            y:p.y,
            angle:p.angle,
            length:p.length,
            color:p.color,
            name:p.name,
            attacking:p.attacking
        };
    }

    for(const p of room.players.values()){
        send(p.ws,{
            type:"players",
            players
        });
    }
}

function distance(a,b){
    return Math.hypot(a.x-b.x,a.y-b.y);
}

/*
    Kontrollime:
    1. kas meie pea tabab teise keha
    2. kas ründav pea on teise pea lähedal
*/
function checkCombat(room){

    for(const attacker of room.players.values()){

        if(!attacker.alive) continue;

        for(const victim of room.players.values()){

            if(attacker === victim) continue;
            if(!victim.alive) continue;

            /*
                Pea vastu keha.
                Kui kaugus on väike, sureb ohver.
            */
            for(let i=1;i<victim.trail.length;i++){

                const segment=victim.trail[i];

                if(distance(attacker,segment)<18){

                    killPlayer(
                        room,
                        victim,
                        attacker
                    );

                    break;
                }
            }

            if(!victim.alive) continue;

            /*
                Attack nupp:
                kui ründaja pea on teise pea lähedal,
                saab ründaja tappa väiksema mao.
            */
            if(
                attacker.attacking &&
                distance(attacker,victim)<55 &&
                attacker.length>=victim.length*0.8
            ){
                killPlayer(
                    room,
                    victim,
                    attacker
                );
            }
        }
    }
}

function killPlayer(room,victim,killer){

    if(!victim.alive)return;

    victim.alive=false;

    send(victim.ws,{
        type:"gameOver",
        reason:
            killer.name+
            " ründas sind!"
    });

    if(killer && killer.alive){

        killer.length +=
            Math.max(5,victim.length*.25);

        send(killer.ws,{
            type:"playerKilled",
            id:victim.id
        });

        /*
            Tapetud mängija muudab osa pikkusest toiduks.
        */
        for(let i=0;i<Math.min(25,Math.floor(victim.length));i++){

            const p=victim.trail[
                Math.floor(
                    Math.random()*
                    victim.trail.length
                )
            ];

            if(p){
                room.food.push({
                    x:p.x,
                    y:p.y,
                    r:4,
                    color:victim.color,
                    value:2
                });
            }
        }
    }

    setTimeout(()=>{

        if(room.players.has(victim.id)){

            const pos=randomPosition();

            victim.x=pos.x;
            victim.y=pos.y;
            victim.angle=Math.random()*Math.PI*2;
            victim.length=20;
            victim.alive=true;
            victim.trail=[];

            send(victim.ws,{
                type:"respawn",
                x:victim.x,
                y:victim.y,
                angle:victim.angle,
                length:victim.length
            });
        }

    },2500);
}

wss.on("connection",ws=>{

    const player={
        ws,
        id:id(),
        name:"Player",
        color:"#63ff78",
        room:null,
        host:false,

        x:10000,
        y:10000,
        angle:0,
        length:20,

        attacking:false,
        alive:true,

        trail:[]
    };

    ws.player=player;

    ws.on("message",raw=>{

        let data;

        try{
            data=JSON.parse(raw.toString());
        }catch{
            return;
        }

        /*
            CREATE
        */
        if(data.type==="createRoom"){

            if(player.room)return;

            const code=roomCode();

            const room={
                code,
                started:false,
                players:new Map(),
                food:[]
            };

            for(let i=0;i<700;i++){

                room.food.push({
                    x:Math.random()*WORLD,
                    y:Math.random()*WORLD,
                    r:3+Math.random()*4,
                    color:[
                        "#63ff78",
                        "#ffd84d",
                        "#ff6075",
                        "#55c9ff",
                        "#c76cff",
                        "#ff963d"
                    ][Math.floor(Math.random()*6)],
                    value:1+Math.floor(Math.random()*4)
                });
            }

            player.name=String(data.name||"Player").substring(0,16);
            player.color=String(data.color||"#63ff78");

            const pos=randomPosition();

            player.x=pos.x;
            player.y=pos.y;

            player.room=room;
            player.host=true;

            room.players.set(player.id,player);
            rooms.set(code,room);

            send(ws,{
                type:"roomCreated",
                code,
                id:player.id
            });

            lobby(room);
            return;
        }

        /*
            JOIN
        */
        if(data.type==="joinRoom"){

            const code=String(data.code||"").toUpperCase();
            const room=rooms.get(code);

            if(!room){
                return send(ws,{
                    type:"error",
                    message:"Seda tuba ei ole olemas."
                });
            }

            if(room.started){
                return send(ws,{
                    type:"error",
                    message:"Mäng on juba alanud."
                });
            }

            if(room.players.size>=20){
                return send(ws,{
                    type:"error",
                    message:"Tuba on täis."
                });
            }

            player.name=String(data.name||"Player").substring(0,16);
            player.color=String(data.color||"#63ff78");

            const pos=randomPosition();

            player.x=pos.x;
            player.y=pos.y;

            player.room=room;
            room.players.set(player.id,player);

            send(ws,{
                type:"roomJoined",
                code,
                id:player.id
            });

            lobby(room);
            return;
        }

        /*
            START
        */
        if(data.type==="startGame"){

            const room=player.room;

            if(!room)return;
            if(!player.host)return;

            room.started=true;

            for(const p of room.players.values()){

                p.alive=true;

                const pos=randomPosition();

                p.x=pos.x;
                p.y=pos.y;
                p.angle=Math.random()*Math.PI*2;
                p.length=20;
                p.trail=[];

                send(p.ws,{
                    type:"gameStart",
                    id:p.id,
                    x:p.x,
                    y:p.y,
                    angle:p.angle,
                    length:p.length
                });
            }

            return;
        }

        /*
            PLAYER STATE
        */
        if(data.type==="state"){

            if(!player.room)return;
            if(!player.alive)return;

            if(Number.isFinite(data.x))
                player.x=Math.max(
                    20,
                    Math.min(WORLD-20,data.x)
                );

            if(Number.isFinite(data.y))
                player.y=Math.max(
                    20,
                    Math.min(WORLD-20,data.y)
                );

            if(Number.isFinite(data.angle))
                player.angle=data.angle;

            if(Number.isFinite(data.length))
                player.length=Math.max(
                    20,
                    Math.min(1000,data.length)
                );

            if(typeof data.color==="string")
                player.color=data.color.substring(0,20);

            if(typeof data.name==="string")
                player.name=data.name.substring(0,16);

            player.attacking=!!data.attacking;

            /*
                Salvestame mao trajektoori.
                See võimaldab serveril kontrollida kokkupõrkeid.
            */
            player.trail.unshift({
                x:player.x,
                y:player.y
            });

            const maxTrail=Math.min(
                300,
                Math.floor(player.length)
            );

            while(player.trail.length>maxTrail){
                player.trail.pop();
            }

            /*
                Toidu söömine serveris.
            */
            for(let i=player.room.food.length-1;i>=0;i--){

                const food=player.room.food[i];

                if(distance(player,food)<25){

                    player.length+=food.value*.5;

                    player.room.food.splice(i,1);

                    player.room.food.push({
                        x:Math.random()*WORLD,
                        y:Math.random()*WORLD,
                        r:3+Math.random()*4,
                        color:food.color,
                        value:food.value
                    });
                }
            }

            return;
        }
    });

    ws.on("close",()=>{

        const room=player.room;

        if(!room)return;

        room.players.delete(player.id);

        if(player.host){

            const next=room.players.values().next().value;

            if(next){
                player.host=false;
                next.host=true;
            }
        }

        if(room.players.size===0){
            rooms.delete(room.code);
        }else{
            lobby(room);
        }
    });
});

/*
    Server uuendab mängu.
*/
setInterval(()=>{

    for(const room of rooms.values()){

        if(!room.started)continue;

        checkCombat(room);

        broadcastPlayers(room);

        /*
            Saadame toidu perioodiliselt.
        */
        for(const p of room.players.values()){

            send(p.ws,{
                type:"food",
                foods:room.food
            });
        }
    }

},100);

server.listen(PORT,()=>{
    console.log("Snake Arena server töötab pordil "+PORT);
});
