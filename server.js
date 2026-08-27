<!DOCTYPE html>
<html lang="et">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Snake Arena</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:#071008;font-family:Arial;color:white}
body{touch-action:none}
canvas{position:fixed;inset:0;width:100%;height:100%}

.screen{
 position:fixed;inset:0;z-index:20;
 display:flex;align-items:center;justify-content:center;
 background:radial-gradient(circle,#174c22,#061008 65%,#020402);
 overflow:auto;padding:20px;
}
.panel{
 width:min(94vw,470px);max-height:92vh;overflow:auto;
 background:rgba(4,12,5,.97);border:1px solid #315c37;
 border-radius:25px;padding:25px;text-align:center;
 box-shadow:0 0 60px #000;
}
.logo{font-size:65px}
h1{font-size:38px;color:#63ff78}
h2{margin-bottom:15px}
input{
 width:100%;height:48px;margin:8px 0;padding:10px;
 background:#071007;border:1px solid #315c37;
 border-radius:12px;color:white;text-align:center;font-size:16px
}
button{
 border:0;border-radius:12px;padding:13px 16px;
 font-weight:bold;cursor:pointer
}
.big{width:100%;margin-top:8px}
.green{background:#63ff78;color:#031006}
.dark{background:#102014;color:white;border:1px solid #315b36}
.gold{background:#ffd84d;color:#151000}
#skins{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin:15px 0}
.skin{
 width:58px;height:58px;border-radius:50%;
 border:3px solid transparent;font-size:25px
}
.skin.selected{border-color:white;transform:scale(1.1)}
#hud{
 position:fixed;z-index:10;top:10px;left:10px;
 display:none;gap:6px
}
.stat{
 background:rgba(0,0,0,.7);border:1px solid #315c37;
 border-radius:10px;padding:7px 10px
}
.stat small{display:block;color:#8da18f;font-size:9px}
.stat b{font-size:16px}
#leaderboard{
 position:fixed;z-index:11;right:10px;top:10px;
 width:210px;background:rgba(0,0,0,.72);
 border:1px solid #315c37;border-radius:13px;
 padding:10px;display:none
}
#leaderboard h3{color:#ffd84d;margin-bottom:6px;text-align:center}
.lbrow{
 display:flex;gap:5px;padding:4px 2px;
 font-size:12px;border-bottom:1px solid rgba(255,255,255,.06)
}
.lbrow span:first-child{width:20px;color:#aaa}
.lbname{flex:1;overflow:hidden;white-space:nowrap}
#shop{
 display:none
}
.shopItem{
 display:flex;align-items:center;justify-content:space-between;
 background:#0b170d;padding:10px;border-radius:12px;margin:7px 0
}
.preview{
 width:38px;height:38px;border-radius:50%;
 display:flex;align-items:center;justify-content:center;
 font-size:20px
}
#joystick{
 position:fixed;z-index:15;left:25px;bottom:25px;
 width:145px;height:145px;border-radius:50%;
 border:2px solid rgba(99,255,120,.4);
 background:rgba(99,255,120,.08);display:none
}
#stick{
 position:absolute;left:50%;top:50%;
 width:62px;height:62px;transform:translate(-50%,-50%);
 border-radius:50%;background:#63ff78;border:3px solid white
}
#boost{
 position:fixed;z-index:15;right:25px;bottom:30px;
 width:90px;height:90px;border-radius:50%;
 background:#087bb0;color:white;border:3px solid #a5e3ff;
 font-size:28px;display:none
}
#kill{
 position:fixed;z-index:18;left:50%;top:25%;
 transform:translateX(-50%) scale(.5);
 opacity:0;color:#63ff78;font-size:38px;font-weight:bold;
 text-shadow:0 0 20px #63ff78;transition:.2s
}
#kill.show{opacity:1;transform:translateX(-50%) scale(1)}
#gameOver{
 position:fixed;inset:0;z-index:30;display:none;
 align-items:center;justify-content:center;
 background:rgba(0,0,0,.8)
}
.over{
 width:min(90vw,390px);background:#081008;
 border:1px solid #315c37;border-radius:25px;
 padding:30px;text-align:center
}
.over h2{font-size:38px;color:#ff596c}
#musicBtn{
 position:fixed;z-index:12;right:10px;bottom:10px;
 display:none;background:#102014;color:white;border:1px solid #315c37
}
@media(max-width:800px){
 #joystick,#boost{display:block}
 #leaderboard{width:185px;font-size:11px}
 #hud{transform:scale(.9);transform-origin:top left}
}
</style>
</head>
<body>

