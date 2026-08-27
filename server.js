<!DOCTYPE html>
<html lang="et">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Snake Arena</title>

<style>
*{
 box-sizing:border-box;
 margin:0;
 padding:0;
 user-select:none;
 -webkit-user-select:none;
 touch-action:none;
}

html,body{
 width:100%;
 height:100%;
 overflow:hidden;
 background:#050805;
 font-family:Arial,sans-serif;
}

#game{
 position:fixed;
 inset:0;
 width:100%;
 height:100%;
}

#menu{
 position:fixed;
 inset:0;
 z-index:50;
 display:flex;
 justify-content:center;
 align-items:center;
 background:radial-gradient(circle at 50% 20%,#245f2d,#0a1b0d 40%,#020402 85%);
}

.panel{
 width:min(94vw,440px);
 max-height:94vh;
 overflow:auto;
 padding:26px;
 background:rgba(4,12,5,.97);
 border:1px solid rgba(99,255,120,.35);
 border-radius:28px;
 box-shadow:0 0 70px rgba(99,255,120,.15);
 color:white;
 text-align:center;
}

.logo{
 font-size:65px;
 filter:drop-shadow(0 0 15px #63ff78);
}

h1{
 color:#63ff78;
 font-size:40px;
}

.subtitle{
 color:#829384;
 margin:5px 0 20px;
}

input{
 width:100%;
 height:48px;
 margin:5px 0;
 background:#071007;
 border:1px solid #315c37;
 border-radius:12px;
 color:white;
 text-align:center;
 font-size:16px;
 outline:none;
}

button{
 cursor:pointer;
 font-weight:bold;
}

.mainBtn{
 width:100%;
 height:48px;
 margin-top:7px;
 border:0;
 border-radius:12px;
 font-size:15px;
}

.green{
 background:#63ff78;
 color:#031006;
}

.dark{
 background:#102014;
 color:white;
 border:1px solid #315b36;
}

#skins{
 display:flex;
 gap:8px;
 justify-content:center;
 flex-wrap:wrap;
 margin:12px 0;
}

.skin{
 width:54px;
 height:54px;
 border-radius:50%;
 border:3px solid transparent;
 font-size:25px;
}

.skin.selected{
 border-color:white;
 transform:scale(1.12);
 box-shadow:0 0 18px currentColor;
}

#roomBox{
 display:none;
 margin-top:15px;
}

.roomTitle{
 font-size:11px;
 color:#819482;
}

#roomCode{
 font-size:32px;
 color:#63ff78;
 font-weight:bold;
 letter-spacing:6px;
 margin:5px 0 10px;
}

#players{
 max-height:140px;
 overflow:auto;
 text-align:left;
}

.playerRow{
 padding:8px;
 margin:4px 0;
 border-radius:8px;
 background:#0b170d;
}

#startBtn{
 display:none;
 width:100%;
 height:48px;
 margin-top:10px;
 border:0;
 border-radius:12px;
}

#error{
 color:#ff6676;
 min-height:20px;
 margin-top:10px;
}

#connection{
 color:#718172;
 font-size:11px;
 margin-top:8px;
}

#hud{
 position:fixed;
 z-index:10;
 left:10px;
 top:10px;
 display:none;
 gap:6px;
}

.stat{
 padding:7px 10px;
 background:rgba(0,0,0,.65);
 border:1px solid rgba(99,255,120,.25);
 border-radius:10px;
 color:white;
}

.stat small{
 display:block;
 color:#78907c;
 font-size:9px;
}

.stat b{
 font-size:16px;
}

#minimap{
 position:fixed;
 z-index:12;
 right:10px;
 top:10px;
 width:160px;
 height:160px;
 display:none;
 border-radius:15px;
 border:2px solid rgba(99,255,120,.7);
 background:#061007;
}

#joystick{
 position:fixed;
 z-index:20;
 left:24px;
 bottom:24px;
 width:145px;
 height:145px;
 display:none;
 border-radius:50%;
 background:rgba(99,255,120,.08);
 border:2px solid rgba(99,255,120,.35);
}

#stick{
 position:absolute;
 left:50%;
 top:50%;
 width:62px;
 height:62px;
 transform:translate(-50%,-50%);
 border-radius:50%;
 background:#63ff78;
 border:3px solid white;
 box-shadow:0 0 20px rgba(99,255,120,.5);
}

