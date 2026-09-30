// Runs inside the packaged renderer during --smoke-test; never requests a camera.
export async function inspectDesktopPage() {
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Camera secure context unavailable');
  const config=await fetch('/config.json',{cache:'no-store'}).then(response=>response.json());
  const deadline=performance.now()+10000;
  while(document.getElementById('recipient-name')?.textContent!==config.recipientName.trim()){
    if(performance.now()>deadline)throw new Error('Recipient configuration did not reach the page');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(!document.title.endsWith(config.recipientName.trim()))throw new Error('Configured title mismatch');
  const canvas=document.getElementById('canvas');
  if(!canvas||canvas.width<1||canvas.height<1)throw new Error('Canvas did not initialize');
  const worker=new Worker('/hand-worker.js');
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Bundled hand model initialization timed out')),45000);
      worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message));};
      worker.onmessage=async({data})=>{
        if(data.type==='error'){clearTimeout(timer);reject(new Error(data.message));}
        if(data.type==='ready'){
          try {
            const blank=new OffscreenCanvas(64,64);
            blank.getContext('2d').fillRect(0,0,64,64);
            const bitmap=await createImageBitmap(blank);
            worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);
          } catch(error){clearTimeout(timer);reject(error);}
        }
        if(data.type==='result'){clearTimeout(timer);resolve();}
      };
      worker.postMessage({type:'init',base:location.origin+'/'});
    });
  } finally {worker.terminate();}
  return {title:document.title,recipientName:config.recipientName,secureContext:true,modelInference:true,canvas:{width:canvas.width,height:canvas.height}};
}