<canvas id="game"></canvas>

<div id="menu" class="screen">
<div class="panel">
<div class="logo">🐍</div>
<h1>SNAKE ARENA</h1>
<p style="color:#819482;margin:5px 0 18px">Eat • Grow • Fight</p>

<input id="name" maxlength="16" placeholder="Sinu nimi">

<button class="big green" onclick="startSingleplayer()">
🐍 SINGLEPLAYER
</button>

<button class="big dark" onclick="openShop()">
🛒 POOD
</button>

<button class="big gold" onclick="openLeaderboard()">
🏆 EDETABEL
</button>

<div style="margin-top:15px;color:#ffd84d">
💰 Coinid: <b id="coins">0</b>
</div>
</div>
</div>

<div id="shop" class="screen">
<div class="panel">
<h2>🛒 POOD</h2>
<p style="color:#ffd84d;margin-bottom:10px">💰 <span id="shopCoins">0</span> coins</p>
<div id="shopList"></div>
<button class="big dark" onclick="closeShop()">← TAGASI</button>
</div>
</div>

<div id="leaderScreen" class="screen" style="display:none">
<div class="panel">
<h2>🏆 EDETABEL</h2>
<div id="globalScores"></div>
<button class="big dark" onclick="closeLeaderboard()">← TAGASI</button>
</div>
</div>

<div id="hud">
<div class="stat"><small>SKOOR</small><b id="score">0</b></div>
<div class="stat"><small>KILLID</small><b id="kills">0</b></div>
<div class="stat"><small>PIKKUS</small><b id="length">25</b></div>
</div>

<div id="leaderboard">
<h3>🏆 TOP</h3>
<div id="lb"></div>
</div>

<div id="kill">💥 ELIMINEERITUD!</div>

<div id="joystick"><div id="stick"></div></div>
<button id="boost">⚡</button>
<button id="musicBtn" onclick="toggleMusic()">🔊</button>

<div id="gameOver">
<div class="over">
<h2>GAME OVER</h2>
<p id="deathText">Sind tapeti!</p>
<p style="margin-top:10px">Skoor: <b id="finalScore">0</b></p>
<p>Killid: <b id="finalKills">0</b></p>
<p style="margin-top:10px;color:#ffd84d">+<b id="earnedCoins">0</b> 💰</p>
<button class="big green" onclick="backMenu()">🔄 MENÜÜ</button>
</div>
</div>

<script>
const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");

let W=innerWidth,H=innerHeight;
function resize(){W=innerWidth;H=innerHeight;canvas.width=W;canvas.height=H}
addEventListener("resize",resize);resize();

const WORLD=12000;
const FOOD_COUNT=1200;

let foods=[];
let bots=[];
let running=false;
let dead=false;
let score=0;
let kills=0;
let cameraX=6000,cameraY=6000;
let boosting=false;
let targetAngle=0;
let lastTime=performance.now();

const skins=[
 {id:"green",name:"Emerald",color:"#63ff78",emoji:"🐍",price:0},
 {id:"blue",name:"Ocean",color:"#4da6ff",emoji:"😎",price:30},
 {id:"red",name:"Demon",color:"#ff5570",emoji:"😈",price:50},
 {id:"yellow",name:"Gold",color:"#ffd84d",emoji:"😄",price:80},
 {id:"purple",name:"Alien",color:"#b86cff",emoji:"👾",price:120},
 {id:"orange",name:"Fire",color:"#ff8a3d",emoji:"🔥",price:160},
 {id:"cyan",name:"Robot",color:"#00e5d4",emoji:"🤖",price:200},
 {id:"pink",name:"Pink",color:"#ff62c5",emoji:"😺",price:250}
];

