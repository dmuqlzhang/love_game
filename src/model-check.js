document.getElementById('run').onclick=()=>{
  const output=document.getElementById('output');
  output.textContent='正在初始化本地模型…';
  const worker=new Worker(new URL('hand-worker.js',new URL(import.meta.env.BASE_URL,location.href)));
  const timer=setTimeout(()=>{output.textContent='FAIL: 模型初始化超时';worker.terminate();},45000);
  worker.onerror=event=>{clearTimeout(timer);output.textContent=`FAIL: ${event.message}`;worker.terminate();};
  worker.onmessage=async({data})=>{
    if(data.type==='ready'){
      output.textContent='模型加载成功，正在推理空白帧…';
      const canvas=new OffscreenCanvas(640,480);canvas.getContext('2d').fillRect(0,0,640,480);
      const bitmap=canvas.transferToImageBitmap();worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);
    }else if(data.type==='result'){
      clearTimeout(timer);output.textContent=`PASS: 本地模型加载与真实推理成功\n空白画面手部结果：${JSON.stringify(data.landmarks)}\n本次推理耗时：${data.inferenceMs.toFixed(1)} ms\n这不代表已验证真人手势准确率。`;worker.terminate();
    }else if(data.type==='error'){clearTimeout(timer);output.textContent=`FAIL: ${data.message}`;worker.terminate();}
  };
  worker.postMessage({type:'init',base:new URL(import.meta.env.BASE_URL,location.href).href});
};
