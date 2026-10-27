// Pointer hesitation is separate from keyboard focus and drag reception.
export function createNotchHoverController({surface,open,close,preview=()=>{},delay=450,setTimer=setTimeout,clearTimer=clearTimeout}) {
 let pointerInside=false,openTimer,closeTimer,opened=false
 const cancelOpen=()=>{clearTimer(openTimer);openTimer=undefined}
 const cancelClose=()=>{clearTimer(closeTimer);closeTimer=undefined}
 const show=()=>{cancelOpen();cancelClose();preview(false);if(!opened){opened=true;open()}}
 const scheduleClose=()=>{cancelClose();closeTimer=setTimer(()=>{if(!pointerInside){opened=false;preview(false);close()}},200)}
 return {
  pointerEnter(){pointerInside=true;cancelClose();if(opened)return;preview(true);cancelOpen();openTimer=setTimer(()=>{if(pointerInside)show()},delay)},
  pointerLeave(event){if(event.relatedTarget&&surface.contains(event.relatedTarget))return;pointerInside=false;cancelOpen();preview(false);if(opened)scheduleClose()},
  focusIn(){show()},
  focusOut(event){if(event.relatedTarget&&surface.contains(event.relatedTarget))return;if(!pointerInside)scheduleClose()},
  dispose(){cancelOpen();cancelClose();preview(false)}
 }
}