let coins=Number(localStorage.getItem("snakeCoins")||0);
let owned=JSON.parse(localStorage.getItem("snakeOwned")||'["green"]');
let selected=localStorage.getItem("snakeSkin")||"green";
let highScores=JSON.parse(localStorage.getItem("snakeScores")||"[]");

function save(){
 localStorage.setItem("snakeCoins",coins);
 localStorage.setItem("snakeOwned",JSON.stringify(owned));
 localStorage.setItem("snakeSkin",selected);
 localStorage.setItem("snakeScores",JSON.stringify(highScores));
 updateCoins();
}

function updateCoins(){
 document.getElementById("coins").textContent=coins;
 document.getElementById("shopCoins").textContent=coins;
}

function getSkin(id){return skins.find(s=>s.id===id)||skins[0]}

const player={
 x:6000,y:6000,angle:0,length:25,
 color:"#63ff78",skin:"green",name:"Player",
 body:[]
};

function randomFood(){
 return {
  x:Math.random()*WORLD,
  y:Math.random()*WORLD,
  r:3+Math.random()*4,
  color:["#63ff78","#ffd84d","#ff6075","#55c9ff","#c76cff","#ff963d"][Math.floor(Math.random()*6)],
  value:1+Math.floor(Math.random()*4)
 };
}

function fillFood(){
 foods=[];
 for(let i=0;i<FOOD_COUNT;i++)foods.push(randomFood());
}

function makeBot(i){
 let s=skins[(i+1)%skins.length];
 let x=500+Math.random()*(WORLD-1000);
 let y=500+Math.random()*(WORLD-1000);
 let a=Math.random()*Math.PI*2;
 let len=20+Math.random()*45;

 let b={
  id:"bot"+i,
  x,y,angle:a,target:a,length:len,
  color:s.color,skin:s.id,
  name:["Turbo","Cobra","Shadow","Ninja","Pixel","Fire","Ghost","King","Rex","Snake"][i%10],
  body:[],
  alive:true,
  think:0
 };

 for(let j=0;j<len;j++){
  b.body.push({x:x-Math.cos(a)*j*8,y:y-Math.sin(a)*j*8});
 }
 return b;
}

function startSingleplayer(){
 let n=document.getElementById("name").value.trim();
 player.name=n||"Player";
 let s=getSkin(selected);
 player.color=s.color;
 player.skin=s.id;

 score=0;kills=0;dead=false;running=true;
 player.length=25;
 player.x=6000;player.y=6000;
 player.angle=Math.random()*Math.PI*2;
 targetAngle=player.angle;
 player.body=[];

 for(let i=0;i<25;i++){
  player.body.push({
   x:player.x-Math.cos(player.angle)*i*8,
   y:player.y-Math.sin(player.angle)*i*8
  });
 }

 fillFood();
 bots=[];
 for(let i=0;i<14;i++)bots.push(makeBot(i));

 document.getElementById("menu").style.display="none";
 document.getElementById("shop").style.display="none";
 document.getElementById("leaderScreen").style.display="none";
 document.getElementById("hud").style.display="flex";
 document.getElementById("leaderboard").style.display="block";
 document.getElementById("musicBtn").style.display="block";

 startMusic();
 updateHUD();
}

function updateHUD(){
 document.getElementById("score").textContent=Math.floor(score);
 document.getElementById("kills").textContent=kills;
 document.getElementById("length").textContent=Math.floor(player.length);
}

function openShop(){
 document.getElementById("menu").style.display="none";
 document.getElementById("shop").style.display="flex";
 renderShop();
}

function closeShop(){
 document.getElementById("shop").style.display="none";
 document.getElementById("menu").style.display="flex";
 updateCoins();
}

