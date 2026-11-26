(function hForgeWodTimer(){
"use strict";
const $=id=>document.getElementById(id);
const MODES=["amrap","emom","fortime","tabata"];
const fieldIds=["wodAmrapMinutes","wodEmomRounds","wodEmomSeconds","wodForTimeCap","wodTabataRounds","wodTabataWork","wodTabataRest","wodPrepSeconds"];
let mode="amrap",state="idle",pausedFrom=null;
let config=null,anchor=0,carried=0,timerId=null;
let rounds=0,reps=0,muted=false,focus=false,audio=null;
let lastCountdown=null,lastIntervalKey=null,finishReason="";
const now=()=>Date.now();
const seconds=ms=>Math.max(0,Math.floor(ms/1000));
function formatClock(value){
  const s=Math.max(0,Math.floor(value)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;
  return h>0?`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function countdown(ms){return formatClock(Math.ceil(Math.max(0,ms)/1000))}
function readInt(id,min,max,name){
  const raw=String($(id).value).trim(),n=Number(raw);
  if(raw===""||!Number.isInteger(n)||n<min||n>max)throw Error(`${name} must be between ${min} and ${max}.`);
  return n
}
function readConfig(){
  const prep=readInt("wodPrepSeconds",0,30,"Countdown");
  if(mode==="amrap")return{prep,minutes:readInt("wodAmrapMinutes",1,240,"AMRAP minutes")};
  if(mode==="emom")return{prep,rounds:readInt("wodEmomRounds",1,120,"EMOM intervals"),interval:readInt("wodEmomSeconds",5,600,"Interval seconds")};
  if(mode==="fortime")return{prep,cap:readInt("wodForTimeCap",0,240,"Time cap")};
  return{prep,rounds:readInt("wodTabataRounds",1,100,"Tabata rounds"),work:readInt("wodTabataWork",1,600,"Work seconds"),rest:readInt("wodTabataRest",0,600,"Rest seconds")}
}
function getPreviewConfig(){
  try{return readConfig()}catch{
    if(mode==="amrap")return{prep:10,minutes:12};
    if(mode==="emom")return{prep:10,rounds:10,interval:60};
    if(mode==="fortime")return{prep:10,cap:20};
    return{prep:10,rounds:8,work:20,rest:10}
  }
}
function totalTime(c,m=mode){
  if(m==="amrap")return c.minutes*60000;
  if(m==="emom")return c.rounds*c.interval*1000;
  if(m==="fortime")return c.cap>0?c.cap*60000:null;
  return(c.rounds*c.work+(c.rounds-1)*c.rest)*1000
}
function metrics(elapsed,c,m=mode){
  const total=totalTime(c,m),past=Math.max(0,elapsed),clamped=total===null?past:Math.min(total,past);
  const ended=total!==null&&past>=total;
  if(m==="amrap"){
    return{total,done:ended,main:countdown(total-clamped),stage:ended?"DONE":"WORK",key:"amrap",detail:`${countdown(total-clamped)} left in AMRAP`,round:`${rounds} rounds + ${reps} reps`,progress:clamped/total}
  }
  if(m==="emom"){
    const intervalMs=c.interval*1000,index=Math.min(c.rounds-1,Math.floor(clamped/intervalMs));
    const segment=ended?0:intervalMs-(clamped-index*intervalMs);
    return{total,done:ended,main:countdown(total-clamped),stage:ended?"DONE":"EMOM",key:`emom-${index}`,detail:ended?`${c.rounds} intervals complete`:`Interval ${index+1} of ${c.rounds} · next in ${countdown(segment)}`,round:`${Math.min(c.rounds,index+1)} / ${c.rounds}`,progress:clamped/total}
  }
  if(m==="fortime"){
    return{total,done:ended,main:formatClock(seconds(clamped)),stage:ended?"TIME CAP":"FOR TIME",key:"fortime",detail:total===null?"No time cap · press Finish when done":`${countdown(total-clamped)} remaining to cap`,round:`${rounds} rounds + ${reps} reps`,progress:total===null?0:clamped/total}
  }
  const work=c.work*1000,rest=c.rest*1000,cycle=work+rest;
  const index=Math.min(c.rounds-1,Math.floor(clamped/cycle));
  const inside=Math.max(0,clamped-index*cycle);
  const isWork=inside<work||ended||rest===0;
  const phase=ended?"DONE":isWork?"WORK":"REST";
  const partLeft=ended?0:isWork?work-inside:cycle-inside;
  return{total,done:ended,main:countdown(partLeft),stage:phase,key:`tabata-${index}-${phase}`,detail:ended?`${c.rounds} rounds complete`:`Round ${index+1} of ${c.rounds} · ${countdown(total-clamped)} total left`,round:`${Math.min(c.rounds,index+1)} / ${c.rounds}`,progress:clamped/total}
}
function elapsed(){
  return carried+((state==="running"||state==="prep")?Math.max(0,now()-anchor):0)
}

let audioMode=loadAudioMode(),mediaClips=Object.create(null),mediaUrls=Object.create(null);
// Original Olympic-weightlifting-style competition buzzer, not a recorded IWF sound.
// Both iOS playback paths use the same frequency/duration patterns.
const BUZZ_PATTERNS={
  tick:[[475,0,.10]],
  go:[[475,0,.28],[475,.36,.28]],
  rest:[[410,0,.36]],
  warning:[[475,0,.32],[475,.42,.32]],
  done:[[475,0,1.08]]
};
let warned90=false,warned30=false;
let audioResumePromise=null,audioNotice="Tap Test sound for the weightlifting-style clock buzzer. If silent, try alternate audio.";
function loadAudioMode(){
  try{return localStorage.getItem("hforgeTimerAudioModeV1")==="media"?"media":"web"}catch{return"web"}
}
function audioNoticeText(message){
  audioNotice=message;
  const node=$("wodAudioStatus");
  if(node)node.textContent=message
}
function primeWebAudio(){
  if(muted||audioMode!=="web")return null;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx){
    audioNoticeText("Web Audio is unavailable. Tap Try alternate audio.");
    return null
  }
  try{
    if(!audio||audio.state==="closed")audio=new Ctx();
    if(audio.state==="suspended"||audio.state==="interrupted"){
      const ctx=audio;
      if(!audioResumePromise){
        let attempt;
        try{attempt=ctx.resume()}catch(e){audioNoticeText("Audio start was blocked. Try alternate audio.");return ctx}
        const pending=Promise.resolve(attempt).then(()=>{
          if(audio!==ctx)return;
          if(ctx.state==="running")audioNoticeText("Audio ready. You should hear the test beep.");
          else audioNoticeText("Audio is still blocked. Try alternate audio and check iPhone Silent Mode.")
        }).catch(()=>{
          if(audio===ctx)audioNoticeText("iPhone blocked Web Audio. Tap Try alternate audio.")
        });
        audioResumePromise=pending;
        // Some iPhone Home Screen versions leave resume() pending indefinitely.
        setTimeout(()=>{
          if(audio===ctx&&audioResumePromise===pending&&ctx.state!=="running"){
            audioNoticeText("iPhone audio did not resume. Tap Try alternate audio.");
          }
        },1800);
        pending.finally(()=>{if(audioResumePromise===pending)audioResumePromise=null})
      }
    }
    return audio
  }catch(e){
    audioNoticeText("Web Audio could not start. Try alternate audio.");
    return null
  }
}
function retireWebAudio(){
  if(audio){
    const previous=audio;
    audio=null;audioResumePromise=null;
    try{Promise.resolve(previous.close?.()).catch(()=>{})}catch{}
  }
}
function playCompetitionBuzzer(ctx,freq,duration,delay=0){
  const at=ctx.currentTime+delay;
  const horn=ctx.createOscillator(),harmonic=ctx.createOscillator();
  const body=ctx.createGain(),harmonicLevel=ctx.createGain();
  // A rasping electronic horn, not the previous musical triangle-wave chime.
  horn.type="sawtooth";harmonic.type="triangle";
  horn.frequency.value=freq;harmonic.frequency.value=freq*1.5;
  harmonicLevel.gain.setValueAtTime(.30,at);
  body.gain.setValueAtTime(.0001,at);
  body.gain.exponentialRampToValueAtTime(.21,at+.015);
  body.gain.setValueAtTime(.21,at+Math.max(.025,duration-.045));
  body.gain.exponentialRampToValueAtTime(.0001,at+duration);
  horn.connect(body);harmonic.connect(harmonicLevel);harmonicLevel.connect(body);
  body.connect(ctx.destination);
  horn.start(at);harmonic.start(at);
  horn.stop(at+duration+.018);harmonic.stop(at+duration+.018)
}
function webCue(kind){
  const ctx=primeWebAudio();
  if(!ctx)return false;
  const emit=()=>{
    if(muted||document.hidden||audioMode!=="web"||audio!==ctx||ctx.state!=="running")return;
    try{
      for(const [freq,delay,duration] of BUZZ_PATTERNS[kind]||BUZZ_PATTERNS.tick){
        playCompetitionBuzzer(ctx,freq,duration,delay)
      }
    }catch(e){audioNoticeText("Buzzer output failed. Tap Try alternate audio.")}
  };
  if(ctx.state==="running")emit();
  else if(audioResumePromise)audioResumePromise.then(()=>emit());
  else audioNoticeText("Buzzer is not ready. Tap Test sound, then try alternate audio.");
  return true
}
function makeWav(kind){
  // Same competition-style buzzer generated locally as 16-bit WAV for iPhone fallback.
  const segments=BUZZ_PATTERNS[kind]||BUZZ_PATTERNS.tick;
  const rate=22050,duration=Math.max(...segments.map(v=>v[1]+v[2]))+.03;
  const sampleCount=Math.ceil(rate*duration),buffer=new ArrayBuffer(44+sampleCount*2),view=new DataView(buffer);
  function write(offset,text){for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i))}
  write(0,"RIFF");view.setUint32(4,36+sampleCount*2,true);write(8,"WAVE");write(12,"fmt ");
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");
  view.setUint32(40,sampleCount*2,true);
  for(let i=0;i<sampleCount;i++){
    const time=i/rate;let sample=0;
    for(const [freq,offset,length] of segments){
      const p=time-offset;
      if(p>=0&&p<length){
        const envelope=Math.max(0,Math.min(1,p/.015,(length-p)/.045));
        const cycles=p*freq, saw=2*(cycles-Math.floor(cycles+.5));
        sample+=(saw*.38+Math.sin(p*2*Math.PI*freq*1.5)*.12)*envelope
      }
    }
    view.setInt16(44+i*2,Math.max(-32767,Math.min(32767,Math.round(sample*32767))),true)
  }
  return URL.createObjectURL(new Blob([buffer],{type:"audio/wav"}))
}
function getMediaPlayer(kind){
  if(!mediaClips[kind]){
    const Player=window.Audio;
    const player=Player?new Player():document.createElement("audio");
    if(!player)return null;
    mediaUrls[kind]=makeWav(kind);
    player.src=mediaUrls[kind];player.preload="auto";player.volume=1;
    mediaClips[kind]=player
  }
  return mediaClips[kind]
}
function mediaCue(kind){
  try{
    const player=getMediaPlayer(kind);
    if(!player||!player.play){audioNoticeText("Alternate audio is unavailable on this device.");return false}
    player.pause?.();
    try{player.currentTime=0}catch{}
    const promise=player.play();
    if(promise&&typeof promise.catch==="function")promise.catch(()=>{
      audioNoticeText("iPhone blocked playback. Check media volume and Silent Mode, then try Test sound.")
    });
    return true
  }catch(e){audioNoticeText("Alternate audio failed. Check Silent Mode or try Standard audio.");return false}
}
function enableAudio(){
  if(muted)return;
  if(audioMode==="web")primeWebAudio()
  else{
    // Media playback is primed on the user's Start/Test click for later timer cues.
    try{getMediaPlayer("tick")}catch{}
  }
}
function cue(kind){
  if(muted||document.hidden)return;
  if(audioMode==="media")mediaCue(kind);
  else if(!webCue(kind))audioNoticeText("No Web Audio output. Tap Try alternate audio.");
  try{if(kind==="done"&&navigator.vibrate)navigator.vibrate([130,80,200])}catch{}
}
function testSound(){
  if(muted){
    audioNoticeText("Sound is off. Tap Sound off to enable it, then Test sound.");
    return
  }
  if(audioMode==="web"&&audio&&audio.state!=="running")retireWebAudio();
  audioNoticeText(audioMode==="media"?"Playing competition buzzer (alternate audio)…":"Playing competition buzzer…");
  enableAudio();
  cue("warning")
}
function toggleAudioMode(){
  audioMode=audioMode==="web"?"media":"web";
  try{localStorage.setItem("hforgeTimerAudioModeV1",audioMode)}catch{}
  audioNoticeText(audioMode==="media"?"Alternate audio selected. Testing beep…":"Standard audio selected. Testing beep…");
  if(!muted)testSound();
  else audioNoticeText("Sound is off. Enable Sound, then tap Test sound.");
  render()
}

function runTick(){
  if(state==="prep"){
    let e=elapsed(),left=config.prep*1000-e;
    if(left<=0){
      carried=Math.max(0,-left);anchor=now();state="running";
      lastIntervalKey=null;lastCountdown=null;cue("go")
    }else{
      const sec=Math.ceil(left/1000);
      if(sec!==lastCountdown){lastCountdown=sec;if(sec<=3)cue("tick")}
    }
  }
  if(state==="running"){
    const m=metrics(elapsed(),config);
    const remaining=m.total===null?null:Math.max(0,m.total-elapsed());
    // Adapt IWF-style 90s / 30s warnings to finite WOD clocks.
    // Never play overlapping warning + finish buzzers after a delayed background tick.
    if(!m.done&&remaining!==null){
      if(!warned90&&m.total>=120000&&remaining<=90000){
        warned90=true;cue("warning")
      }
      if(!warned30&&m.total>=60000&&remaining<=30000){
        warned30=true;cue("warning")
      }
    }
    if(m.done){
      carried=m.total;state="finished";finishReason=mode==="fortime"?"cap":"complete";
      stopTicker();cue("done")
    }else if(m.key!==lastIntervalKey){
      if(lastIntervalKey!==null)cue(m.stage==="REST"?"rest":"go");
      lastIntervalKey=m.key
    }
  }
  render()
}
function startTicker(){stopTicker();timerId=setInterval(runTick,120)}
function stopTicker(){if(timerId!==null){clearInterval(timerId);timerId=null}}
function setStatus(text){$("wodMessage").textContent=text}
function render(){
  const active=state==="prep"||state==="running"||state==="paused";
  const running=state==="prep"||state==="running";
  const c=config||getPreviewConfig();
  const current=elapsed();
  let m=metrics(state==="idle"?0:state==="prep"?0:current,c);
  let face=m.main,label=m.stage,detail=m.detail,progress=m.progress;
  if(state==="idle"){
    label="READY";detail="Choose your mode and hit Start";progress=0
  }else if(state==="prep"||(state==="paused"&&pausedFrom==="prep")){
    const left=Math.max(0,c.prep*1000-current);
    face=countdown(left);label=state==="paused"?"PAUSED":"GET READY";
    detail="Your workout starts after the countdown";progress=(c.prep*1000-left)/(c.prep*1000||1)
  }else if(state==="paused"){
    label="PAUSED · "+m.stage
  }else if(state==="finished"){
    label="FINISHED";
    if(mode==="fortime"&&finishReason==="manual"){
      detail="Workout completed in "+m.main
    }else if(mode==="fortime"){
      detail="Time cap reached"
    }else if(mode==="amrap"){
      detail=`Finished · ${rounds} rounds + ${reps} reps`
    }else detail=mode==="emom"?"All intervals complete":"All Tabata rounds complete"
  }
  $("wodClock").textContent=face;
  $("wodPhase").textContent=label;
  $("wodDetail").textContent=detail;
  $("wodProgressRing").style.setProperty("--wod-progress",`${Math.max(0,Math.min(100,progress*100)).toFixed(2)}%`);
  $("wodRoundDisplay").textContent=m.round;
  $("wodModeLabel").textContent=mode==="amrap"?"AMRAP":mode==="emom"?"EMOM":mode==="fortime"?"FOR TIME":"TABATA";
  const counts=mode==="amrap"||mode==="fortime";
  $("wodManualCounters").classList.toggle("hidden",!counts);
  $("wodRounds").textContent=String(rounds);
  $("wodReps").textContent=String(reps);
  for(const id of ["wodRoundMinus","wodRoundPlus","wodRepMinus","wodRepPlus"]){
    $(id).disabled=!counts||!(state==="running"||state==="paused"||state==="finished")
  }
  $("wodStart").disabled=active;
  $("wodStart").textContent=state==="finished"?"New workout":"Start workout";
  $("wodPause").disabled=!(active&&state!=="finished");
  $("wodPause").textContent=state==="paused"?"Resume":"Pause";
  $("wodReset").disabled=state==="idle";
  $("wodFinish").classList.toggle("hidden",mode!=="fortime");
  $("wodFinish").disabled=mode!=="fortime"||!(state==="running"||(state==="paused"&&pausedFrom==="running"));
  $("wodSound").textContent=muted?"Sound off":"Sound on";
  $("wodSound").setAttribute("aria-pressed",String(!muted));
  $("wodAudioMode").textContent=audioMode==="web"?"Try alternate audio":"Use standard audio";
  $("wodAudioMode").setAttribute("aria-pressed",String(audioMode==="media"));
  $("wodFocus").textContent=focus?"Exit focus":"Focus mode";
  $("view-timer").classList.toggle("wod-focus",focus);
  document.body.classList.toggle("wod-focus-active",focus);
  for(const node of document.querySelectorAll("[data-wod-mode]")){
    const selected=node.dataset.wodMode===mode;
    node.classList.toggle("active",selected);
    node.setAttribute("aria-pressed",String(selected));node.disabled=active
  }
  for(const node of document.querySelectorAll("[data-wod-config]")){
    node.classList.toggle("hidden",node.dataset.wodConfig!==mode)
  }
  for(const node of document.querySelectorAll(".wod-config-input"))node.disabled=active;
  $("wodModeSummary").textContent=mode==="amrap"?`${c.minutes} min AMRAP`:
    mode==="emom"?`${c.rounds} × ${formatClock(c.interval)}`:
    mode==="fortime"?(c.cap?`${c.cap} min cap`:"No time cap"):
    `${c.rounds} rounds · ${c.work}s work / ${c.rest}s rest`;
  if(state==="finished")setStatus(detail);
}
function reset(){
  stopTicker();state="idle";pausedFrom=null;carried=0;anchor=0;config=null;
  rounds=0;reps=0;lastCountdown=null;lastIntervalKey=null;warned90=warned30=false;finishReason="";
  if(focus){focus=false;document.body.classList.remove("wod-focus-active")}
  setStatus("Timer reset. Set up your next workout.");render()
}
function chooseMode(next){
  if(!MODES.includes(next)||state==="running"||state==="prep"||state==="paused")return;
  mode=next;reset();setStatus("Set your workout and press Start.")
}
function start(){
  if(state==="running"||state==="prep"||state==="paused")return false;
  let next;
  try{next=readConfig()}catch(e){setStatus(e.message);return false}
  config=next;carried=0;anchor=now();rounds=0;reps=0;pausedFrom=null;
  lastIntervalKey=null;lastCountdown=null;warned90=warned30=false;finishReason="";
  enableAudio();state=config.prep>0?"prep":"running";
  // Prime iPhone audio during the user click, not on the first delayed interval.
  cue(state==="running"?"go":"tick");
  setStatus(state==="prep"?"Get ready…":"Workout running");
  startTicker();runTick();return true
}
function pauseOrResume(){
  if(state==="running"||state==="prep"){
    carried=elapsed();pausedFrom=state;state="paused";
    stopTicker();setStatus("Paused. Tap Resume when ready.");render()
  }else if(state==="paused"){
    state=pausedFrom||"running";pausedFrom=null;anchor=now();
    enableAudio();startTicker();runTick();setStatus("Timer resumed.")
  }
}
function finish(){
  if(mode!=="fortime"||!(state==="running"||(state==="paused"&&pausedFrom==="running")))return;
  carried=elapsed();state="finished";pausedFrom=null;finishReason="manual";
  stopTicker();cue("done");render()
}
function adjust(kind,delta){
  if(!(state==="running"||state==="paused"||state==="finished")||!(mode==="amrap"||mode==="fortime"))return;
  if(kind==="rounds")rounds=Math.max(0,rounds+delta);
  if(kind==="reps")reps=Math.max(0,reps+delta);
  render()
}
function toggleFocus(){focus=!focus;render();if(focus)$("view-timer").scrollTo?.({top:0})}
function toggleSound(){muted=!muted;render();if(!muted)testSound();else audioNoticeText("Sound muted. Tap Sound off to enable it.")}
$("wodStart").addEventListener("click",start);
$("wodPause").addEventListener("click",pauseOrResume);
$("wodReset").addEventListener("click",reset);
$("wodFinish").addEventListener("click",finish);
$("wodFocus").addEventListener("click",toggleFocus);
$("wodSound").addEventListener("click",toggleSound);
$("wodTestSound").addEventListener("click",testSound);
$("wodAudioMode").addEventListener("click",toggleAudioMode);
$("wodRoundMinus").addEventListener("click",()=>adjust("rounds",-1));
$("wodRoundPlus").addEventListener("click",()=>adjust("rounds",1));
$("wodRepMinus").addEventListener("click",()=>adjust("reps",-1));
$("wodRepPlus").addEventListener("click",()=>adjust("reps",1));
document.querySelectorAll("[data-wod-mode]").forEach(button=>
  button.addEventListener("click",()=>chooseMode(button.dataset.wodMode))
);
document.querySelectorAll(".wod-config-input").forEach(input=>input.addEventListener("change",()=>{if(state==="idle"||state==="finished")render()}));
document.addEventListener("visibilitychange",()=>{if(!document.hidden){if(audioMode==="web"&&audio&&audio.state!=="running")audioNoticeText("Audio may have been interrupted. Tap Test sound to re-enable.");runTick()}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&focus){focus=false;render()}});
window.HForgeTimer={
 reset,stop:reset,selectMode:chooseMode,start,pauseOrResume,finish,tick:runTick,
 getSnapshot:()=>({mode,state,config,elapsedMs:elapsed(),rounds,reps,muted,focus,audioMode,audioState:audio?.state||"none",phase:metrics(state==="prep"?0:elapsed(),config||getPreviewConfig()).stage}),
 adjust
};
audioNoticeText(audioNotice);
render()
})();