#boost{
 position:fixed;
 z-index:20;
 right:25px;
 bottom:30px;
 width:90px;
 height:90px;
 display:none;
 border-radius:50%;
 background:#087bb0;
 color:white;
 border:3px solid #a5e3ff;
 font-size:27px;
}

#boost:active{
 transform:scale(.92);
}

#killText{
 position:fixed;
 z-index:30;
 left:50%;
 top:25%;
 transform:translateX(-50%) scale(.7);
 opacity:0;
 color:#63ff78;
 font-size:38px;
 font-weight:900;
 text-shadow:0 0 20px #63ff78;
 pointer-events:none;
 transition:.25s;
}

#killText.show{
 opacity:1;
 transform:translateX(-50%) scale(1);
}

#gameOver{
 position:fixed;
 inset:0;
 z-index:60;
 display:none;
 justify-content:center;
 align-items:center;
 background:rgba(0,0,0,.75);
}

.overPanel{
 width:min(90vw,390px);
 padding:30px;
 background:#081008;
 border:1px solid #315b36;
 border-radius:25px;
 text-align:center;
 color:white;
}

.overPanel h2{
 color:#ff596c;
 font-size:38px;
}

@media(max-width:800px){
 #joystick,#boost{
  display:block;
 }

 #minimap{
  width:125px;
  height:125px;
 }
}
</style>
</head>

<body>

<canvas id="game"></canvas>

<div id="menu">

<div class="panel">

<div class="logo">🐍</div>

<h1>SNAKE ARENA</h1>

<div class="subtitle">
Eat • Grow • Attack
</div>

<input
 id="name"
 maxlength="16"
 placeholder="Sinu nimi"
 autocomplete="off"
>

<h3 style="margin-top:10px">
🎨 Vali oma skin
</h3>

<div id="skins">

<button class="skin selected"
data-color="#63ff78"
data-skin="green"
style="background:#63ff78">
🐍
</button>

<button class="skin"
data-color="#4da6ff"
data-skin="blue"
style="background:#4da6ff">
😎
</button>

<button class="skin"
data-color="#ff5570"
data-skin="red"
style="background:#ff5570">
😈
</button>

<button class="skin"
data-color="#ffd84d"
data-skin="yellow"
style="background:#ffd84d">
😄
</button>

<button class="skin"
data-color="#b86cff"
data-skin="purple"
style="background:#b86cff">
👾
</button>

<button class="skin"
data-color="#ff8a3d"
data-skin="orange"
style="background:#ff8a3d">
🔥
</button>

<button class="skin"
data-color="#ffffff"
data-skin="white"
style="background:white;color:black">
👻
</button>

<button class="skin"
data-color="#00e5d4"
data-skin="cyan"
style="background:#00e5d4">
🤖
</button>

</div>

<button id="createBtn" class="mainBtn green">
🏠 CREATE ROOM
</button>

<input
 id="roomInput"
 maxlength="6"
 placeholder="ROOM CODE"
 style="text-transform:uppercase"
>

<button id="joinBtn" class="mainBtn dark">
🚪 JOIN ROOM
</button>

<div id="roomBox">

<div class="roomTitle">
ROOM CODE
</div>

<div id="roomCode">
------
</div>

<div id="players"></div>

<button id="startBtn" class="green">
▶ START GAME
</button>

</div>

<div id="error"></div>

<div id="connection">
Ühendamine...
</div>

</div>
</div>

<div id="hud">

<div class="stat">
<small>SCORE</small>
<b id="score">0</b>
</div>

<div class="stat">
<small>LENGTH</small>
<b id="length">20</b>
</div>

<div class="stat">
<small>PLAYERS</small>
<b id="playerCount">1</b>
</div>

</div>

<canvas id="minimap" width="160" height="160"></canvas>

<div id="killText">
💥 ELIMINATED!
</div>

<div id="joystick">
<div id="stick"></div>
</div>

<button id="boost">
⚡
</button>

<div id="gameOver">

<div class="overPanel">

<h2>GAME OVER</h2>

<p>
Skoor:
<b id="finalScore">0</b>
</p>

<br>

<button
 class="mainBtn green"
 onclick="location.reload()">
🔄 UUesti
</button>

