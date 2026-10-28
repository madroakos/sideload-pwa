export interface Status {state:'disconnected'|'pairing'|'connecting'|'ready'|'error';ip:string;paired:boolean;lastError:string|null;currentApp?:string;volume?:{level:number;max:number;muted:boolean}}
export interface App {name:string;packageName:string}
export interface MediaItem {id:string;name:string;seriesName?:string;episodeLabel?:string;type:string;imageTag:string;imageId?:string;progress?:number;year?:number}
// The remote is stateless: when served from GitHub Pages the TV address is the only
// thing stored here, on this phone, in localStorage. Same-origin default keeps the
// TV-hosted copy (http://<tv>:18080) working with no configuration.
const TV_BASE_KEY='sideload.tvBase';
export function getTvBase():string {try{return localStorage.getItem(TV_BASE_KEY)||''}catch{return ''}}
export function setTvBase(value:string):string {
  const base=value.trim().replace(/\/+$/,'');
  try{if(base)localStorage.setItem(TV_BASE_KEY,base);else localStorage.removeItem(TV_BASE_KEY);}catch{}
  return base;
}
export function tvUrl(path:string):string {return getTvBase()+path;}
export async function api<T= {ok:boolean}>(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T> {
  try {
    const response=await fetch(tvUrl('/api'+path),{method,headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(9500)});
    const data=await response.json();
    if(!response.ok) throw new Error(data.message==='WRONG_CODE' ? 'That code did not match. Check the TV and try again.' : (data.message || 'The TV could not complete this command.'));
    return data;
  } catch(error) {if(error instanceof TypeError || (error as Error).name==='TimeoutError') throw new Error('TV unavailable. Check Wi-Fi and the TV address in Settings.'); throw error;}
}
