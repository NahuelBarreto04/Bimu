// Focus can disappear when an action removes or disables its own button.
// Only close on focus loss when the pointer is outside the companion.
export function createNotchHoverController({surface,open,close,setTimer=setTimeout,clearTimer=clearTimeout}) {
 let pointerInside=false, timer
 const cancel=()=>{clearTimer(timer);timer=undefined}
 const schedule=()=>{cancel();timer=setTimer(()=>{if(!pointerInside)close()},200)}
 return {
  pointerEnter(){pointerInside=true;cancel();open()},
  pointerLeave(event){if(event.relatedTarget&&surface.contains(event.relatedTarget))return;pointerInside=false;schedule()},
  focusIn(){cancel();open()},
  focusOut(event){if(event.relatedTarget&&surface.contains(event.relatedTarget))return;if(!pointerInside)schedule()},
  dispose(){cancel()}
 }
}