</div>

</div>

<script>

/* ==============================
   CANVAS
============================== */

const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");

const minimap=document.getElementById("minimap");
const mapCtx=minimap.getContext("2d");

let W=innerWidth;
let H=innerHeight;

function resize(){

 W=innerWidth;
 H=innerHeight;

 canvas.width=W;
 canvas.height=H;
}

addEventListener("resize",resize);
resize();


/* ==============================
   WORLD
============================== */

const WORLD=20000;


/* ==============================
   FOOD
============================== */

const foods=[];
const FOOD_COUNT=500;

const foodColors=[
 "#63ff78",
 "#ffd84d",
 "#ff6075",
 "#55c9ff",
 "#c76cff",
 "#ff963d"
];

function makeFood(){

 return {
  x:Math.random()*WORLD,
  y:Math.random()*WORLD,
  radius:3+Math.random()*4,
  color:foodColors[
   Math.floor(Math.random()*foodColors.length)
  ],
  value:1+Math.floor(Math.random()*5)
 };
}

for(let i=0;i<FOOD_COUNT;i++){
 foods.push(makeFood());
}


/* ==============================
   PLAYER
============================== */

const me={

 id:null,

 x:10000,
 y:10000,

 angle:0,
 targetAngle:0,

 length:20,

 color:"#63ff78",

 skin:"green",

 name:"Player"
};

let body=[];

let others={};

let score=0;

let running=false;

let boosting=false;

let dead=false;


/* ==============================
   SKINS
============================== */

document
.querySelectorAll(".skin")
.forEach(button=>{

 button.addEventListener("click",()=>{

  document
  .querySelectorAll(".skin")
  .forEach(b=>
   b.classList.remove("selected")
  );

  button.classList.add("selected");

  me.color=button.dataset.color;
  me.skin=button.dataset.skin;

 });

});


/* ==============================
   WEBSOCKET
============================== */

let socket=null;
let connected=false;

function connect(){

 const protocol=
 location.protocol==="https:"
 ? "wss:"
 : "ws:";

 const url=
 protocol+"//"+location.host;

 setConnection("🟡 Ühendamine...");

 try{

  socket=new WebSocket(url);

 }catch{

  setConnection("🔴 Ühendus ebaõnnestus");
  return;

 }

 socket.onopen=()=>{

  connected=true;
  setConnection("🟢 Server ühendatud");

 };

 socket.onclose=()=>{

  connected=false;
  setConnection("🔴 Ühendus katkes");

 };

 socket.onerror=()=>{

  connected=false;
  setConnection("🔴 Serveri viga");

 };

 socket.onmessage=event=>{

  let data;

  try{
   data=JSON.parse(event.data);
  }catch{
   return;
  }

  serverMessage(data);

 };

}

function send(data){

 if(
  !socket ||
  socket.readyState!==WebSocket.OPEN
 ){
  return false;
 }

 socket.send(JSON.stringify(data));

 return true;
}


/* ==============================
   SERVER
============================== */

function serverMessage(data){

 if(data.type==="roomCreated"){

  me.id=data.id||me.id;

  showRoom(data.code);
  return;
 }

 if(data.type==="roomJoined"){

  me.id=data.id||me.id;

  showRoom(data.code);
  return;
 }

 if(data.type==="lobby"){

  updateLobby(data.players||[]);
  return;
 }

 if(data.type==="gameStart"){

  me.id=data.id||me.id;

  startGame();
  return;
 }

 if(data.type==="players"){

  others=data.players||{};

  updatePlayerCount();

  return;
 }

 if(data.type==="error"){

  showError(data.message);

 }

}


/* ==============================
   UI
============================== */

function playerName(){

 return(
  document
  .getElementById("name")
  .value
  .trim()||
  "Player"
 ).substring(0,16);

}

function showRoom(code){

 document
 .getElementById("roomBox")
 .style.display="block";

 document
 .getElementById("roomCode")
 .textContent=code;

}

function updateLobby(players){

 const box=
 document.getElementById("players");

 box.innerHTML="";

 players.forEach(p=>{

  const row=document.createElement("div");

  row.className="playerRow";

  row.textContent=
  (p.host?"👑 ":"🐍 ")+
  (p.name||"Player");

  row.style.color=
  p.color||"#fff";

  box.appendChild(row);

 });

 /*
    Old server may not send id/host.
    Host can still use start button.
 */

 if(players.length>0){

  document
  .getElementById("startBtn")
  .style.display="block";

 }

}

