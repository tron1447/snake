const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 20000;
const MAX_PLAYERS = 20;

const rooms = new Map();

const foodColors = [
  "#63ff78",
  "#ffd84d",
  "#ff6075",
  "#55c9ff",
  "#c76cff",
  "#ff963d"
];

function makeFood(){
  return {
    x:50 + Math.random() * (WORLD-100),
    y:50 + Math.random() * (WORLD-100),
    radius:3 + Math.random()*4,
    color:foodColors[
      Math.floor(Math.random()*foodColors.length)
    ],
    value:1 + Math.floor(Math.random()*4)
  };
}

const globalFoods = [];

for(let i=0;i<700;i++){
  globalFoods.push(makeFood());
}


/* =========================
   HTTP SERVER
========================= */

const server = http.createServer((req,res) => {

  let requested = req.url.split("?")[0];

  if(requested === "/"){
    requested = "/index.html";
  }

  const file = path.join(
    __dirname,
    requested
  );

  if(!file.startsWith(__dirname)){
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if(!fs.existsSync(file)){
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(file);

  const types = {
    ".html":"text/html; charset=utf-8",
    ".js":"application/javascript; charset=utf-8",
    ".css":"text/css; charset=utf-8",
    ".json":"application/json; charset=utf-8"
  };

  res.writeHead(200,{
    "Content-Type":
      types[ext] || "application/octet-stream"
  });

  fs.createReadStream(file).pipe(res);
});


/* =========================
   WEBSOCKET
========================= */

const wss = new WebSocket.Server({
  server
});


function makeId(){

  return Math.random()
    .toString(36)
    .substring(2,10);
}


function makeRoomCode(){

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


function broadcast(room,data){

  for(const player of room.players.values()){
    send(player.ws,data);
  }
}


function sendLobby(room){

  const players = [...room.players.values()]
    .map(p => ({
      id:p.id,
      name:p.name,
      color:p.color,
      host:p.host
    }));

  broadcast(room,{
    type:"lobby",
    players
  });
}


function sendPlayers(room){

  const players = {};

  for(const [id,p] of room.players){

    if(!p.alive) continue;

    players[id] = {
      x:p.x,
      y:p.y,
      angle:p.angle,
      length:p.length,
      color:p.color,
      name:p.name,
      boosting:p.boosting
    };
  }

  broadcast(room,{
    type:"players",
    players
  });
}


/* =========================
   CONNECTION
========================= */

wss.on("connection",ws => {

  const player = {

    ws,

    id:makeId(),

    name:"Player",

    color:"#63ff78",

    room:null,

    host:false,

    alive:true,

    x:10000,

    y:10000,

    angle:0,

    length:20,

    boosting:false
  };

  ws.player = player;

  send(ws,{
    type:"welcome",
    id:player.id
  });


  ws.on("message",raw => {

    let data;

    try{
      data = JSON.parse(raw.toString());
    }catch{
      return;
    }


    /* =========================
       CREATE
    ========================= */

    if(data.type === "createRoom"){

      if(player.room){
        return;
      }

      const code = makeRoomCode();

      const room = {
        code,
        started:false,
        players:new Map()
      };

      player.name =
        String(data.name || "Player")
          .substring(0,16);

      player.color =
        typeof data.color === "string"
          ? data.color
          : "#63ff78";

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

      send(ws,{
        type:"roomCreated",
        code
      });

      sendLobby(room);

      return;
    }


    /* =========================
       JOIN
    ========================= */

    if(data.type === "joinRoom"){

      if(player.room){
        send(ws,{
          type:"error",
          message:"Oled juba toas."
        });
        return;
      }

      const code =
        String(data.code || "")
          .trim()
          .toUpperCase();

      const room = rooms.get(code);

      if(!room){

        send(ws,{
          type:"error",
          message:"Seda tuba ei ole olemas."
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

      if(room.players.size >= MAX_PLAYERS){

        send(ws,{
          type:"error",
          message:"Tuba on täis."
        });

        return;
      }

      player.name =
        String(data.name || "Player")
          .substring(0,16);

      player.color =
        typeof data.color === "string"
          ? data.color
          : "#4da6ff";

      player.room = room;
      player.host = false;

      room.players.set(
        player.id,
        player
      );

      send(ws,{
        type:"roomJoined",
        code
      });

      sendLobby(room);

      return;
    }


    /* =========================
       START
    ========================= */

    if(data.type === "startGame"){

      const room = player.room;

      if(!room) return;

      if(!player.host) return;

      if(room.started) return;

      room.started = true;

      for(const p of room.players.values()){

        p.alive = true;

        p.length = 20;

        p.x =
          1500 +
          Math.random()*(WORLD-3000);

        p.y =
          1500 +
          Math.random()*(WORLD-3000);

        p.angle =
          Math.random()*Math.PI*2;

        send(p.ws,{
          type:"gameStart",
          spawn:{
            x:p.x,
            y:p.y
          }
        });
      }

      broadcast(room,{
        type:"foods",
        foods:globalFoods
      });

      return;
    }


    /* =========================
       STATE
    ========================= */

    if(data.type === "state"){

      if(!player.room) return;

      if(!roomStarted(player.room)) return;

      if(!player.alive) return;

      if(Number.isFinite(data.x)){
        player.x =
          Math.max(
            20,
            Math.min(
              WORLD-20,
              data.x
            )
          );
      }

      if(Number.isFinite(data.y)){
        player.y =
          Math.max(
            20,
            Math.min(
              WORLD-20,
              data.y
            )
          );
      }

      if(Number.isFinite(data.angle)){
        player.angle = data.angle;
      }

      if(Number.isFinite(data.length)){
        player.length =
          Math.max(
            20,
            Math.min(
              1000,
              data.length
            )
          );
      }

      if(typeof data.color === "string"){
        player.color = data.color.substring(0,20);
      }

      if(typeof data.name === "string"){
        player.name =
          data.name.substring(0,16);
      }

      player.boosting =
        !!data.boosting;

      return;
    }


    /* =========================
       EAT
    ========================= */

    if(data.type === "eat"){

      if(!player.room) return;

      if(!roomStarted(player.room)) return;

      if(!player.alive) return;

      const index = Number(data.index);

      if(
        !Number.isInteger(index) ||
        index < 0 ||
        index >= globalFoods.length
      ){
        return;
      }

      const food = globalFoods[index];

      const distance =
        Math.hypot(
          food.x-player.x,
          food.y-player.y
        );

      if(distance > 80){
        return;
      }

      player.length += food.value*.5;

      globalFoods[index] = makeFood();

      broadcast(
        player.room,
        {
          type:"foods",
          foods:globalFoods
        }
      );

      return;
    }

  });


  /* =========================
     CLOSE
  ========================= */

  ws.on("close",() => {

    const room = player.room;

    if(!room){
      return;
    }

    room.players.delete(
      player.id
    );

    if(player.host){

      const next =
        room.players.values().next().value;

      if(next){
        next.host = true;
      }
    }

    if(room.players.size === 0){

      rooms.delete(
        room.code
      );

    }else{

      sendLobby(room);
    }
  });

});


function roomStarted(room){

  return !!(
    room &&
    room.started
  );
}


/* =========================
   COMBAT
========================= */

function killPlayer(room,victim,killer){

  if(!victim.alive){
    return;
  }

  victim.alive = false;

  send(victim.ws,{
    type:"gameOver",
    reason:
      killer
      ? killer.name + " tappis sind!"
      : "Sind tapetud!"
  });

  if(killer){

    killer.length +=
      Math.max(
        10,
        victim.length*.25
      );

    broadcast(room,{
      type:"playerKilled",
      killer:killer.id,
      victim:victim.id
    });
  }

  /* surnud snake muutub toiduks */

  const drops =
    Math.min(
      80,
      Math.floor(victim.length/2)
    );

  for(let i=0;i<drops;i++){

    globalFoods.push({
      x:
        victim.x+
        (Math.random()-.5)*150,

      y:
        victim.y+
        (Math.random()-.5)*150,

      radius:4+Math.random()*3,

      color:victim.color,

      value:1
    });
  }

  /* piirame toidu hulka */

  while(globalFoods.length > 1200){
    globalFoods.shift();
  }

  broadcast(room,{
    type:"foods",
    foods:globalFoods
  });
}


function checkCombat(room){

  const players =
    [...room.players.values()]
      .filter(p => p.alive);

  for(const attacker of players){

    /*
      Snake.io stiilis:
      kui sinu pea puudutab teise keha,
      saad sina surma.
    */

    for(const victim of players){

      if(attacker === victim){
        continue;
      }

      const bodyLength =
        Math.min(
          200,
          Math.floor(victim.length)
        );

      for(let i=8;i<bodyLength;i+=3){

        const bx =
          victim.x-
          Math.cos(victim.angle)*
          i*8;

        const by =
          victim.y-
          Math.sin(victim.angle)*
          i*8;

        const distance =
          Math.hypot(
            attacker.x-bx,
            attacker.y-by
          );

        if(distance < 25){

          killPlayer(
            room,
            attacker,
            victim
          );

          break;
        }
      }

      if(!attacker.alive){
        break;
      }
    }
  }
}


/* =========================
   GAME LOOP
========================= */

setInterval(() => {

  for(const room of rooms.values()){

    if(!room.started){
      continue;
    }

    checkCombat(room);
    sendPlayers(room);
  }

},100);


/* =========================
   START SERVER
========================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "Snake Arena server running on port " +
      PORT
    );
  }
);
