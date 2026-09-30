import { RomanceScene, RomanceGestures } from './romance.js';
import { createRomanceConfig } from './romance-config.js';
import { PointFilter } from './core.js';
import { canvasToRomance, drawRomance } from './romance-renderer.js';
import { FireworksShow } from './fireworks.js';

const $ = id => document.getElementById(id);
const actionNames = { stars:'点亮了两颗星星', flower:'一朵花在掌心绽放', gather:'星光与花正在汇聚成心' };
const hints = {
  garden:'比 V 点亮星星，张掌开花 · 捏合星花可以移动',
  gathering:'让星光慢慢靠近，等待爱心成形…',
  heart:'爱心已成形 · 再次张掌，或按 4 送出告白',
  reveal:'往后的平凡日子，也要一起。可以保存这份星光。',
};

export class RomanceUI {
  constructor(renderer,{onModeChange,notify,sound=null,config={},configError=null}) {
    this.config=createRomanceConfig(config);
    document.title=this.config.title;
    $('recipient-name').textContent=this.config.recipientName;
    $('config-warning').textContent=configError||'';
    $('config-warning').hidden=!configError;
    this.renderer=renderer;
    this.onModeChange=onModeChange;
    this.notify=notify;
    this.sound=sound;
    this.fireworks=new FireworksShow({reducedMotion:renderer.reducedMotion});
    this.scene=new RomanceScene({reducedMotion:renderer.reducedMotion});
    this.gestures=new RomanceGestures();
    this.filter=new PointFilter();
    this.active=true;
    this.inputPhase='garden';this.palmDuringGather=false;
    this.point=null;this.progress=0;this.pose='idle';this.lastPose='idle';this.signature='';this.manualCount=0;
    $('romance-mode').addEventListener('click',()=>this.setActive(true));
    $('drawing-mode').addEventListener('click',()=>this.setActive(false));
    document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>this.action(button.dataset.action)));
    $('romance-reset').addEventListener('click',()=>this.reset());
    $('fireworks-sound').addEventListener('click',()=>{
      if(!this.sound)return;
      if(this.sound.status==='ready')this.sound.setEnabled(false);
      else{
        this.sound.setEnabled(true);
        if(this.sound.volume===0){this.sound.setVolume(.35);$('fireworks-volume').value='35';}
        this.unlockSound();
      }
      this.syncAudio();
    });
    $('fireworks-volume').addEventListener('input',()=>{
      this.sound?.setVolume(Number($('fireworks-volume').value)/100);this.syncAudio();
    });
    this.setActive(true,false);
    this.syncAudio();
  }

  setActive(active,announce=true) {
    this.stopEffects();
    this.active=active;this.gestures.reset();this.interrupt();
    document.body.classList.toggle('romance-active',active);
    $('romance-toolbar').hidden=!active;$('romance-guide').hidden=!active;$('dedication').hidden=!active;
    $('drawing-toolbar').hidden=active;$('drawing-guide').hidden=active;
    for(const [id,pressed]of [['romance-mode',active],['drawing-mode',!active]]){
      $(id).classList.toggle('selected',pressed);$(id).setAttribute('aria-pressed',String(pressed));
    }
    $('canvas').setAttribute('aria-label',active?'浪漫星光画布，使用数字键 1 点亮星星、2 开花、3 汇聚爱心、4 告白、5 漫天烟花；鼠标拖动星花':'隔空绘画画布，鼠标按住左键绘制，拖动模式下抓取笔迹');
    if(active){
      document.querySelector('.eyebrow').textContent='A LITTLE MAGIC, JUST FOR YOU';
      document.querySelector('h1').innerHTML='把今晚的星光，<span>送给心里的她。</span>';
      document.querySelector('.intro p').textContent='让星星与花在指尖相遇，再把它们变成一句心里话。';
      $('welcome').hidden=true;
    }else{
      document.querySelector('.eyebrow').textContent='GESTURE × CREATIVITY';
      document.querySelector('h1').innerHTML='把指尖的想象，<span>画进空气里。</span>';
      document.querySelector('.intro p').textContent='伸出食指落笔，轻轻捏合移动。你的手，就是画笔。';
    }
    this.signature='';this.sync();
    if(announce)this.onModeChange(active);
  }

  interrupt() {
    this.gestures.interrupt();this.filter.reset();this.scene.pinch('lost',null);
    this.point=null;this.progress=0;this.pose='lost';this.lastPose='lost';
  }

  reset() {
    this.stopEffects();
    this.scene.reset();this.gestures.reset();this.interrupt();this.manualCount=0;
    this.inputPhase='garden';this.palmDuringGather=false;
    $('romance-accessible').textContent='已重新开始星光花束';
    this.signature='';this.sync();this.notify('星光重新点亮，准备好下一次心动');
  }

  action(name,point=null,time=performance.now()) {
    if(!this.active)return false;
    this.advance(time);
    if(name==='fireworks'){
      const started=this.fireworks.trigger(time);
      if(started){this.notify(this.config.fireworksHint);$('romance-accessible').textContent='漫天烟花正在绽放';}
      else this.notify('这一场烟花还在绽放，结束后可以再放一次');
      this.sync();return started;
    }
    if(!point){
      const angle=this.manualCount*2.399;
      point={x:.5+Math.cos(angle)*(.13+this.manualCount%3*.06),y:.4+Math.sin(angle)*.20};
    }
    const accepted=this.scene.action(name,time,point);
    if(accepted){
      if(name==='gather')this.palmDuringGather=this.pose==='palm';
      if(name==='stars'||name==='flower')this.manualCount++;
      this.notify(name==='reveal'?this.config.revealHint:actionNames[name]);
      if(name==='gather'||name==='reveal')this.scene.pinch('lost',null);
    }else if(this.scene.phase==='gathering')this.notify('等星光汇成爱心，再送出告白');
    else if(name==='reveal'&&this.scene.phase==='garden')this.notify('先按 3 汇聚成心，再按 4 送出告白');
    else if(this.scene.phase==='garden'&&this.scene.items.length>=64)this.notify('星光已满，握拳把它们汇成爱心吧');
    this.sync();return accepted;
  }

  handleLandmarks(landmarks,time,aspect,map) {
    if(!this.active)return;
    this.advance(time);
    // Old frames cannot advance reveal timing, but a pre-heart palm still needs release.
    if((this.scene.phase==='heart'||this.scene.phase==='reveal')&&time<this.scene.gatheredAt+this.scene.gatherDuration){
      if(this.gestures.update(landmarks,time,aspect).pose==='palm')this.palmDuringGather=true;
      this.gestures.reset(this.palmDuringGather?'palm':null);
      return;
    }
    const gesture=this.gestures.update(landmarks,time,aspect);
    if(gesture.interrupted){this.scene.pinch('lost',null);this.point=null;}
    if(gesture.interrupted||gesture.pose!==this.lastPose){this.filter.reset();this.point=null;this.lastPose=gesture.pose;}
    let point=gesture.point?canvasToRomance(map(gesture.point),this.renderer.width,this.renderer.height):null;
    const smoothing=Number($('smoothing').value);
    if(point&&smoothing){
      point=this.filter.update(point,time);
      if(smoothing===2&&this.point)point={x:this.point.x*.4+point.x*.6,y:this.point.y*.4+point.y*.6};
    }
    const actionable=gesture.pose==='love'?!this.fireworks.active:(this.scene.phase==='garden'||(this.scene.phase==='heart'&&gesture.pose==='palm'));
    this.point=point;this.pose=gesture.pose;this.progress=actionable?gesture.progress:0;
    if(this.scene.phase==='gathering'&&gesture.pose!=='lost')this.palmDuringGather=gesture.pose==='palm';
    this.scene.pinch(gesture.pose==='pinch'?'pinch':gesture.pose==='lost'?'lost':'idle',point);
    if(actionable){
      if(gesture.event==='love')this.action('fireworks',point,time);
      if(gesture.event==='v')this.action('stars',point,time);
      if(gesture.event==='fist')this.action('gather',point,time);
      if(gesture.event==='palm')this.action(this.scene.phase==='heart'?'reveal':'flower',point,time);
    }
    if(this.scene.phase==='garden'){
      const labels={love:'🤟 我爱你 · 保持一下，点亮漫天烟花',v:'比 V · 保持一下，点亮星星',palm:'张掌 · 保持一下，让花盛开',fist:'握拳 · 保持一下，汇聚成心',pinch:this.scene.selectedId?'抓住了星光 · 松手放下':'捏合 · 靠近星花再抓取',idle:'换个手势，再变一点小魔法',lost:'请将一只手完整放入画面'};
      $('gesture-status').textContent=labels[gesture.pose];
    }else $('gesture-status').textContent=hints[this.scene.phase];
    this.sync();
  }

  pointer(mode,point) {
    this.point=canvasToRomance(point,this.renderer.width,this.renderer.height);
    this.scene.pinch(mode,this.point);
    if(mode==='pinch')$('gesture-status').textContent=this.scene.selectedId?'抓住了星光 · 松手放下':'在星星或花朵附近按住拖动';
    else $('gesture-status').textContent=hints[this.scene.phase];
  }

  key(event) {
    if(!this.active||event.metaKey||event.ctrlKey||event.altKey||event.repeat||event.target.matches('input,textarea,[contenteditable="true"]'))return false;
    const actions={'1':'stars','2':'flower','3':'gather','4':'reveal','5':'fireworks'};
    if(actions[event.key]){event.preventDefault();this.unlockSound();this.action(actions[event.key]);return true;}
    if(event.key.toLowerCase()==='r'){event.preventDefault();this.reset();return true;}
    return false;
  }

  sync() {
    if(!this.active)return;
    const signature=`${this.scene.phase}-${this.scene.items.length}-${this.fireworks.active}`;
    if(signature===this.signature)return;
    this.signature=signature;
    const phase=this.scene.phase;
    $('stage').dataset.romancePhase=phase;
    $('stage').dataset.fireworks=String(this.fireworks.active);
    $('romance-fireworks').disabled=this.fireworks.active;
    $('fireworks-status').textContent=this.fireworks.active?'烟花绽放中 · 结束后可再次触发':'🤟 拇指、食指、小指伸出 · 保持 0.6 秒';
    $('romance-hint').textContent=hints[phase];$('gesture-status').textContent=hints[phase];
    $('romance-reveal').disabled=phase!=='heart';
    for(const name of ['stars','flower','gather'])$(`romance-${name}`).disabled=phase!=='garden';
    const stars=this.scene.items.filter(i=>i.kind==='star').length;
    $('romance-count').textContent=`${stars} 颗星 · ${this.scene.items.length-stars} 朵花`;
    document.querySelectorAll('.story-steps li').forEach(li=>li.classList.toggle('current',li.dataset.phase===(phase==='gathering'?'heart':phase)));
    $('romance-accessible').textContent=phase==='reveal'?this.config.message:hints[phase];
  }

  render(time) {
    if(!this.active)return;
    this.advance(time);
    for(const event of this.fireworks.tick(time))this.sound?.play(event);
    this.sync();
    drawRomance(this.renderer,this.scene,{time,point:this.point,progress:this.progress,pose:this.pose,fireworks:this.fireworks,config:this.config});
  }

  advance(time) {
    this.scene.tick(time);
    if(this.inputPhase!==this.scene.phase&&this.scene.phase==='heart'){
      // A palm already held during gathering needs a real release before revealing.
      if(this.pose!=='love')this.gestures.reset(this.palmDuringGather?'palm':null);
      this.progress=0;this.filter.reset();
    }
    this.inputPhase=this.scene.phase;
  }

  stopEffects(){this.fireworks.reset();this.sound?.stop();this.signature='';}
  async unlockSound(){if(this.sound?.enabled){await this.sound.unlock();this.syncAudio();}}
  syncAudio(){
    const state=this.sound?.status||'locked';
    $('fireworks-sound').textContent={locked:'开启音效',ready:'音效已开启',muted:'音效已关闭',unavailable:'音效不可用 · 请刷新'}[state];
    $('fireworks-sound').setAttribute('aria-pressed',String(state==='ready'));
    $('fireworks-sound').dataset.state=state;
    $('fireworks-volume-value').textContent=`${Math.round((this.sound?.volume??.35)*100)}%`;
  }
}