function updatePlayerCount(){

 document
 .getElementById("playerCount")
 .textContent=
 Math.max(
  1,
  Object.keys(others).length
 );

}

function showError(text){

 document
 .getElementById("error")
 .textContent=text||"";

}

function setConnection(text){

 document
 .getElementById("connection")
 .textContent=text;

}


/* ==============================
   CREATE
============================== */

document
.getElementById("createBtn")
.onclick=()=>{

 showError("");

 if(!connected){

  showError(
   "Serveriga ühendamine..."
  );

  return;
 }

 send({

  type:"createRoom",

  name:playerName(),

  color:me.color

 });

};


/* ==============================
   JOIN
============================== */

document
.getElementById("joinBtn")
.onclick=()=>{

 showError("");

 const code=
 document
 .getElementById("roomInput")
 .value
 .trim()
 .toUpperCase();

 if(code.length!==6){

  showError(
   "Room code peab olema 6 märki."
  );

  return;
 }

 send({

  type:"joinRoom",

  code:code,

  name:playerName(),

  color:me.color

 });

};


/* ==============================
   START
============================== */

document
.getElementById("startBtn")
.onclick=()=>{

 send({
  type:"startGame"
 });

};


/* ==============================
   KEYBOARD
============================== */

const keys={};

addEventListener("keydown",e=>{

 keys[e.key.toLowerCase()]=true;

 if(e.key==="Shift"){
  boosting=true;
 }

});

addEventListener("keyup",e=>{

 keys[e.key.toLowerCase()]=false;

 if(e.key==="Shift"){
  boosting=false;
 }

});


function keyboardDirection(){

 let dx=0;
 let dy=0;

 if(keys.w||keys.arrowup)dy=-1;
 if(keys.s||keys.arrowdown)dy=1;
 if(keys.a||keys.arrowleft)dx=-1;
 if(keys.d||keys.arrowright)dx=1;

 if(dx||dy){

  me.targetAngle=
  Math.atan2(dy,dx);

 }

}


/* ==============================
   MOUSE
============================== */

addEventListener("mousemove",e=>{

 if(!running)return;

 if(innerWidth<=800)return;

 const dx=e.clientX-W/2;
 const dy=e.clientY-H/2;

 if(Math.hypot(dx,dy)<20)return;

 me.targetAngle=
 Math.atan2(dy,dx);

});


/* ==============================
   MOBILE JOYSTICK
============================== */

const joystick=
document.getElementById("joystick");

const stick=
document.getElementById("stick");

let joyId=null;

function moveJoystick(x,y){

 const r=joystick.getBoundingClientRect();

 const cx=r.left+r.width/2;
 const cy=r.top+r.height/2;

 let dx=x-cx;
 let dy=y-cy;

 const max=55;

 const distance=Math.hypot(dx,dy);

 if(distance>max){

  dx=dx/distance*max;
  dy=dy/distance*max;

 }

 stick.style.left=
 `calc(50% + ${dx}px)`;

 stick.style.top=
 `calc(50% + ${dy}px)`;

 if(distance>7){

  me.targetAngle=
  Math.atan2(dy,dx);

 }

}

function resetJoystick(){

 joyId=null;

 stick.style.left="50%";
 stick.style.top="50%";

}

joystick.onpointerdown=e=>{

 joyId=e.pointerId;

 joystick.setPointerCapture(
  e.pointerId
 );

 moveJoystick(
  e.clientX,
  e.clientY
 );

};

joystick.onpointermove=e=>{

 if(e.pointerId!==joyId)return;

 moveJoystick(
  e.clientX,
  e.clientY
 );

};

joystick.onpointerup=resetJoystick;
joystick.onpointercancel=resetJoystick;


/* ==============================
   BOOST
============================== */

const boost=
document.getElementById("boost");

boost.onpointerdown=()=>{
 boosting=true;
};

boost.onpointerup=()=>{
 boosting=false;
};

boost.onpointercancel=()=>{
 boosting=false;
};


/* ==============================
   START GAME
============================== */

