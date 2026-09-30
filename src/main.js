import './style.css';
import { DrawingEngine, GestureInterpreter, PointFilter } from './core.js';
import { Renderer, videoRect, mapLandmark } from './renderer.js';
import { HandTracker } from './camera.js';
import { RomanceUI } from './romance-ui.js';
import { FireworksAudio } from './fireworks-audio.js';
import { loadRomanceConfig } from './romance-config.js';

async function startApp() {
const {config,error}=await loadRomanceConfig(import.meta.env.BASE_URL+'config.json');
const $ = id => document.getElementById(id);
const canvas=$('canvas'),video=$('video');
const engine=new DrawingEngine(),renderer=new Renderer(canvas);
let interpreter=new GestureInterpreter(),filter=new PointFilter();
const state={demo:true,landmarks:null,point:null,mode:'idle',source:'mouse',camera:'off',tool:'draw',inferenceMs:null,previousMode:null};
let pointerDown=false,toastTimer,frames=0,fps=0,lastStats=performance.now();
const sound=new FireworksAudio();
const romance=new RomanceUI(renderer,{sound,config,configError:error,notify:toast,onModeChange(active){
  breakInput();interpreter=new GestureInterpreter();renderer.clearParticles();
  $('welcome').hidden=active||!state.demo;updateBadge();
  $('gesture-status').textContent=active?'比 V 点亮星星，或点击按钮开始':'伸出食指或按住鼠标开始绘制';
}});
sound.onStateChange=()=>romance.syncAudio();
// These are real user activation events, required by browser audio autoplay rules.
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(romance.active&&button&&button.id!=='fireworks-sound')romance.unlockSound();
});

function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
function startDrawing(){if(state.demo){state.demo=false;$('welcome').hidden=true;renderer.clearParticles();}updateBadge();}
function updateBadge(){const badge=$('input-badge');badge.classList.toggle('connected',state.camera==='on');badge.innerHTML=`<i></i>${romance.active?(state.camera==='on'?'手势星光 · 已连接':'星光花束 · 可用按钮体验'):state.demo?'示例预览':state.source==='hand'?'手势创作中':'鼠标创作中'}`;}
function breakInput(){engine.breakInput();filter.reset();state.point=null;state.mode='idle';state.previousMode=null;pointerDown=false;romance.interrupt();}
function stopCamera(message='摄像头已关闭'){tracker.stop();state.camera='off';state.source='mouse';state.landmarks=null;state.inferenceMs=null;breakInput();$('camera-title').textContent='摄像头未开启';$('camera-desc').textContent='准备好，施展一点小魔法';$('camera-button').classList.remove('stop');$('camera-button').querySelector('span').textContent='开启摄像头';$('camera-icon').classList.remove('on');$('gesture-status').textContent=message;updateBadge();}

const tracker=new HandTracker(video,{
  onStatus(message){$('camera-title').textContent=message;$('camera-desc').textContent='首次加载模型可能需要几秒';},
  onReady(){state.camera='on';state.source='hand';startDrawing();$('camera-title').textContent='摄像头已连接';$('camera-desc').textContent='让一只手完整出现在画面中';$('camera-icon').classList.add('on');$('camera-button').querySelector('span').textContent='关闭摄像头';$('gesture-status').textContent='寻找手部…';},
  onError(message){stopCamera('摄像头未连接 · 可用鼠标继续');$('error').hidden=false;$('error').textContent=message;},
  onResults(result){
    if(state.camera!=='on')return;
    state.inferenceMs=result.inferenceMs;
    const rect=videoRect(renderer.width,renderer.height,video.videoWidth,video.videoHeight);
    const map=p=>mapLandmark(p,rect,renderer.width,renderer.height,$('mirror').checked);
    state.landmarks=result.landmarks?.map(map)||null;
    if(romance.active){romance.handleLandmarks(result.landmarks,result.time,video.videoWidth/video.videoHeight,map);return;}
    const gesture=interpreter.update(result.landmarks,result.time,video.videoWidth/video.videoHeight);
    if(state.previousMode!==gesture.mode){filter.reset();state.previousMode=gesture.mode;}
    let point=gesture.point?map(gesture.point):null;
    const smooth=Number($('smoothing').value);
    if(point&&smooth){point=filter.update(point,result.time);if(smooth===2&&state.point)point={x:state.point.x*.4+point.x*.6,y:state.point.y*.4+point.y*.6};}
    state.point=point;state.mode=gesture.mode;
    engine.update({mode:gesture.mode,point,time:result.time});
    if(gesture.mode==='draw'&&point)renderer.spawn(point);
    const labels={draw:'食指绘制 · 收起食指暂停',pinch:engine.selectedId?'已抓取图形 · 松开即可放下':'捏合抓取 · 请靠近笔迹',idle:'手部已识别 · 伸出食指开始绘制',lost:'未检测到手部 · 请将手掌完整入镜'};
    $('gesture-status').textContent=labels[gesture.mode]||labels.idle;
  },
});