function renderShop(){
 const box=document.getElementById("shopList");
 box.innerHTML="";
 skins.forEach(s=>{
  let ownedSkin=owned.includes(s.id);
  let div=document.createElement("div");
  div.className="shopItem";
  div.innerHTML=`
   <div style="display:flex;align-items:center;gap:10px">
    <div class="preview" style="background:${s.color}">${s.emoji}</div>
    <div style="text-align:left"><b>${s.name}</b><br>
    <small>${ownedSkin?"OMANIK":s.price+" 💰"}</small></div>
   </div>
   <button class="${selected===s.id?"green":"dark"}">
   ${selected===s.id?"VALITUD":ownedSkin?"VALI":"OSTA"}
   </button>`;
  div.querySelector("button").onclick=()=>{
   if(owned.includes(s.id)){
    selected=s.id;save();renderShop();
   }else if(coins>=s.price){
    coins-=s.price;owned.push(s.id);selected=s.id;
    save();renderShop();
   }else{
    alert("Sul pole piisavalt coine!");
   }
  };
  box.appendChild(div);
 });
}

function openLeaderboard(){
 document.getElementById("menu").style.display="none";
 document.getElementById("leaderScreen").style.display="flex";
 renderScores();
}

function closeLeaderboard(){
 document.getElementById("leaderScreen").style.display="none";
 document.getElementById("menu").style.display="flex";
}

function renderScores(){
 let box=document.getElementById("globalScores");
 if(!highScores.length){
  box.innerHTML="<p style='color:#819482'>Veel tulemusi pole.</p>";
  return;
 }
 let sorted=[...highScores].sort((a,b)=>b.score-a.score).slice(0,10);
 box.innerHTML=sorted.map((x,i)=>`
 <div class="lbrow" style="padding:9px">
 <span>${i+1}.</span>
 <span class="lbname">${escapeHtml(x.name)}</span>
 <span>${x.score} ⭐</span>
 <span>${x.kills} 💀</span>
 </div>`).join("");
}

function escapeHtml(s){
 return String(s).replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
 }[c]));
}

const keys={};
addEventListener("keydown",e=>{
 keys[e.key.toLowerCase()]=true;
 if(e.key==="Shift")boosting=true;
});
addEventListener("keyup",e=>{
 keys[e.key.toLowerCase()]=false;
 if(e.key==="Shift")boosting=false;
});

addEventListener("mousemove",e=>{
 if(!running||innerWidth<=800)return;
 let dx=e.clientX-W/2;
 let dy=e.clientY-H/2;
 if(Math.hypot(dx,dy)>12)targetAngle=Math.atan2(dy,dx);
});

function keyboard(){
 let dx=0,dy=0;
 if(keys.w||keys.arrowup)dy--;
 if(keys.s||keys.arrowdown)dy++;
 if(keys.a||keys.arrowleft)dx--;
 if(keys.d||keys.arrowright)dx++;
 if(dx||dy)targetAngle=Math.atan2(dy,dx);
}

const joystick=document.getElementById("joystick");
const stick=document.getElementById("stick");
let joyId=null;

function joystickMove(x,y){
 let r=joystick.getBoundingClientRect();
 let dx=x-(r.left+r.width/2);
 let dy=y-(r.top+r.height/2);
 let d=Math.hypot(dx,dy),max=55;
 if(d>max){dx=dx/d*max;dy=dy/d*max}
 stick.style.left=`calc(50% + ${dx}px)`;
 stick.style.top=`calc(50% + ${dy}px)`;
 if(d>7)targetAngle=Math.atan2(dy,dx);
}
joystick.onpointerdown=e=>{
 joyId=e.pointerId;
 joystick.setPointerCapture(e.pointerId);
 joystickMove(e.clientX,e.clientY);
};
joystick.onpointermove=e=>{
 if(e.pointerId===joyId)joystickMove(e.clientX,e.clientY);
};
function resetJoy(){
 joyId=null;stick.style.left="50%";stick.style.top="50%";
}
joystick.onpointerup=resetJoy;
joystick.onpointercancel=resetJoy;

const boostBtn=document.getElementById("boost");
boostBtn.onpointerdown=()=>boosting=true;
boostBtn.onpointerup=()=>boosting=false;
boostBtn.onpointercancel=()=>boosting=false;