function startGame(){

 running=true;
 dead=false;

 document
 .getElementById("menu")
 .style.display="none";

 document
 .getElementById("hud")
 .style.display="flex";

 document
 .getElementById("minimap")
 .style.display="block";

 me.x=
 5000+
 Math.random()*10000;

 me.y=
 5000+
 Math.random()*10000;

 me.angle=
 Math.random()*Math.PI*2;

 me.targetAngle=me.angle;

 body=[];

 for(let i=0;i<me.length;i++){

  body.push({

   x:
   me.x-
   Math.cos(me.angle)*i*8,

   y:
   me.y-
   Math.sin(me.angle)*i*8

  });

 }

}


/* ==============================
   MOVEMENT
============================== */

let lastSend=0;

function update(){

 if(!running||dead)return;

 keyboardDirection();

 let difference=
 me.targetAngle-me.angle;

 while(difference>Math.PI)
 difference-=Math.PI*2;

 while(difference<-Math.PI)
 difference+=Math.PI*2;

 me.angle+=difference*.13;


 const speed=
 boosting
 ?8
 :4.6;


 me.x+=
 Math.cos(me.angle)*speed;

 me.y+=
 Math.sin(me.angle)*speed;


 me.x=Math.max(
 30,
 Math.min(WORLD-30,me.x)
 );

 me.y=Math.max(
 30,
 Math.min(WORLD-30,me.y)
 );


 body.unshift({
  x:me.x,
  y:me.y
 });


 while(
  body.length>
  Math.floor(me.length)
 ){

  body.pop();

 }


 while(
  body.length<
  Math.floor(me.length)
 ){

  body.push({
   x:me.x,
   y:me.y
  });

 }


 eatFood();

 attackPlayers();

 checkWorldCollision();


 if(boosting&&me.length>20){

  me.length-=.018;

 }


 const now=performance.now();

 if(now-lastSend>50){

  lastSend=now;

  send({

   type:"state",

   x:me.x,

   y:me.y,

   angle:me.angle,

   length:me.length,

   color:me.color,

   name:playerName()

  });

 }


 document
 .getElementById("score")
 .textContent=
 Math.floor(score);

 document
 .getElementById("length")
 .textContent=
 Math.floor(me.length);

}


/* ==============================
   EAT FOOD
============================== */

function eatFood(){

 for(
 let i=foods.length-1;
 i>=0;
 i--
 ){

  const food=foods[i];

  const dx=food.x-me.x;
  const dy=food.y-me.y;

  if(
   Math.hypot(dx,dy)<
   20+food.radius
  ){

   score+=food.value;

   me.length+=
   food.value*.35;

   foods[i]=makeFood();

  }

 }

}


/* ==============================
   ATTACK SYSTEM
============================== */

function attackPlayers(){

 for(const id in others){

  if(id===me.id)continue;

  const enemy=others[id];

  if(!enemy)continue;


  /*
     1. Enemy head hits MY body.
     Enemy dies.
  */

  for(let i=12;i<body.length;i++){

   const p=body[i];

   const dx=
   enemy.x-p.x;

   const dy=
   enemy.y-p.y;

   if(
    Math.hypot(dx,dy)<20
   ){

    /*
       We cannot directly remove
       the player from the server
       because the server currently
       controls rooms.

       Instead we reward the hit
       visually and increase score.
    */

    score+=50;

    showKill();

    break;

   }

  }


  /*
     2. MY head hits enemy body.
     I die.
  */

  const enemyLength=
  Math.min(
   160,
   Math.max(
    20,
    Math.floor(enemy.length||20)
   )
  );


  for(
   let i=12;
   i<enemyLength;
   i++
  ){

   const x=
   enemy.x-
   Math.cos(enemy.angle)*i*8;

   const y=
   enemy.y-
   Math.sin(enemy.angle)*i*8;

   const dx=me.x-x;
   const dy=me.y-y;

   if(
    Math.hypot(dx,dy)<20
   ){

    die(
     "Põrkasid teise Snake'i vastu!"
    );

    return;

   }

  }


  /*
     3. Head-to-head.
     Longer Snake wins.
  */

  const headDistance=
  Math.hypot(
   me.x-enemy.x,
   me.y-enemy.y
  );


  if(headDistance<34){

   if(
    me.length >
    (enemy.length||20)+2
   ){

    score+=100;

    showKill();

   }else if(
    me.length <
    (enemy.length||20)-2
   ){

    die(
     "Teine Snake oli suurem!"
    );

    return;

   }

  }

 }

}