$('camera-button').addEventListener('click',()=>{
  if(state.camera!=='off'){stopCamera();return;}
  breakInput();interpreter=new GestureInterpreter();state.camera='loading';$('error').hidden=true;
  $('camera-button').classList.add('stop');$('camera-button').querySelector('span').textContent='取消连接';
  tracker.start();
});
$('mouse-button').addEventListener('click',()=>{if(state.camera!=='off')stopCamera();startDrawing();canvas.focus();$('gesture-status').textContent=romance.active?'数字键 1–5 表演 · 鼠标拖动星花':'按住鼠标左键绘制 · 按 V 切换移动';toast(romance.active?'点击下方动作按钮，也能完成整场表演':'鼠标已就绪，按住左键开始画画');});
function setTool(tool){breakInput();engine.finishShape();state.tool=tool;for(const name of ['draw','move']){$(`${name}-tool`).classList.toggle('active',name===tool);$(`${name}-tool`).setAttribute('aria-pressed',String(name===tool));}canvas.style.cursor=tool==='draw'?'crosshair':'grab';if(state.source==='mouse')$('gesture-status').textContent=tool==='draw'?'按住鼠标左键绘制':'按住图形附近的笔迹拖动';}
$('draw-tool').addEventListener('click',()=>setTool('draw'));$('move-tool').addEventListener('click',()=>setTool('move'));
function pointerPoint(event){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))};}
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  if(state.camera!=='off'){toast('先关闭摄像头，再使用鼠标绘制');return;}
  if(romance.active){event.preventDefault();canvas.focus();canvas.setPointerCapture(event.pointerId);pointerDown=true;romance.pointer('pinch',pointerPoint(event));return;}
  event.preventDefault();startDrawing();canvas.focus();canvas.setPointerCapture(event.pointerId);pointerDown=true;state.source='mouse';state.mode=state.tool==='draw'?'draw':'pinch';state.point=pointerPoint(event);engine.update({mode:state.mode,point:state.point,time:performance.now()});
  $('gesture-status').textContent=state.tool==='draw'?'正在绘制 · 按 Enter 完成图形':engine.selectedId?'已抓取 · 松手放下':'未抓到图形 · 请在笔迹附近按下';
});
canvas.addEventListener('pointermove',event=>{
  if(state.camera!=='off')return;
  if(romance.active){if(pointerDown)romance.pointer('pinch',pointerPoint(event));return;}
  state.point=pointerPoint(event);
  if(!pointerDown)return;
  engine.update({mode:state.mode,point:state.point,time:performance.now()});
  if(state.mode==='draw')renderer.spawn(state.point);
});
function releasePointer(){if(!pointerDown)return;if(romance.active){romance.pointer('idle',null);pointerDown=false;return;}const wasMove=state.mode==='pinch';engine.update({mode:'idle',point:state.point,time:performance.now()});pointerDown=false;state.mode='idle';$('gesture-status').textContent=wasMove?'图形已放下 · 按 D 继续绘制':'这一笔已落下 · Enter 完成图形，V 移动';}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);canvas.addEventListener('pointerleave',()=>{if(!pointerDown&&state.source==='mouse')state.point=null;});
function finish(){startDrawing();breakInput();engine.finishShape();toast('图形已完成，可以捏合或用移动工具抓取');}
function clear(){startDrawing();breakInput();engine.clear();renderer.clearParticles();toast('画布已清空，灵感重新出发');}
function undo(){startDrawing();breakInput();engine.undo();toast('已撤销上一笔');}
$('finish').addEventListener('click',finish);$('clear').addEventListener('click',clear);$('undo').addEventListener('click',undo);
$('smoothing').addEventListener('input',()=>{filter.reset();romance.filter.reset();romance.point=null;$('smoothing-value').textContent=['关闭','适中','更稳'][$('smoothing').value];});
$('mirror').addEventListener('change',()=>{breakInput();state.landmarks=null;interpreter=new GestureInterpreter();});
$('save').addEventListener('click',()=>{
  const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;
  const ctx=output.getContext('2d');ctx.drawImage(canvas,0,0);output.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`灵绘-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('画布已保存为 PNG');});
});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await canvas.requestFullscreen();}catch{toast('当前浏览器不支持全屏，请放大窗口');}});
document.addEventListener('fullscreenchange',()=>{
  breakInput();state.landmarks=null;renderer.resize();
  if(document.fullscreenElement===canvas)canvas.focus({preventScroll:true});
  else $('fullscreen').focus({preventScroll:true});
});
document.addEventListener('keydown',event=>{if(romance.key(event)||romance.active)return;if(event.target.matches('input,textarea,button')||event.repeat)return;const key=event.key.toLowerCase();if((event.metaKey||event.ctrlKey)&&key==='z'){event.preventDefault();undo();}else if(!event.metaKey&&!event.ctrlKey&&!event.altKey){if(key==='d')setTool('draw');if(key==='v')setTool('move');if(key==='enter'){event.preventDefault();finish();}if(key==='c')clear();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){romance.stopEffects();if(state.camera!=='off')stopCamera('页面已切到后台，摄像头自动关闭');else breakInput();}});
window.addEventListener('pagehide',event=>{tracker.stop();romance.stopEffects();if(!event.persisted)sound.dispose();});
window.addEventListener('blur',()=>{if(pointerDown)releasePointer();});
window.addEventListener('resize',()=>{breakInput();state.landmarks=null;});
function frame(time){
  frames++;if(time-lastStats>800){fps=Math.round(frames*1000/(time-lastStats));frames=0;lastStats=time;$('frame-stats').innerHTML=`${fps} FPS <b>/</b> ${state.inferenceMs===null?'—':Math.round(state.inferenceMs)} ms`;}
  renderer.render(romance.active?{shapes:[],selectedId:null}:engine,{time,video,demo:!romance.active&&state.demo,landmarks:state.landmarks,point:state.point,mode:state.mode,showBackground:$('background').checked&&state.camera==='on',showSkeleton:$('skeleton').checked,mirror:$('mirror').checked});
  romance.render(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
updateBadge();
$('frame-stats').title='FPS：画布渲染帧率；ms：最近一次手部模型推理耗时，不含摄像头采集及显示延迟。';
}

startApp();
