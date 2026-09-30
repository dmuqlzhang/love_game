// macOS fullscreen transitions can briefly hide the page without backgrounding it.
export function watchPageVisibility(document,onBackground,{
  delay=1500,schedule=setTimeout,cancel=clearTimeout,
}={}){
  let pending=null;
  function clear(){if(pending!==null){cancel(pending);pending=null;}}
  function change(){
    if(!document.hidden){clear();return;}
    if(pending!==null)return;
    pending=schedule(()=>{pending=null;if(document.hidden)onBackground();},delay);
  }
  document.addEventListener('visibilitychange',change);
  return ()=>{clear();document.removeEventListener('visibilitychange',change);};
}
