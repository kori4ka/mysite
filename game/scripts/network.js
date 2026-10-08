function firebaseConfig(){try{return JSON.parse(localStorage.getItem('ashspire-firebase')||'null')}catch(e){return null}}
// ── Ленивая загрузка Firebase SDK: соло-игра не качает 2 скрипта с CDN ──
const FB_SDK=['https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.5/firebase-database-compat.js'];
let _fbLoading=null;
function loadFirebaseSDK(){if(window.firebase&&window.firebase.database)return Promise.resolve();
if(_fbLoading)return _fbLoading;
_fbLoading=Promise.all(FB_SDK.map(u=>new Promise((res,rej)=>{let s=document.createElement('script');s.src=u;s.onload=res;s.onerror=()=>{rej(Error('не удалось загрузить '+u))};document.head.append(s)}))).catch(e=>{_fbLoading=null;throw e});
return _fbLoading}
function bootFirebase(cfg,next){loadFirebaseSDK().then(()=>{initFirebase(cfg);next&&next()}).catch(e=>toast('Firebase SDK не загрузился: '+e.message))}
function ensureFirebase(next){let cfg=firebaseConfig();if(cfg){bootFirebase(cfg,next);return}
openModal(`<div class="eyebrow">Однократная настройка сети</div><h2>Подключите Firebase</h2><p class="modal-sub">Создайте бесплатный проект Firebase → Realtime Database → режим Test. В настройках проекта скопируйте конфигурацию веб-приложения и вставьте JSON ниже. Ключи Firebase для веб-приложения не являются секретом.</p><textarea id="firebaseCfg" class="config-box" placeholder='{"apiKey":"…","authDomain":"…","databaseURL":"https://….firebasedatabase.app","projectId":"…","appId":"…"}'></textarea><div class="modal-actions"><button class="btn primary" onclick="saveFirebaseSetup()">Сохранить и продолжить</button><button class="btn" onclick="closeModal()">Отмена</button></div><p class="small">Для прототипа правила базы: { "rules": { ".read": true, ".write": true } }. Для публикации настройте авторизацию.</p>`);window._firebaseNext=next}
function initFirebase(cfg){if(!window.firebase)throw Error('Firebase SDK не загрузился');try{window._ashApp=firebase.app('ashspire')}catch(e){window._ashApp=firebase.initializeApp(cfg,'ashspire')}window._ashDb=window._ashApp.database()}
function saveFirebaseSetup(){try{let cfg=JSON.parse($('#firebaseCfg').value);if(!cfg.databaseURL)throw Error('Нет databaseURL');localStorage.setItem('ashspire-firebase',JSON.stringify(cfg));closeModal();let f=window._firebaseNext;window._firebaseNext=null;bootFirebase(cfg,()=>{f&&f()})}catch(e){toast('Ошибка конфигурации: '+e.message)}}
// ── Санитизация удалённого состояния: неизвестные id карт, нечисловые поля, длина имени ──
function sanitizeState(g,b){
try{
if(!g||!g.mode||!Array.isArray(g.heroes)||!g.heroes.length)return null;
g.heroes=g.heroes.map(h=>{
if(!h||typeof h!=='object')return hero('Роуэн',1);
['deck','draw','discard','exhaust','hand'].forEach(k=>{h[k]=Array.isArray(h[k])?h[k].filter(id=>typeof id==='string'&&!!CARD_DB[id.replace(/\+$/,'')]):[]});
['hp','maxHp','block','energy','strength','minions','minionPower','thorns'].forEach(k=>h[k]=Math.max(0,Math.min(999,Math.round(+h[k]||0))));
h.kind=[1,2,3].includes(+h.kind)?+h.kind:1;h.name=String(h.name).slice(0,24);h.position=h.position==='back'?'back':'front';
return h});
if(b&&b.enemy){['hp','maxHp','block','bleed','poison','vuln','weak','doom'].forEach(k=>b.enemy[k]=Math.max(0,Math.min(99999,Math.round(+b.enemy[k]||0))));b.log=(Array.isArray(b.log)?b.log:[]).slice(-40)}
g.gold=Math.max(0,Math.min(99999,Math.round(+g.gold||0)));g.resonance=Math.max(0,Math.min(10,Math.round(+g.resonance||0)));
return{G:g,B:b&&b.enemy?b:null}}catch(e){return null}}
// ── Уборка заброшенных комнат (старше 24 ч, без гостя онлайн) ──
function sweepStaleRooms(){try{let rooms=window._ashDb.ref('ashspire_rooms');rooms.once('value').then(s=>{let now=Date.now(),val=s.val()||{};Object.keys(val).slice(0,80).forEach(code=>{let m=val[code]&&val[code].meta||{},t=+m.created||0;if(t&&now-t>864e5&&!m.guestOnline)rooms.child(code).remove().catch(()=>{})})}).catch(()=>{})}catch(e){}}
function createOnlineRoom(){ensureFirebase(()=>{sweepStaleRooms();
(function tryCode(attempt){
if(attempt>4){toast('Не удалось подобрать код комнаты');return}
let code=Math.random().toString(36).slice(2,7).toUpperCase(),ref=window._ashDb.ref('ashspire_rooms/'+code);
ref.once('value').then(s=>{
if(s.exists()){tryCode(attempt+1);return}
NET.active=true;NET.role='host';NET.room=code;NET.ref=ref;NET.lastApplied=0;NET.sawState=false;NET.lastAct='';
ref.child('meta').set({created:firebase.database.ServerValue.TIMESTAMP,guest:false});
ref.child('meta').onDisconnect().remove();
newRun();watchRoom();
openModal(`<div style="text-align:center"><div class="eyebrow">Сетевая комната</div><h2>Позовите напарника</h2><p class="modal-sub">Передайте этот код второму игроку. Окно закроется, когда он войдёт.</p><div class="room-code">${code}</div><button class="btn" onclick="navigator.clipboard&&navigator.clipboard.writeText('${code}');toast('Код скопирован')">Скопировать код</button><p class="small" style="margin-top:16px">Ожидаем Игрока 2…</p></div>`);
updateNetBadge()}).catch(e=>toast('Не удалось создать комнату: '+e.message))})(0)})}
function joinOnlineRoom(){ensureFirebase(()=>openModal(`<div class="eyebrow">Подключение</div><h2>Войти в комнату</h2><p class="modal-sub">Введите пятизначный код, который показан у Игрока 1.</p><input id="roomInput" class="join-input" maxlength="5" placeholder="ABCDE"><div class="modal-actions"><button class="btn primary" onclick="connectRoom()">Подключиться</button><button class="btn" onclick="closeModal()">Отмена</button></div>`))}
function connectRoom(){let code=$('#roomInput').value.trim().toUpperCase();if(!/^[A-Z0-9]{5}$/.test(code)){toast('Нужен код из 5 символов (латиница и цифры)');return}let ref=window._ashDb.ref('ashspire_rooms/'+code);ref.once('value').then(s=>{if(!s.exists()){toast('Комната не найдена');return}NET.active=true;NET.role='guest';NET.room=code;NET.ref=ref;NET.lastApplied=0;NET.sawState=false;NET.lastAct='';ref.child('meta/guest').set(true);ref.child('meta/guestOnline').onDisconnect().set(false);ref.child('meta/guestOnline').set(true);watchRoom();closeModal();updateNetBadge()}).catch(e=>toast('Не удалось подключиться: '+e.message))}
function watchRoom(){NET.ref.child('state').on('value',snap=>{let v=snap.val();
if(v&&v.sender===NET.id)return;
if(!v){if(NET.sawState&&NET.role==='guest'){toast('Хост закрыл комнату');leaveToMenu()}return}
if(v.updated&&NET.lastApplied&&v.updated<NET.lastApplied)return;
if(v.updated)NET.lastApplied=v.updated;
if(v.lastAct&&v.lastAct>(NET.lastAct||''))NET.lastAct=v.lastAct;
let s=sanitizeState(v.G,v.B);if(!s)return;
NET.sawState=true;NET.applying=true;G=s.G;B=s.B;NET.phase=v.phase||'map';
if(NET.phase==='battle'&&B){hideAll();$('#battle').classList.remove('hidden');renderBattle()}else showMap();
NET.applying=false;updateNetBadge()});
NET.ref.child('meta/guest').on('value',s=>{if(NET.role==='host'&&s.val()){closeModal();toast('Игрок 2 подключился');updateNetBadge()}});
if(NET.role==='host')NET.ref.child('meta/guestOnline').on('value',s=>{if(s.val()===false&&NET.sawState)toast('Напарник отключился')});
NET.ref.child('actions').on('child_added',snap=>{let v=snap.val();if(!v||v.by===NET.id)return;let key=snap.key||'';if(NET.lastAct&&key<=NET.lastAct)return;applyRemoteAction(v.f,v.a)})}
// ── Протокол действий: клиенты обмениваются командами; полное состояние — канал ремонта ──
const ACTION_FNS=['chooseNode','playCard','endPlayerTurn','teamMove','takeReward','restHeal','upgradeRandom','gainRespec','applyUpgrade','buyRelic','eventLeave','applyTrim','tombTake','shopEvent','buyShopCard','payShop','healAtShop','unlockSkill','refundLastSkill'];
function installActionWrappers(){ACTION_FNS.forEach(name=>{let orig=window[name];if(typeof orig!=='function')return;window[name]=function(...args){if(NET.active&&!NET.applying&&!NET.applyingAction)pushAction(name,args);return orig.apply(this,args)}})}
function pushAction(f,a){if(!NET.ref)return;let safe=(a||[]).map(x=>typeof x==='object'?'':x);let r=NET.ref.child('actions').push({by:NET.id,f,a:safe});if(r&&r.key&&r.key>(NET.lastAct||''))NET.lastAct=r.key}
function applyRemoteAction(f,a){if(!ACTION_FNS.includes(f))return;let fn=window[f];if(typeof fn!=='function')return;NET.applyingAction=true;try{fn.apply(null,(a||[]).map(x=>x===undefined?null:x))}catch(e){console.warn('действие не применилось:',f,e)}NET.applyingAction=false}
installActionWrappers();
let _netTimer=null;
function netSync(){if(!NET.active||!NET.ref||NET.applying||!G)return;if(_netTimer)return;_netTimer=setTimeout(doNetSync,200)}
function doNetSync(){_netTimer=null;if(!NET.active||!NET.ref||NET.applying||!G)return;let phase=!$('#battle').classList.contains('hidden')?'battle':'map';NET.phase=phase;NET.ref.child('state').set({G,B:B||null,phase,sender:NET.id,updated:firebase.database.ServerValue.TIMESTAMP,lastAct:NET.lastAct||''})}
function updateNetBadge(){let b=$('#netBadge');if(NET.active){b.classList.add('online');b.querySelector('span').textContent=`${NET.room} · Игрок ${NET.role==='host'?1:2}`}else{b.classList.remove('online');b.querySelector('span').textContent='не в сети'}}
