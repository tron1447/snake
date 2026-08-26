const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 12000;

const rooms = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Access-Control-Allow-Origin": "*"
  });
  res.end("🐍 Snake Arena multiplayer server ONLINE");
});

const wss = new WebSocket.Server({ server });

const COLORS = [
  "#55ff72","#42a5ff","#ff45d4","#ffe033",
  "#ff713d","#a855ff","#00eaff","#ff4268",
  "#ffffff","#9dff32","#ff9f1c","#00ffc8"
];

function uid() {
  return Math.random().toString(36).substring(2,10);
}

function rand(a,b) {
  return Math.random()*(b-a)+a;
}

function dist(a,b) {
  return Math.hypot(a.x-b.x,a.y-b.y);
}

function send(ws,data) {
  if(ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function makeFood(room,count) {
  for(let i=0;i<count;i++) {

    const r=Math.random();

    let type="normal";
    let value=1;
    let size=6;

    if(r<0.02) {
      type="gold";
      value=30;
      size=14;
    } else if(r<0.08) {
      type="purple";
      value=8;
      size=10;
    }

    room.food.push({
      id:uid(),
      x:rand(150,WORLD-150),
      y:rand(150,WORLD-150),
      type,
      value,
      size,
      pulse:Math.random()*10
    });
  }
}

function makePower(room) {

  const types=["speed","magnet","shield","double"];

  room.powers.push({
    id:uid(),
    x:rand(300,WORLD-300),
    y:rand(300,WORLD-300),
    type:types[Math.floor(Math.random()*types.length)]
  });
}

function createRoom(mode) {

  const room={
    code:"",
    host:null,
    mode:mode||"classic",
    clients:new Set(),
    players:{},
    food:[],
    powers:[],
    started:false,
    interval:null
  };

  makeFood(room,1600);

  for(let i=0;i<22;i++) {
    makePower(room);
  }

  return room;
}

function spawn(room) {

  for(let i=0;i<100;i++) {

    const p={
      x:rand(900,WORLD-900),
      y:rand(900,WORLD-900)
    };

    let good=true;

    for(const other of Object.values(room.players)) {

      if(!other.alive) continue;

      if(dist(p,other)<900) {
        good=false;
        break;
      }
    }

    if(good) return p;
  }

  return {
    x:WORLD/2,
    y:WORLD/2
  };
}

function createPlayer(room,id,name,skin) {

  const p=spawn(room);
  const angle=Math.random()*Math.PI*2;

  const player={
    id,
    name:String(name||"Player")
      .replace(/[<>]/g,"")
      .substring(0,16),

    skin:COLORS[
      Math.max(
        0,
        Math.min(COLORS.length-1,Number(skin)||0)
      )
    ],

    x:p.x,
    y:p.y,

    angle,
    targetAngle:angle,

    speed:5.8,
    boosting:false,

    score:0,
    length:65,

    alive:true,
    respawn:0,

    shield:0,
    magnet:0,
    speedPower:0,
    double:0,

    snake:[],
    lastDrop:0
  };

  for(let i=0;i<player.length;i++) {

    player.snake.push({
      x:player.x-Math.cos(angle)*i*7,
      y:player.y-Math.sin(angle)*i*7
    });
  }

  return player;
}

function kill(room,p) {

  if(!p.alive) return;

  if(p.shield>0) {

    p.shield=0;

    return;
  }

  p.alive=false;
  p.boosting=false;
  p.respawn=100;

  for(let i=0;i<p.snake.length;i+=3) {

    const b=p.snake[i];

    if(!b) continue;

    room.food.push({
      id:uid(),
      x:b.x+rand(-25,25),
      y:b.y+rand(-25,25),
      type:"death",
      value:3,
      size:8,
      pulse:0
    });
  }

  p.snake=[];
}

function respawn(room,p) {

  const s=spawn(room);

  p.x=s.x;
  p.y=s.y;

  p.angle=Math.random()*Math.PI*2;
  p.targetAngle=p.angle;

  p.score=0;
  p.length=65;

  p.shield=0;
  p.magnet=0;
  p.speedPower=0;
  p.double=0;

  p.alive=true;

  p.snake=[];

  for(let i=0;i<p.length;i++) {

    p.snake.push({
      x:p.x-Math.cos(p.angle)*i*7,
      y:p.y-Math.sin(p.angle)*i*7
    });
  }
}

function angleDiff(a,b) {

  let d=b-a;

  while(d>Math.PI)d-=Math.PI*2;
  while(d<-Math.PI)d+=Math.PI*2;

  return d;
}

function updatePlayer(room,p) {

  if(!p.alive) {

    p.respawn--;

    if(p.respawn<=0) {
      respawn(room,p);
    }

    return;
  }

  if(p.shield>0)p.shield--;
  if(p.magnet>0)p.magnet--;
  if(p.speedPower>0)p.speedPower--;
  if(p.double>0)p.double--;

  const diff=angleDiff(
    p.angle,
    p.targetAngle
  );

  p.angle+=Math.max(
    -.14,
    Math.min(.14,diff)
  );

  let speed=p.speed;

  if(p.speedPower>0) {
    speed=9;
  }

  if(p.boosting) {

    speed=11;

    p.length-=0.14;

    if(p.length<35) {
      p.boosting=false;
    }

    if(Date.now()-p.lastDrop>100) {

      room.food.push({
        id:uid(),
        x:p.x+rand(-15,15),
        y:p.y+rand(-15,15),
        type:"boost",
        value:2,
        size:6,
        pulse:0
      });

      p.lastDrop=Date.now();
    }
  }

  p.x+=Math.cos(p.angle)*speed;
  p.y+=Math.sin(p.angle)*speed;

  if(
    p.x<80 ||
    p.y<80 ||
    p.x>WORLD-80 ||
    p.y>WORLD-80
  ) {
    kill(room,p);
    return;
  }

  p.snake.unshift({
    x:p.x,
    y:p.y
  });

  while(
    p.snake.length>
    Math.max(30,Math.floor(p.length))
  ) {
    p.snake.pop();
  }

  collectFood(room,p);
  collectPowers(room,p);
}

function collectFood(room,p) {

  for(let i=room.food.length-1;i>=0;i--) {

    const f=room.food[i];

    if(dist(p,f)<27) {

      let value=f.value;

      if(p.double>0) {
        value*=2;
      }

      p.score+=value;
      p.length+=value*2;

      room.food.splice(i,1);
    }
  }

  if(p.magnet>0) {

    for(const f of room.food) {

      const d=dist(p,f);

      if(d<220) {

        f.x+=(p.x-f.x)*.1;
        f.y+=(p.y-f.y)*.1;
      }
    }
  }
}

function collectPowers(room,p) {

  for(let i=room.powers.length-1;i>=0;i--) {

    const power=room.powers[i];

    if(dist(p,power)<35) {

      if(power.type==="speed")
        p.speedPower=60*10;

      if(power.type==="magnet")
        p.magnet=60*12;

      if(power.type==="shield")
        p.shield=60*15;

      if(power.type==="double")
        p.double=60*15;

      room.powers.splice(i,1);
    }
  }
}

function collisions(room) {

  const players=Object.values(room.players);

  for(const a of players) {

    if(!a.alive)continue;

    for(const b of players) {

      if(!b.alive)continue;
      if(a.id===b.id)continue;

      for(let i=8;i<b.snake.length;i+=2) {

        const part=b.snake[i];

        if(dist(a,part)<20) {

          kill(room,a);

          break;
        }
      }

      if(!a.alive)break;
    }
  }
}

function getState(room) {

  const players={};

  for(const p of Object.values(room.players)) {

    players[p.id]={
      id:p.id,
      name:p.name,
      skin:p.skin,

      x:p.x,
      y:p.y,

      angle:p.angle,

      score:p.score,
      length:p.length,

      alive:p.alive,

      shield:p.shield,
      magnet:p.magnet,
      speedPower:p.speedPower,
      double:p.double,

      snake:p.snake
    };
  }

  return {
    world:WORLD,
    started:room.started,
    players,
    food:room.food,
    powers:room.powers
  };
}

function broadcast(room) {

  const packet={
    type:"state",
    state:getState(room)
  };

  for(const ws of room.clients) {
    send(ws,packet);
  }
}

function lobby(room) {

  const players=Object.values(room.players)
    .map(p=>({
      id:p.id,
      name:p.name,
      skin:p.skin
    }));

  for(const ws of room.clients) {

    send(ws,{
      type:"lobby",
      room:room.code,
      host:room.host,
      players
    });
  }
}

function startGame(room) {

  if(room.started)return;

  room.started=true;

  for(const ws of room.clients) {

    send(ws,{
      type:"gameStarted"
    });
  }

  room.interval=setInterval(()=>{

    for(const p of Object.values(room.players)) {
      updatePlayer(room,p);
    }

    collisions(room);

    while(room.food.length<1500) {
      makeFood(room,50);
    }

    while(room.powers.length<22) {
      makePower(room);
    }

    broadcast(room);

  },40);
}

wss.on("connection",ws=>{

  const id=uid();

  ws.playerId=id;
  ws.room=null;

  send(ws,{
    type:"connected",
    id
  });

  ws.on("message",raw=>{

    let data;

    try {
      data=JSON.parse(raw.toString());
    } catch {
      return;
    }

    if(data.type==="createRoom") {

      const code=
        Math.random()
          .toString(36)
          .substring(2,8)
          .toUpperCase();

      const room=createRoom(data.mode);

      room.code=code;
      room.host=id;

      rooms.set(code,room);

      ws.room=code;

      room.clients.add(ws);

      room.players[id]=
        createPlayer(
          room,
          id,
          data.name,
          data.skin
        );

      send(ws,{
        type:"roomCreated",
        room:code,
        host:true
      });

      lobby(room);

      return;
    }

    if(data.type==="joinRoom") {

      const code=
        String(data.room||"")
          .trim()
          .toUpperCase();

      const room=rooms.get(code);

      if(!room) {

        send(ws,{
          type:"error",
          message:"❌ Seda roomi ei ole."
        });

        return;
      }

      if(room.started) {

        send(ws,{
          type:"error",
          message:"⚠️ Mäng on juba alanud."
        });

        return;
      }

      ws.room=code;

      room.clients.add(ws);

      room.players[id]=
        createPlayer(
          room,
          id,
          data.name,
          data.skin
        );

      send(ws,{
        type:"roomJoined",
        room:code,
        host:false
      });

      lobby(room);

      return;
    }

    if(data.type==="startGame") {

      const room=rooms.get(ws.room);

      if(!room)return;

      if(room.host!==id) {

        send(ws,{
          type:"error",
          message:"Ainult roomi host saab mängu alustada."
        });

        return;
      }

      startGame(room);

      return;
    }

    if(data.type==="aim") {

      const room=rooms.get(ws.room);

      if(!room)return;

      const p=room.players[id];

      if(!p)return;

      if(typeof data.angle==="number") {
        p.targetAngle=data.angle;
      }

      return;
    }

    if(data.type==="boost") {

      const room=rooms.get(ws.room);

      if(!room)return;

      const p=room.players[id];

      if(!p)return;

      p.boosting=Boolean(data.active);
    }

  });

  ws.on("close",()=>{

    const code=ws.room;

    if(!code)return;

    const room=rooms.get(code);

    if(!room)return;

    delete room.players[id];

    room.clients.delete(ws);

    if(room.host===id) {

      const ids=Object.keys(room.players);

      room.host=ids[0]||null;
    }

    if(room.clients.size===0) {

      if(room.interval) {
        clearInterval(room.interval);
      }

      rooms.delete(code);

      return;
    }

    if(!room.started) {
      lobby(room);
    }
  });

});

server.listen(PORT,()=>{
  console.log(
    `🐍 Snake Arena running on port ${PORT}`
  );
});