/* ==============================
   WORLD COLLISION
============================== */

function checkWorldCollision(){

 const margin=25;

 if(
  me.x<=margin||
  me.x>=WORLD-margin||
  me.y<=margin||
  me.y>=WORLD-margin
 ){

  /*
     Don't instantly kill the player.
     Turn them around instead.
  */

  me.targetAngle+=Math.PI;

 }

}


/* ==============================
   DEATH
============================== */

function die(reason){

 if(dead)return;

 dead=true;
 running=false;

 document
 .getElementById("finalScore")
 .textContent=
 Math.floor(score);

 document
 .getElementById("gameOver")
 .style.display="flex";

}


/* ==============================
   KILL MESSAGE
============================== */

let killTimer=null;

function showKill(){

 const text=
 document.getElementById("killText");

 text.classList.add("show");

 clearTimeout(killTimer);

 killTimer=setTimeout(
  ()=>{
   text.classList.remove("show");
  },
  700
 );

}


/* ==============================
   CAMERA
============================== */

let cameraX=me.x;
let cameraY=me.y;

function updateCamera(){

 cameraX+=
 (me.x-cameraX)*.09;

 cameraY+=
 (me.y-cameraY)*.09;

}


/* ==============================
   DRAW
============================== */

function draw(){

 ctx.fillStyle="#071008";

 ctx.fillRect(
  0,
  0,
  W,
  H
 );

 if(!running)return;

 updateCamera();

 ctx.save();

 ctx.translate(
  W/2,
  H/2
 );

 ctx.translate(
  -cameraX,
  -cameraY
 );

 drawGrid();
 drawBorder();
 drawFood();
 drawOthers();
 drawMe();

 ctx.restore();

 drawMinimap();

}


/* ==============================
   GRID
============================== */

function drawGrid(){

 const grid=250;

 const left=
 cameraX-W/2-500;

 const right=
 cameraX+W/2+500;

 const top=
 cameraY-H/2-500;

 const bottom=
 cameraY+H/2+500;

 ctx.strokeStyle=
 "rgba(99,255,120,.045)";

 ctx.lineWidth=1;

 for(
  let x=Math.floor(left/grid)*grid;
  x<right;
  x+=grid
 ){

  ctx.beginPath();

  ctx.moveTo(x,top);
  ctx.lineTo(x,bottom);

  ctx.stroke();

 }

 for(
  let y=Math.floor(top/grid)*grid;
  y<bottom;
  y+=grid
 ){

  ctx.beginPath();

  ctx.moveTo(left,y);
  ctx.lineTo(right,y);

  ctx.stroke();

 }

}


/* ==============================
   BORDER
============================== */

function drawBorder(){

 ctx.strokeStyle="#63ff78";

 ctx.lineWidth=20;

 ctx.shadowColor="#63ff78";
 ctx.shadowBlur=20;

 ctx.strokeRect(
  0,
  0,
  WORLD,
  WORLD
 );

 ctx.shadowBlur=0;

}


/* ==============================
   FOOD
============================== */

function drawFood(){

 for(const food of foods){

  if(
   Math.abs(food.x-cameraX)>W||
   Math.abs(food.y-cameraY)>H
  ){
   continue;
  }

  ctx.fillStyle=food.color;

  ctx.shadowColor=food.color;
  ctx.shadowBlur=9;

  ctx.beginPath();

  ctx.arc(
   food.x,
   food.y,
   food.radius,
   0,
   Math.PI*2
  );

  ctx.fill();

 }

 ctx.shadowBlur=0;

}


/* ==============================
   SKIN DRAWING
============================== */

