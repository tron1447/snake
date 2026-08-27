```js
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const rooms = new Map();

function makeId(){
    return Math.random().toString(36).substring(2,10);
}

function makeCode(){
    let code;

    do{
        code = Math.random()
            .toString(36)
            .substring(2,8)
            .toUpperCase();
    }while(rooms.has(code));

    return code;
}

function send(ws,data){

    if(
        ws &&
        ws.readyState === WebSocket.OPEN
    ){
        ws.send(JSON.stringify(data));
    }
}

const server = http.createServer((req,res)=>{

    let requested = req.url.split("?")[0];

    if(requested === "/"){
        requested = "/index.html";
    }

    const file = path.join(
        __dirname,
        requested
    );

    if(!fs.existsSync(file)){
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const ext = path.extname(file);

    const types = {
        ".html":"text/html; charset=utf-8",
        ".js":"application/javascript",
        ".css":"text/css",
        ".json":"application/json"
    };

    res.writeHead(200,{
        "Content-Type":
            types[ext] || "text/plain"
    });

    fs.createReadStream(file).pipe(res);
});

const wss = new WebSocket.Server({
    server
});

function lobby(room){

    const players = [];

    for(const p of room.players.values()){

        players.push({
            id:p.id,
            name:p.name,
            color:p.color,
            skin:p.skin,
            host:p.host
        });
    }

    for(const p of room.players.values()){

        send(p.ws,{
            type:"lobby",
            players
        });
    }
}

function broadcast(room,data){

    for(const p of room.players.values()){
        send(p.ws,data);
    }
}

function playerStates(room){

    const players = {};

    for(const [id,p] of room.players){

        players[id] = {
            x:p.x,
            y:p.y,
            angle:p.angle,
            length:p.length,
            color:p.color,
            skin:p.skin,
            name:p.name
        };
    }

    broadcast(room,{
        type:"players",
        players
    });
}

wss.on("connection",ws=>{

    const player = {

        ws,

        id:makeId(),

        name:"Player",

        color:"#63ff78",

        skin:"green",

        room:null,

        host:false,

        x:10000,

        y:10000,

        angle:0,

        length:20
    };

    ws.player = player;

    ws.on("message",raw=>{

        let data;

        try{
            data=JSON.parse(raw.toString());
        }catch{
            return;
        }

        /* CREATE */

        if(data.type === "createRoom"){

            if(player.room)return;

            const code=makeCode();

            const room={
                code,
                started:false,
                players:new Map()
            };

            player.name=String(
                data.name || "Player"
            ).substring(0,16);

            player.color=
                typeof data.color === "string"
                ? data.color
                : "#63ff78";

            player.skin=
                typeof data.skin === "string"
                ? data.skin
                : "green";

            player.room=room;
            player.host=true;

            room.players.set(
                player.id,
                player
            );

            rooms.set(code,room);

            send(ws,{
                type:"roomCreated",
                code,
                id:player.id
            });

            lobby(room);

            return;
        }

        /* JOIN */

        if(data.type === "joinRoom"){

            const code=String(
                data.code || ""
            ).toUpperCase();

            const room=rooms.get(code);

            if(!room){
                send(ws,{
                    type:"error",
                    message:"Seda roomi ei ole."
                });
                return;
            }

            if(room.started){
                send(ws,{
                    type:"error",
                    message:"Mäng on juba alanud."
                });
                return;
            }

            if(room.players.size>=20){
                send(ws,{
                    type:"error",
                    message:"Room on täis."
                });
                return;
            }

            player.name=String(
                data.name || "Player"
            ).substring(0,16);

            player.color=
                typeof data.color === "string"
                ? data.color
                : "#63ff78";

            player.skin=
                typeof data.skin === "string"
                ? data.skin
                : "green";

            player.room=room;

            room.players.set(
                player.id,
                player
            );

            send(ws,{
                type:"roomJoined",
                code,
                id:player.id
            });

            lobby(room);

            return;
        }

        /* START */

        if(data.type === "startGame"){

            const room=player.room;

            if(!room)return;

            if(!player.host)return;

            room.started=true;

            for(const p of room.players.values()){

                send(p.ws,{
                    type:"gameStart",
                    id:p.id
                });
            }

            return;
        }

        /* STATE */

        if(data.type === "state"){

            if(!player.room)return;

            if(Number.isFinite(data.x))
                player.x=data.x;

            if(Number.isFinite(data.y))
                player.y=data.y;

            if(Number.isFinite(data.angle))
                player.angle=data.angle;

            if(Number.isFinite(data.length))
                player.length=data.length;

            if(typeof data.color === "string")
                player.color=data.color;

            if(typeof data.skin === "string")
                player.skin=data.skin;

            if(typeof data.name === "string")
                player.name=
                    data.name.substring(0,16);

            return;
        }
    });

    ws.on("close",()=>{

        const room=player.room;

        if(!room)return;

        room.players.delete(player.id);

        if(player.host){

            const next=
                room.players.values().next().value;

            if(next){
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
    Saadame teiste mängijate asukohad
    20 korda sekundis.
*/

setInterval(()=>{

    for(const room of rooms.values()){

        if(room.started){
            playerStates(room);
        }
    }

},50);

server.listen(PORT,()=>{

    console.log(
        "Snake Arena server töötab pordil "+
        PORT
    );

});
```