function movePlayer(dt){
 keyboard();

 let diff=targetAngle-player.angle;
 while(diff>Math.PI)diff-=Math.PI*2;
 while(diff<-Math.PI)diff+=Math.PI*2;
 player.angle+=diff*.16;

 let speed=boosting&&player.length>27?7.5:4.8;

 player.x+=Math.cos(player.angle)*speed*dt*60/60;
 player.y+=Math.sin(player.angle)*speed*dt*60/60;

 player.x=Math.max(25,Math.min(WORLD-25,player.x));
 player.y=Math.max(25,Math.min(WORLD-25,player.y));

 player.body.unshift({x:player.x,y:player.y});
 while(player.body.length>Math.floor(player.length))player.body.pop();

 if(boosting&&player.length>27){
  player.length-=.025;
  if(Math.random()<.12){
   foods.push({
    x:player.body[Math.min(5,player.body.length-1)].x,
    y:player.body[Math.min(5,player.body.length-1)].y,
    r:5,color:player.color,value:2
   });
  }
 }

 eatFood(player);
}

function moveBot(b){
 if(!b.alive)return;

 b.think--;
 if(b.think<=0){
  b.think=30+Math.random()*80;

  let dx=player.x-b.x,dy=player.y-b.y;
  let d=Math.hypot(dx,dy);

  if(d<900 && Math.random()<.65){
   b.target=Math.atan2(dy,dx);
  }else{
   b.target+=(-.8+Math.random()*1.6);
  }
 }

 let diff=b.target-b.angle;
 while(diff>Math.PI)diff-=Math.PI*2;
 while(diff<-Math.PI)diff+=Math.PI*2;
 b.angle+=diff*.04;

 let speed=3.5;
 b.x+=Math.cos(b.angle)*speed;
 b.y+=Math.sin(b.angle)*speed;

 if(b.x<100||b.x>WORLD-100)b.target=Math.PI-b.angle;
 if(b.y<100||b.y>WORLD-100)b.target=-b.angle;

 b.x=Math.max(30,Math.min(WORLD-30,b.x));
 b.y=Math.max(30,Math.min(WORLD-30,b.y));

 b.body.unshift({x:b.x,y:b.y});
 while(b.body.length>Math.floor(b.length))b.body.pop();

 eatFood(b);

 if(Math.hypot(b.x-player.x,b.y-player.y)<35){
  killBot(b);
 }
}

function eatFood(snake){
 for(let i=foods.length-1;i>=0;i--){
  let f=foods[i];
  if(Math.hypot(f.x-snake.x,f.y-snake.y)<24+f.r){
   if(snake===player){
    score+=f.value;
    player.length+=f.value*.55;
   }else{
    snake.length+=f.value*.4;
   }
   foods[i]=randomFood();
  }
 }
}

function checkCombat(){
 if(!running)return;

 for(const b of bots){
  if(!b.alive)continue;

  /* BOT HEAD INTO PLAYER BODY */
  for(let i=8;i<player.body.length;i++){
   let p=player.body[i];
   if(Math.hypot(b.x-p.x,b.y-p.y)<17){
    killBot(b);
    break;
   }
  }

  if(!b.alive)continue;

  /* PLAYER HEAD INTO BOT BODY */
  for(let i=7;i<b.body.length;i++){
   let p=b.body[i];
   if(Math.hypot(player.x-p.x,player.y-p.y)<19){
    die("Sõitsid vastase kehasse!");
    return;
   }
  }

  /* HEAD TO HEAD */
  if(Math.hypot(player.x-b.x,player.y-b.y)<22){
   if(player.length>=b.length)killBot(b);
   else{
    die("Vastane oli suurem!");
    return;
   }
  }
 }
}

function killBot(b){
 if(!b.alive)return;
 b.alive=false;
 kills++;
 let reward=10;
 coins+=reward;
 score+=Math.floor(b.length*2);

 for(let i=0;i<b.body.length;i+=3){
  foods.push({
   x:b.body[i].x,y:b.body[i].y,
   r:5,color:b.color,value:3
  });
 }

 showKill();
 setTimeout(()=>{
  let index=bots.indexOf(b);
  if(index>=0)bots[index]=makeBot(Math.floor(Math.random()*1000));
 },1200);
 save();
}

function showKill(){
 let k=document.getElementById("kill");
 k.classList.add("show");
 setTimeout(()=>k.classList.remove("show"),700);
}