function skinHead(x,y,r,color,skin){

 /*
    Main entire head.
 */

 ctx.save();

 ctx.translate(x,y);

 /*
    Glow.
 */

 ctx.shadowColor=color;
 ctx.shadowBlur=20;

 /*
    Head.
 */

 ctx.fillStyle=color;

 ctx.beginPath();

 ctx.arc(
  0,
  0,
  r,
  0,
  Math.PI*2
 );

 ctx.fill();

 ctx.shadowBlur=0;


 /*
    Different patterns.
 */

 if(skin==="blue"){

  ctx.strokeStyle="#b9e7ff";
  ctx.lineWidth=4;

  ctx.beginPath();

  ctx.arc(
   0,0,r-3,
   Math.PI*.2,
   Math.PI*1.8
  );

  ctx.stroke();

 }

 if(skin==="red"){

  ctx.strokeStyle="#ffb0bb";
  ctx.lineWidth=3;

  ctx.beginPath();

  ctx.moveTo(-r*.6,-r*.5);
  ctx.lineTo(r*.6,r*.5);

  ctx.moveTo(r*.6,-r*.5);
  ctx.lineTo(-r*.6,r*.5);

  ctx.stroke();

 }

 if(skin==="yellow"){

  ctx.fillStyle="#fff4a8";

  ctx.beginPath();

  ctx.arc(
   0,
   0,
   r*.35,
   0,
   Math.PI*2
  );

  ctx.fill();

 }

 if(skin==="purple"){

  ctx.fillStyle="#e4b8ff";

  for(let i=0;i<6;i++){

   const a=i*Math.PI/3;

   ctx.beginPath();

   ctx.arc(
    Math.cos(a)*r*.55,
    Math.sin(a)*r*.55,
    4,
    0,
    Math.PI*2
   );

   ctx.fill();

  }

 }

 if(skin==="orange"){

  ctx.strokeStyle="#ffe1bd";

  ctx.lineWidth=4;

  for(let i=-1;i<=1;i++){

   ctx.beginPath();

   ctx.moveTo(
    -r*.7,
    i*r*.45
   );

   ctx.lineTo(
    r*.7,
    i*r*.45
   );

   ctx.stroke();

  }

 }

 if(skin==="white"){

  ctx.strokeStyle="#b5ffbd";

  ctx.lineWidth=3;

  ctx.stroke();

 }

 if(skin==="cyan"){

  ctx.strokeStyle="#c9fffa";

  ctx.lineWidth=4;

  ctx.beginPath();

  ctx.arc(
   0,0,r*.65,
   0,
   Math.PI*2
  );

  ctx.stroke();

 }

 ctx.restore();

}


/* ==============================
   FACE
============================== */

function drawFace(
 x,
 y,
 angle
){

 ctx.save();

 ctx.translate(x,y);
 ctx.rotate(angle);


 /*
    Eyes are attached to head.
 */

 const eyeX=8;
 const eyeY=7;

 ctx.fillStyle="white";

 ctx.beginPath();

 ctx.arc(
  eyeX,
  -eyeY,
  6,
  0,
  Math.PI*2
 );

 ctx.fill();

 ctx.beginPath();

 ctx.arc(
  eyeX,
  eyeY,
  6,
  0,
  Math.PI*2
 );

 ctx.fill();


 /*
    Pupils.
 */

 ctx.fillStyle="#111";

 ctx.beginPath();

 ctx.arc(
  eyeX+2,
  -eyeY,
  3,
  0,
  Math.PI*2
 );

 ctx.fill();

 ctx.beginPath();

 ctx.arc(
  eyeX+2,
  eyeY,
  3,
  0,
  Math.PI*2
 );

 ctx.fill();


 /*
    Mouth.
 */

 ctx.strokeStyle="#111";
 ctx.lineWidth=2;

 ctx.beginPath();

 ctx.arc(
  13,
  0,
  5,
  -0.7,
  0.7
 );

 ctx.stroke();

 ctx.restore();

}


/* ==============================
   MY SNAKE
============================== */

function drawMe(){

 if(body.length===0)return;


 /*
    Body.
 */

 for(
  let i=body.length-1;
  i>=0;
  i--
 ){

  const p=body[i];

  const progress=i/body.length;

  const radius=
  8+(1-progress)*9;

  ctx.globalAlpha=
  1-progress*.3;

  ctx.fillStyle=me.color;

  ctx.shadowColor=me.color;

  ctx.shadowBlur=i<8?14:4;

  ctx.beginPath();

  ctx.arc(
   p.x,
   p.y,
   radius,
   0,
   Math.PI*2
  );

  ctx.fill();

 }


 ctx.globalAlpha=1;
 ctx.shadowBlur=0;


 /*
    Entire head gets skin.
 */

 skinHead(
  me.x,
  me.y,
  20,
  me.color,
  me.skin
 );


 drawFace(
  me.x,
  me.y,
  me.angle
 );


 drawName(
  playerName(),
  me.x,
  me.y-31
 );

}


