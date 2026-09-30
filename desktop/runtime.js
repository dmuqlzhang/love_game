import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';

const contentTypes={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.wasm':'application/wasm',
  '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon',
};
const headers={
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",
};

export function resolveConfigPath({portableDirectory,userData}) {
  return path.join(portableDirectory||userData,'config.json');
}

export function allowPermission({permission,requestUrl,origin,mediaTypes=[],isMainFrame}) {
  try {if(new URL(requestUrl).origin!==origin||isMainFrame!==true)return false;}
  catch {return false;}
  return permission==='fullscreen'||(permission==='media'&&mediaTypes.length>0&&mediaTypes.every(type=>type==='video'));
}

export async function ensureConfig(file,defaults) {
  await mkdir(path.dirname(file),{recursive:true});
  try {
    await writeFile(file,JSON.stringify(defaults,null,2)+String.fromCharCode(10),{flag:'wx'});
  } catch(error) {
    if(error.code!=='EEXIST')throw error;
  }
}

export async function assetResponse(request,{assetDirectory,configPath,origin}) {
  const response=(status,body,type='text/plain; charset=utf-8')=>({
    status,headers:{...headers,'Content-Type':type},body:request.method==='HEAD'?Buffer.alloc(0):Buffer.from(body),
  });
  if(request.headers.host!==new URL(origin).host)return response(403,'Forbidden host');
  if(request.method!=='GET'&&request.method!=='HEAD')return response(405,'Read-only resource');
  let pathname;
  try {pathname=decodeURIComponent(request.url.split('?')[0]);}
  catch {return response(400,'Invalid path');}
  if(!pathname.startsWith('/')||pathname.includes(String.fromCharCode(0))||
     pathname.includes(String.fromCharCode(92))||pathname.split('/').includes('..')){
    return response(403,'Forbidden path');
  }
  try {
    let file;
    if(pathname==='/config.json')file=configPath;
    else {
      const root=await realpath(assetDirectory);
      file=await realpath(path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)));
      if(!file.startsWith(root+path.sep))return response(403,'Forbidden path');
    }
    const bytes=await readFile(file);
    return response(200,bytes,contentTypes[path.extname(file).toLowerCase()]||'application/octet-stream');
  } catch(error) {
    return response(error.code==='ENOENT'||error.code==='EISDIR'||error.code==='ENOTDIR'?404:500,'Resource unavailable');
  }
}
