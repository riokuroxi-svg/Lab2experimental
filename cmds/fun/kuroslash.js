import { generateWAMessageFromContent } from "baileys";

export const command = {
  name: "kuroslash",
  aliases: ["ks", "kuro"],
  category: "fun",
  description: "Juega Kuro Slash nativo en tu celular 🌑",
  run: async (ctx) => {
    const { sock, msg } = ctx;
    const jid = msg.key.remoteJid;

    // Payload de GenAI / HTML renderizado por el usuario original
    const messageContent = {
      senderKeyDistributionMessage: {
        groupId: "120363411834515372@g.us",
        axolotlSenderKeyDistributionMessage: "MwidoZf1BxAAGiATOcZBc6abP9Ciw5aq4yd9nzp/Btcjf0dNT0nvuD9TDiIhBXdteTO+zFprOiGJZmQkVPItyxuO7YkG7Qbg/G65IOAA"
      },
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
          messageDisclaimerText: "",
          botResponseId: "1fddbd07-5465-4bc8-8d75-7442e8ac15c2",
          verificationMetadata: {
            proofs: [
              {
                version: 1,
                useCase: 1,
                signature: "U0hBTktTLk1lc3NhZ2VCdWlsZGVyVjQuNy1WZXJpZmljYXRpb25TaWduYXR1cmUuTWV0YWRhdGHsL0Ccm0ELINFZ2IaBhKaeWnVuh0o6nZLCioCn9xpSADzw==",
                certificateChain: [
                  "U0hBTktTLk1lc3NhZ2VCdWlsZGVyVjQuNy1DZXJ0aWZpY2F0ZUNoYWluLk1ldGFkYXRh=="
                ]
              }
            ]
          }
        }
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [
              {
                messageType: 2,
                messageText: "🌑 KURO SLASH v3"
              }
            ],
            unifiedResponse: {
              data: Buffer.from(JSON.stringify({
                "__typename": "GenAIUnifiedResponse",
                "response_id": "b20b66d0-3732-4e7c-bbde-83ab300907bd",
                "sections": [
                  {
                    "__typename": "GenAIUnifiedResponseSection",
                    "view_model": {
                      "__typename": "GenAISingleLayoutViewModel",
                      "primitive": {
                        "__typename": "GenAIaeacdsnwHtmlPrimitive",
                        "payload": "<style>\n*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}\nhtml,body{width:100%}\nbody{background:linear-gradient(165deg,#070810,#0d101a 60%,#070810);padding:8px;color:#c8cede;overflow-y:auto}\n#app{max-width:420px;margin:0 auto}\n.hdr{display:flex;justify-content:space-between;align-items:center;padding:2px 2px 7px;gap:8px}\n.tt{font:900 19px 'Arial Black';color:#eef1f8;text-shadow:0 0 10px #c1121f88,0 2px #000;letter-spacing:2px}\n.tt small{display:block;font:700 6.5px Arial;letter-spacing:3px;color:#8a92a6;text-shadow:none}\n.hrs{display:flex;gap:6px;align-items:center}\n.hr{background:rgba(0,0,0,.5);border:1px solid rgba(193,18,31,.35);border-radius:9px;padding:3px 9px;text-align:center;min-width:54px}\n.hr i{display:block;font:700 7px Arial;font-style:normal;letter-spacing:1px;color:#8a92a6}\n.hr b{font:900 13px 'Arial Black';color:#eef1f8;font-variant-numeric:tabular-nums}\n.mbtn{width:34px;height:34px;border:2px solid rgba(193,18,31,.35);border-radius:9px;background:rgba(0,0,0,.5);color:#eef1f8;font-size:15px;cursor:pointer;touch-action:none}\n.mbtn:active{filter:brightness(1.6)}\n.gw{position:relative;border:2px solid rgba(193,18,31,.4);border-radius:14px;overflow:hidden;background:#020308;box-shadow:0 0 18px rgba(193,18,31,.15)}\ncanvas{width:100%;display:block;touch-action:none}\n.pads{display:grid;grid-template-columns:1fr 1.6fr 1fr;gap:8px;margin-top:8px}\n.pd{height:52px;border:2px solid rgba(255,255,255,.16);border-radius:14px;font:900 13px 'Arial Black';color:#fff;cursor:pointer;touch-action:none;box-shadow:0 4px 0 rgba(0,0,0,.6);background:linear-gradient(#2a3145,#171c2a 60%,#0c0f18)}\n.pd:active{transform:translateY(3px);box-shadow:none;filter:brightness(1.5)}\n#atkB{background:linear-gradient(#8f1622,#4a0a12 60%,#280509);color:#ffe9e9;text-shadow:0 1px #000}\n.ub{margin-top:8px;width:100%;height:40px;border:2px solid rgba(193,18,31,.5);border-radius:12px;font:900 13px 'Arial Black';color:#6a1520;background:#0c0f18;cursor:pointer;touch-action:none;letter-spacing:2px}\n.ub.rdy{color:#fff;background:linear-gradient(90deg,#c1121f,#ff3040);box-shadow:0 0 14px #c1121f99;animation:up 1s infinite}\n.ub:active{transform:translateY(2px)}\n@keyframes up{50%{filter:brightness(1.4)}}\n.hint{text-align:center;font:600 9px Arial;color:#8a92a6;margin-top:6px}\n</style>\n<div id=\"app\">\n<div class=\"hdr\"><div class=\"tt\">KURO SLASH<small>SHANKS CODE · ROBOT ROAD</small></div><div class=\"hrs\"><div class=\"hr\"><i>SCORE</i><b id=\"sc\">0</b></div><div class=\"hr\"><i>BEST</i><b id=\"bs\">0</b></div><button class=\"mbtn\" id=\"muteB\">🔊</button></div></div>\n<div class=\"gw\"><canvas id=\"cv\" width=\"404\" height=\"380\"></canvas></div>\n<div class=\"pads\"><button class=\"pd\" id=\"leftB\">◀</button><button class=\"pd\" id=\"atkB\">⚔ TEBAS</button><button class=\"pd\" id=\"rightB\">▶</button></div>\n<button class=\"ub\" id=\"ultB\">🌊 ULTI — 0%</button>\n<div class=\"hint\">⚔ tebas + gelombang · tebas pas peluru merah = PARRY · kill = heal +5 HP</div>\n</div>\n<script>\nwindow.onerror=function(m,s,l){var e=document.getElementById('hint');if(e){e.textContent='⚠ '+m+' @'+l;e.style.color='#ff7a8a'}};\n(function(){\nvar cv=document.getElementById('cv'),x=cv.getContext('2d'),W=404,H=380;\nvar DPR=2;cv.width=W*DPR;cv.height=H*DPR;\nvar scEl=document.getElementById('sc'),bsEl=document.getElementById('bs'),ub=document.getElementById('ultB');\nvar BEST=0;try{BEST=parseInt(localStorage.getItem('shanks_best')||'0',10)||0}catch(e){}\nbsEl.textContent=BEST;\nfunction saveBest(){try{localStorage.setItem('shanks_best',String(BEST))}catch(e){}}\nvar horizonY=70,playerY=336,MAXZ=760,laneW=64,EDGE=1.62;\nfunction psc(z){return 1-(z/MAXZ)*.62}\nfunction py(z){return playerY-(z/MAXZ)*(playerY-horizonY)}\nfunction pX(l,z){return W/2+l*laneW*psc(z)}\nvar AC=null,MUTED=false;\ntry{MUTED=localStorage.getItem('shanks_mute')==='1'}catch(e){}\nfunction ac(){if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)()}catch(e){return null}}if(AC&&AC.state==='suspended'){try{AC.resume()}catch(e){}}return AC}\nfunction tone(f,d,t,v,at,sl){var a=AC;if(!a||MUTED)return;try{var n=a.currentTime+(at||0),o=a.createOscillator(),g=a.createGain();o.type=t||'square';o.frequency.setValueAtTime(f,n);if(sl)o.frequency.exponentialRampToValueAtTime(sl,n+d);g.gain.setValueAtTime(v||.1,n);g.gain.exponentialRampToValueAtTime(.0001,n+d);o.connect(g);g.connect(a.destination);o.start(n);o.stop(n+d+.03)}catch(e){}}\nfunction noiz(d,v,at,fc){var a=AC;if(!a||MUTED)return;try{var n=a.currentTime+(at||0),len=Math.floor(a.sampleRate*d),b=a.createBuffer(1,len,a.sampleRate),c=b.getChannelData(0),i;for(i=0;i<len;i++)c[i]=Math.random()*2-1;var s=a.createBufferSource(),g=a.createGain(),f=a.createBiquadFilter();s.buffer=b;f.type='lowpass';f.frequency.value=fc||1200;g.gain.setValueAtTime(v,n);g.gain.exponentialRampToValueAtTime(.0001,n+d);s.connect(f);f.connect(g);g.connect(a.destination);s.start(n);s.stop(n+d+.03)}catch(e){}}\nfunction sSlash(){noiz(.09,.2,0,4200);tone(1900,.07,'sine',.1,0,480)}\nfunction sWave(){noiz(.14,.13,0,3000);tone(900,.14,'sine',.09,0,1500)}\nfunction sHit(){noiz(.1,.2,0,900);tone(110,.09,'sine',.24,0,50)}\nfunction sZap(){noiz(.16,.22,0,2000);[900,620,380].forEach(function(f,i){tone(f,.08,'square',.09,i*.03,f*.5)})}\nfunction sCrate(){noiz(.12,.2,0,800);tone(180,.08,'triangle',.14,0,60)}\nfunction sHurt(){tone(300,.2,'sawtooth',.16,0,70);noiz(.22,.14,.04,700)}\nfunction sDie(){[330,262,196,147,98].forEach(function(f,i){tone(f,.28,'triangle',.13,i*.17)})}\nfunction sWarn(){tone(1500,.06,'square',.12);tone(1500,.06,'square',.12,.09)}\nfunction sRdy(){[880,1175,1568].forEach(function(f,i){tone(f,.1,'sine',.11,i*.07)})}\nfunction sMile(){[440,523,659,880].forEach(function(f,i){tone(f,.09,'square',.1,i*.06)})}\nfunction sUltR(){tone(180,.55,'sawtooth',.14,0,2100);noiz(.55,.1,0,2400)}\nfunction sUltG(){[98,147,196,294].forEach(function(f,i){tone(f,1.5,'sine',.11,i*.02);tone(f*1.005,1.4,'triangle',.07,i*.02)});noiz(.5,.26,0,700)}\nfunction sLunge(){tone(600,.1,'sawtooth',.12,0,140)}\nfunction sShot(){tone(300,.12,'sawtooth',.12,0,900);tone(1500,.06,'square',.07)}\nfunction sParry(){tone(2400,.06,'square',.15,0,1800);tone(720,.14,'triangle',.12);noiz(.08,.12,0,5000)}\nfunction sAuraOn(){[110,220,440,880,1760].forEach(function(f,i){tone(f,.5,'sawtooth',.1,i*.05,f*1.5)});noiz(.7,.14,0,3000)}\nfunction sSmash(){noiz(.14,.24,0,1200);tone(90,.12,'sine',.22,0,40)}\nfunction sHeal(){tone(660,.07,'sine',.07);tone(990,.09,'sine',.06,.05)}\nvar dr=null;\nfunction drOn(){var a=ac();if(!a||MUTED||dr)return;try{var o=a.createOscillator(),o2=a.createOscillator(),g=a.createGain(),f=a.createBiquadFilter();o.type='sawtooth';o.frequency.value=55;o2.type='sawtooth';o2.frequency.value=55.6;f.type='lowpass';f.frequency.value=210;g.gain.value=0;g.gain.setTargetAtTime(.05,a.currentTime,.4);o.connect(f);o2.connect(f);f.connect(g);g.connect(a.destination);o.start();o2.start();dr={o:o,o2:o2,g:g}}catch(e){}}\nfunction drOff(){if(!dr)return;try{var a=AC,t=a.currentTime;dr.g.gain.setTargetAtTime(0,t,.3);dr.o.stop(t+1);dr.o2.stop(t+1)}catch(e){}dr=null}\nvar mStep=0,mNext=0,PL=[220,262,294,330,392,440];\nfunction mTick(){var a=AC;if(!a)return;var inten=(ulti>=100||hp<=30||auraT>0);var SPB=60/(inten?150:118)/2;while(mNext<a.currentTime+.15){var s=mStep%16,at=Math.max(0,mNext-a.currentTime);if(s===0||s===8||(inten&&s===10))tone(70,.16,'sine',.4,at,34);if(s===4||s===12){noiz(.04,.09,at,2000);tone(190,.03,'triangle',.07,at)}if(inten&&s%2)noiz(.012,.02,at,6000);if((s===2||s===13)&&Math.random()<.6){var f=PL[Math.floor(Math.random()*6)];tone(f,.22,'triangle',.09,at);tone(f*2,.1,'sine',.03,at)}mStep++;mNext+=SPB;}}\nsetInterval(function(){var a=AC;if(!a)return;if(state!=='play'){mNext=a.currentTime+.06;return}mTick()},40);\nvar state='ready',frame=0,score=0,best=BEST,hp=100,iframe=0,camZ=0,scroll=5.2,mileston\n",
                        "trusted_sources": []
                      }
                    }
                  }
                ]
              })).toString('base64')
            },
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: {
                botJid: "867051314767696@bot"
              },
              forwardOrigin: 4
            }
          }
        }
      }
    };

    let generatedMsg = generateWAMessageFromContent(m.chat, messageContent, {});
    await sock.relayMessage(jid, generatedMsg.message, { messageId: generatedMsg.key.id });
  },
};