/* ==============================
   OTHER SNAKES
============================== */

function drawOthers(){

 const skins=[
  "green",
  "blue",
  "red",
  "yellow",
  "purple",
  "orange",
  "white",
  "cyan"
 ];


 for(const id in others){

  if(id===me.id)continue;

  const p=others[id];

  if(!p)continue;

  const length=
  Math.min(
   160,
   Math.max(
    20,
    Math.floor(p.length||20)
   )
  );


  /*
     Body.
  */

  for(
   let i=length-1;
   i>=0;
   i--
  ){

   const x=
   p.x-
   Math.cos(p.angle)*i*8;

   const y=
   p.y-
   Math.sin(p.angle)*i*8;

   const progress=i/length;

   const radius=
   8+(1-progress)*8;

   ctx.globalAlpha=
   1-progress*.3;

   ctx.fillStyle=
   p.color||"#4da6ff";

   ctx.beginPath();

   ctx.arc(
    x,
    y,
    radius,
    0,
    Math.PI*2
   );

   ctx.fill();

  }

  ctx.globalAlpha=1;


  /*
     Pick skin from player name.
  */

  let hash=0;

  const name=p.name||"Player";

  for(let i=0;i<name.length;i++){

   hash+=
   name.charCodeAt(i);

  }

  const skin=
  skins[
   Math.abs(hash)%skins.length
  ];


  /*
     Whole enemy head.
  */

  skinHead(
   p.x,
   p.y,
   20,
   p.color||"#4da6ff",
   skin
  );


  drawFace(
   p.x,
   p.y,
   p.angle
  );


  drawName(
   name,
   p.x,
   p.y-31
  );

 }

}


/* ==============================
   NAME
============================== */

function drawName(name,x,y){

 ctx.save();

 ctx.textAlign="center";

 ctx.font=
 "bold 12px Arial";

 ctx.fillStyle="white";

 ctx.shadowColor="black";
 ctx.shadowBlur=5;

 ctx.fillText(
  name,
  x,
  y
 );

 ctx.restore();

}


/* ==============================
   MINIMAP
============================== */

function drawMinimap(){

 const size=minimap.width;

 mapCtx.clearRect(
  0,
  0,
  size,
  size
 );

 mapCtx.fillStyle="#061007";

 mapCtx.fillRect(
  0,
  0,
  size,
  size
 );


 /*
    Food.
 */

 for(const food of foods){

  const x=
  food.x/WORLD*size;

  const y=
  food.y/WORLD*size;

  mapCtx.fillStyle=food.color;

  mapCtx.globalAlpha=.55;

  mapCtx.beginPath();

  mapCtx.arc(
   x,
   y,
   1.4,
   0,
   Math.PI*2
  );

  mapCtx.fill();

 }

 mapCtx.globalAlpha=1;


 /*
    Other players.
 */

 for(const id in others){

  if(id===me.id)continue;

  const p=others[id];

  const x=
  p.x/WORLD*size;

  const y=
  p.y/WORLD*size;

  mapCtx.fillStyle=
  p.color||"#ff5368";

  mapCtx.beginPath();

  mapCtx.arc(
   x,
   y,
   4,
   0,
   Math.PI*2
  );

  mapCtx.fill();

 }


 /*
    Me.
 */

 const mx=
 me.x/WORLD*size;

 const my=
 me.y/WORLD*size;

 mapCtx.fillStyle=me.color;

 mapCtx.shadowColor=me.color;
 mapCtx.shadowBlur=10;

 mapCtx.beginPath();

 mapCtx.arc(
  mx,
  my,
  6,
  0,
  Math.PI*2
 );

 mapCtx.fill();

 mapCtx.shadowBlur=0;


 mapCtx.strokeStyle="#63ff78";

 mapCtx.lineWidth=2;

 mapCtx.strokeRect(
  1,
  1,
  size-2,
  size-2
 );

}


/* ==============================
   GAME LOOP
============================== */

function loop(){

 update();

 draw();

 requestAnimationFrame(loop);

}

connect();

loop();

</script>

</body>
</html>