function die(reason){
 if(dead)return;
 dead=true;running=false;

 coins+=kills*10;

 highScores.push({
  name:player.name,
  score:Math.floor(score),
  kills
 });
 highScores.sort((a,b)=>b.score-a.score);
 highScores=highScores.slice(0,20);
 save();

 document.getElementById("deathText").textContent=reason;
 document.getElementById("finalScore").textContent=Math.floor(score);
 document.getElementById("finalKills").textContent=kills;
 document.getElementById("earnedCoins").textContent=kills*10;
 document.getElementById("gameOver").style.display="flex";
}

function backMenu(){
 document.getElementById("gameOver").style.display="none";
 document.getElementById("hud").style.display="none";
 document.getElementById("leaderboard").style.display="none";
 document.getElementById("musicBtn").style.display="none";
 document.getElementById("menu").style.display="flex";
 updateCoins();
}

function drawBackground(){
 ctx.fillStyle="#071008";
 ctx.fillRect(0,0,W,H);
}

function drawGrid(){
 let grid=180;
 let left=cameraX-W/2-300;
 let right=cameraX+W/2+300;
 let top=cameraY-H/2-300;
 let bottom=cameraY+H/2+300;

 ctx.strokeStyle="rgba(99,255,120,.055)";
 ctx.lineWidth=1;

 for(let x=Math.floor(left/grid)*grid;x<right;x+=grid){
  ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
 }
 for(let y=Math.floor(top/grid)*grid;y<bottom;y+=grid){
  ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
 }
}

function drawWorldBorder(){
 ctx.strokeStyle="#63ff78";
 ctx.lineWidth=18;
 ctx.shadowColor="#63ff78";
 ctx.shadowBlur=20;
 ctx.strokeRect(0,0,WORLD,WORLD);
 ctx.shadowBlur=0;
}

function drawFoods(){
 for(const f of foods){
  if(Math.abs(f.x-cameraX)>W||Math.abs(f.y-cameraY)>H)continue;
  ctx.fillStyle=f.color;
  ctx.shadowColor=f.color;
  ctx.shadowBlur=9;
  ctx.beginPath();
  ctx.arc(f.x,f.y,f.r,0,Math.PI*2);
  ctx.fill();
 }
 ctx.shadowBlur=0;
}

function drawSnake(snake,isPlayer=false){
 if(!snake.body.length)return;

 let body=snake.body;
 for(let i=body.length-1;i>=0;i--){
  let p=body[i];
  let progress=i/body.length;
  let r=8+(1-progress)*9;

  ctx.globalAlpha=1-progress*.25;
  ctx.fillStyle=snake.color;
  ctx.shadowColor=snake.color;
  ctx.shadowBlur=i<8?10:3;

  ctx.beginPath();
  ctx.arc(p.x,p.y,r,0,Math.PI*2);
  ctx.fill();
 }

 ctx.globalAlpha=1;
 ctx.shadowBlur=0;

 drawHead(snake.x,snake.y,21,snake.color,snake.skin,snake.angle);
 drawName(snake.name,snake.x,snake.y-31);
}

