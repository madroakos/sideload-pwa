import type { Zone } from '../state/settings';
export interface Point {x:number;y:number}
export type Region='center'|'up'|'down'|'left'|'right'|'volume'|'back';
export interface GestureCallbacks {key:(code:string)=>void;hold:(zone:Zone)=>void;feedback?:(region:Region|null,point?:Point)=>void;volume?:(delta:number)=>void;back?:(distance:number)=>void}
export class GestureEngine {
  private active?:{id:number;start:Point;last:Point;at:number;region:Region;moved:number;consumed:boolean;volumeSteps:number};
  private holdTimer?:ReturnType<typeof setTimeout>;
  constructor(private callbacks:GestureCallbacks, private width:number, private height:number) {}
  resize(width:number,height:number) {this.cancel();this.width=width;this.height=height;}
  get scale() {return Math.min(this.width,this.height)/390;}
  region(p:Point):Region {
    const s=this.scale;
    if(p.x>=this.width-56*s) return 'volume';
    // Well inside the iOS/Android system edge-gesture zone (~24px) a swipe is
    // captured by the phone itself and navigates the page. Start detection
    // deeper so a deliberate TV back swipe wins and an accidental edge touch
    // at most does nothing.
    if(p.x<=48*s) return 'back';
    const dx=p.x-this.width/2,dy=p.y-this.height/2;
    if(Math.hypot(dx,dy)<=52*s) return 'center';
    return Math.abs(dx)>Math.abs(dy) ? dx>0?'right':'left' : dy>0?'down':'up';
  }
  down(id:number,p:Point,now:number) {
    if(this.active) return false;
    const region=this.region(p);
    this.active={id,start:p,last:p,at:now,region,moved:0,consumed:false,volumeSteps:0};
    const a=this.active;
    this.callbacks.feedback?.(region,p);
    if(['center','up','down'].includes(region)) this.holdTimer=setTimeout(()=>{
      if(this.active===a && a.moved<=10*this.scale){a.consumed=true;this.callbacks.hold(region==='center'?'center':region==='up'?'top':'bottom');}
    },550);
    return true;
  }
  move(id:number,p:Point) {
    const a=this.active;if(!a || a.id!==id) return;
    a.last=p; a.moved=Math.max(a.moved,Math.hypot(p.x-a.start.x,p.y-a.start.y));
    if(a.moved>10*this.scale) clearTimeout(this.holdTimer);
    if(a.region==='volume') {
      const total=Math.trunc((a.start.y-p.y)/(5*this.scale));const delta=total-a.volumeSteps;a.volumeSteps=total;
      if(delta) {a.consumed=true;this.callbacks.volume?.(delta);}
    }
    if(a.region==='back' && !a.consumed) {
      const dx=p.x-a.start.x,dy=p.y-a.start.y;
      this.callbacks.back?.(Math.max(0,Math.min(dx,110*this.scale)));
      if(dx>=90*this.scale && dx>Math.abs(dy)*1.5){a.consumed=true;this.callbacks.key('BACK');}
    }
  }
  up(id:number,now:number) {
    const a=this.active;if(!a || a.id!==id) return;
    clearTimeout(this.holdTimer);
    if(!a.consumed && now-a.at<=300 && a.moved<10*this.scale && !['volume','back'].includes(a.region)) this.callbacks.key(a.region==='center'?'DPAD_CENTER':`DPAD_${a.region.toUpperCase()}`);
    this.cancel();
  }
  cancel(id?:number) {if(id!==undefined && this.active?.id!==id) return;clearTimeout(this.holdTimer);this.active=undefined;this.callbacks.feedback?.(null);this.callbacks.back?.(0);}
}
