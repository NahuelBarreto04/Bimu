#[derive(serde::Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ScreenRect { left:i32, top:i32, right:i32, bottom:i32 }

impl ScreenRect {
    fn intersects(&self,other:&ScreenRect)->bool { self.left<other.right && self.right>other.left && self.top<other.bottom && self.bottom>other.top }
}
#[tauri::command]
pub fn window_overlaps_notch(rect:ScreenRect)->bool {
    if rect.right<=rect.left || rect.bottom<=rect.top { return false }
    #[cfg(windows)] { return windows_impl::overlaps(rect) }
    #[cfg(not(windows))] { let _=rect; false }
}
#[cfg(windows)]
mod windows_impl {
    use super::ScreenRect;
    use std::ffi::c_void;
    type Hwnd=*mut c_void;
    #[repr(C)] struct Rect{left:i32,top:i32,right:i32,bottom:i32}
    #[link(name="user32")]
    extern "system" {
        fn EnumWindows(callback:Option<unsafe extern "system" fn(Hwnd,isize)->i32>,arg:isize)->i32;
        fn IsWindowVisible(hwnd:Hwnd)->i32;
        fn IsIconic(hwnd:Hwnd)->i32;
        fn GetWindowThreadProcessId(hwnd:Hwnd,pid:*mut u32)->u32;
        fn GetClassNameW(hwnd:Hwnd,buffer:*mut u16,max:i32)->i32;
        fn GetWindowLongPtrW(hwnd:Hwnd,index:i32)->isize;
    }
    #[link(name="dwmapi")]
    extern "system" { fn DwmGetWindowAttribute(hwnd:Hwnd,attribute:u32,value:*mut c_void,size:u32)->i32; }
    struct Context { target:ScreenRect,found:bool,pid:u32 }
    unsafe extern "system" fn visit(hwnd:Hwnd,arg:isize)->i32 {
        let ctx=&mut *(arg as *mut Context);
        if IsWindowVisible(hwnd)==0 || IsIconic(hwnd)!=0 {return 1}
        let mut pid=0;GetWindowThreadProcessId(hwnd,&mut pid);
        if pid==ctx.pid {return 1}
        let style=GetWindowLongPtrW(hwnd,-20) as usize;
        if style & 0x80 != 0 || style & 0x20 != 0 {return 1} // tool and click-through windows
        let mut class=[0u16;128];let len=GetClassNameW(hwnd,class.as_mut_ptr(),class.len() as i32);
        let class=String::from_utf16_lossy(&class[..len.max(0) as usize]);
        if matches!(class.as_str(),"Progman"|"WorkerW"|"Shell_TrayWnd"|"Shell_SecondaryTrayWnd") {return 1}
        let mut cloaked:u32=0;
        if DwmGetWindowAttribute(hwnd,14,&mut cloaked as *mut _ as *mut c_void,4)==0 && cloaked!=0{return 1}
        let mut rect=Rect{left:0,top:0,right:0,bottom:0};
        if DwmGetWindowAttribute(hwnd,9,&mut rect as *mut _ as *mut c_void,std::mem::size_of::<Rect>() as u32)!=0{return 1}
        let window=ScreenRect{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom};
        if ctx.target.intersects(&window) {ctx.found=true;return 0}
        1
    }
    pub fn overlaps(target:ScreenRect)->bool {let mut context=Context{target,found:false,pid:std::process::id()};unsafe{EnumWindows(Some(visit),&mut context as *mut _ as isize)};context.found}
}

#[cfg(test)] mod tests {
 use super::*;
 #[test] fn intersection_respects_screen_edges_and_negative_monitor_origins(){let notch=ScreenRect{left:-900,top:-100,right:-750,bottom:-73};let covering=ScreenRect{left:-1000,top:-100,right:-700,bottom:700};let touching=ScreenRect{left:-750,top:-100,right:-600,bottom:700};let separate=ScreenRect{left:0,top:0,right:200,bottom:200};assert!(notch.intersects(&covering));assert!(!notch.intersects(&touching));assert!(!notch.intersects(&separate));}
}