function drawHead(x,y,r,color,skin,angle){
 ctx.save();
 ctx.translate(x,y);
 ctx.rotate(angle);

 ctx.fillStyle=color;
 ctx.shadowColor=color;
 ctx.shadowBlur=18;
 ctx.beginPath();
 ctx.arc(0,0,r,0,Math.PI*2);
 ctx.fill();
 ctx.shadowBlur=0;

 /* väike nahamuster kogu pea peal */
 if(skin==="red"){
  ctx.strokeStyle="#ffd0d7";ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(-12,-10);ctx.lineTo(12,10);
  ctx.moveTo(12,-10);ctx.lineTo(-12,10);ctx.stroke();
 }
 if(skin==="blue"){
  ctx.strokeStyle="#d9f5ff";ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.stroke();
 }
 if(skin==="yellow"){
  ctx.fillStyle="#fff3a0";
  for(let i=0;i<6;i++){
   let a=i*Math.PI/3;
   ctx.beginPath();ctx.arc(Math.cos(a)*11,Math.sin(a)*11,3,0,Math.PI*2);ctx.fill();
  }
 }
 if(skin==="purple"){
  ctx.fillStyle="#f0c9ff";
  ctx.beginPath();ctx.arc(-8,-8,4,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(8,8,4,0,Math.PI*2);ctx.fill();
 }
 if(skin==="orange"){
  ctx.strokeStyle="#ffe2c5";ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(-13,-6);ctx.lineTo(13,-6);ctx.moveTo(-13,6);ctx.lineTo(13,6);ctx.stroke();
 }
 if(skin==="cyan"){
  ctx.strokeStyle="#d5fffb";ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.stroke();
 }
 if(skin==="pink"){
  ctx.fillStyle="#fff";
  ctx.beginPath();ctx.arc(-8,-11,3,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(8,11,3,0,Math.PI*2);ctx.fill();
 }

 /* silmad */
 ctx.fillStyle="white";
 ctx.beginPath();ctx.arc(9,-7,6,0,Math.PI*2);ctx.fill();
 ctx.beginPath();ctx.arc(9,7,6,0,Math.PI*2);ctx.fill();

 ctx.fillStyle="#111";
 ctx.beginPath();ctx.arc(11,-7,3,0,Math.PI*2);ctx.fill();
 ctx.beginPath();ctx.arc(11,7,3,0,Math.PI*2);ctx.fill();

 ctx.strokeStyle="#111";ctx.lineWidth=2;
 ctx.beginPath();ctx.arc(14,0,5,-.7,.7);ctx.stroke();

 ctx.restore();
}

function drawName(name,x,y){
 ctx.save();
 ctx.textAlign="center";
 ctx.font="bold 12px Arial";
 ctx.fillStyle="white";
 ctx.shadowColor="#000";
 ctx.shadowBlur=5;
 ctx.fillText(name,x,y);
 ctx.restore();
}

function drawLeaderboard(){
 let list=[{
  name:player.name,
  score:Math.floor(score),
  kills,
  length:Math.floor(player.length),
  me:true
 }];

 bots.forEach(b=>{
  if(b.alive)list.push({
   name:b.name,score:Math.floor(b.length*8),
   kills:0,length:Math.floor(b.length)
  });
 });

 list.sort((a,b)=>b.length-a.length);
 list=list.slice(0,8);

 document.getElementById("lb").innerHTML=list.map((p,i)=>`
 <div class="lbrow" ${p.me?'style="color:#63ff78"':''}>
 <span>${i+1}</span>
 <span class="lbname">${escapeHtml(p.name)}</span>
 <span>${p.score}</span>
 <span>💀${p.kills}</span>
 </div>`).join("");
}

function draw(){
 drawBackground();
 if(!running)return;

 cameraX+=(player.x-cameraX)*.1;
 cameraY+=(player.y-cameraY)*.1;

 ctx.save();
 ctx.translate(W/2-cameraX,H/2-cameraY);

 drawGrid();
 drawWorldBorder();
 drawFoods();

 bots.forEach(b=>{
  if(b.alive)drawSnake(b);
 });

 drawSnake(player,true);
 ctx.restore();

 drawLeaderboard();
}

let audio=null;
let musicOn=false;

function startMusic(){
 if(musicOn)return;
 try{
  audio=new (window.AudioContext||window.webkitAudioContext)();
  musicOn=true;
 }catch(e){}
}

function toggleMusic(){
 if(!audio){
  startMusic();
  document.getElementById("musicBtn").textContent="🔊";
  return;
 }
 if(audio.state==="running"){
  audio.suspend();
  document.getElementById("musicBtn").textContent="🔇";
 }else{
  audio.resume();
  document.getElementById("musicBtn").textContent="🔊";
 }
}

function loop(now){
 let dt=Math.min(.033,(now-lastTime)/1000);
 lastTime=now;

 if(running&&!dead){
  movePlayer(dt);
  bots.forEach(moveBot);
  checkCombat();
  updateHUD();
 }
 draw();
 requestAnimationFrame(loop);
}

updateCoins();
requestAnimationFrame(loop);
</script>
</body>
</html>
