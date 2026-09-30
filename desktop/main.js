import {app,BrowserWindow,Menu,dialog,shell} from 'electron';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {assetResponse,ensureConfig,resolveConfigPath,allowPermission} from './runtime.js';
import {inspectDesktopPage} from './smoke-page.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const smoke=process.argv.includes('--smoke-test');
const reportPath=process.argv.find(value=>value.startsWith('--smoke-result='))?.slice('--smoke-result='.length);
let window,server,smokeTimer,finishing=false;
app.setName('灵绘');
if(smoke)app.setPath('userData',path.join(app.getPath('temp'),'linghui-smoke-'+process.pid));

async function finishSmoke(result,code){
  if(finishing)return;
  finishing=true;clearTimeout(smokeTimer);
  try {
    const report=JSON.stringify({ok:code===0,...result},null,2);
    if(reportPath){await mkdir(path.dirname(reportPath),{recursive:true});await writeFile(reportPath,report);}
    console.log(report);
  } catch(error){console.error(error);code=1;}
  server?.close();app.exit(code);
}

async function start(){
  await app.whenReady();
  const portableDirectory=!smoke&&app.isPackaged&&process.platform==='win32'
    ?process.env.PORTABLE_EXECUTABLE_DIR||path.dirname(process.execPath):undefined;
  const configPath=resolveConfigPath({portableDirectory,userData:app.getPath('userData')});
  const defaults=JSON.parse(await readFile(path.join(root,'desktop/default-config.json'),'utf8'));
  await ensureConfig(configPath,defaults);
  let origin;
  server=createServer(async(request,response)=>{
    try {
      const result=await assetResponse(request,{assetDirectory:path.join(root,'dist'),configPath,origin});
      response.writeHead(result.status,result.headers);response.end(result.body);
    } catch {response.writeHead(500);response.end('Resource unavailable');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  window=new BrowserWindow({
    width:1440,height:1000,minWidth:820,minHeight:650,show:false,backgroundColor:'#080d16',title:'灵绘',
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,autoplayPolicy:'user-gesture-required'},
  });
  const session=window.webContents.session;
  session.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>
    contents===window.webContents&&allowPermission({permission,requestUrl:requestingOrigin,origin,mediaTypes:details.mediaType?[details.mediaType]:[],isMainFrame:details.isMainFrame}));
  session.setPermissionRequestHandler((contents,permission,callback,details)=>
    callback(contents===window.webContents&&allowPermission({permission,requestUrl:details.requestingUrl,origin,mediaTypes:details.mediaTypes,isMainFrame:details.isMainFrame})));
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('render-process-gone',(_event,details)=>{
    if(smoke)finishSmoke({error:'Renderer exited: '+details.reason},1);
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
    {label:'配置',submenu:[
      {label:'修改姓名配置…',click:async()=>{
        const error=await shell.openPath(configPath);
        if(error){shell.showItemInFolder(configPath);await dialog.showMessageBox(window,{type:'info',message:'请用记事本或文本编辑器打开 config.json',detail:'修改 recipientName 后保存，再按 Ctrl+R 刷新页面。'});}
      }},
      {label:'显示配置文件位置',click:()=>shell.showItemInFolder(configPath)},
      {type:'separator'},{role:'reload',label:'刷新并重新开始'},
      {type:'separator'},{role:'quit',label:'退出'},
    ]},
    {label:'视图',submenu:[{role:'resetZoom',label:'实际大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'}]},
  ]));
  if(smoke)smokeTimer=setTimeout(()=>finishSmoke({error:'Desktop smoke test timed out'},1),60000);
  await window.loadURL(origin+'/');
  if(smoke){
    const result=await window.webContents.executeJavaScript('('+inspectDesktopPage.toString()+')()');
    await finishSmoke(result,0);
  }else window.show();
}

if(!smoke&&!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>server?.close());
  start().catch(error=>{
    if(smoke)finishSmoke({error:error.stack||error.message},1);
    else {dialog.showErrorBox('灵绘启动失败','请将程序放在可写文件夹中。'+String.fromCharCode(10)+error.message);app.quit();}
  });
}
