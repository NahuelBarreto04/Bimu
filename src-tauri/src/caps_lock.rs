// Observe only Caps Lock transitions. Other keys are ignored and never stored.
#[cfg(windows)]
mod windows_impl {
    use std::{ffi::c_void, sync::{atomic::{AtomicBool, Ordering}, OnceLock}};
    use tauri::{AppHandle, Emitter};
    static APP: OnceLock<AppHandle> = OnceLock::new();
    static ENABLED: AtomicBool = AtomicBool::new(false);
    static DOWN: AtomicBool = AtomicBool::new(false);
    type Handle = *mut c_void;
    #[repr(C)] struct KeyboardEvent { vk_code:u32, scan_code:u32, flags:u32, time:u32, extra_info:usize }
    #[repr(C)] struct Point { x:i32, y:i32 }
    #[repr(C)] struct Message { hwnd:Handle, message:u32, wparam:usize, lparam:isize, time:u32, point:Point, private:u32 }
    #[link(name="user32")]
    extern "system" {
        fn SetWindowsHookExW(id:i32, callback:Option<unsafe extern "system" fn(i32,usize,isize)->isize>, module:Handle, thread_id:u32)->Handle;
        fn CallNextHookEx(hook:Handle, code:i32, wparam:usize, lparam:isize)->isize;
        fn GetMessageW(message:*mut Message, hwnd:Handle, min:u32, max:u32)->i32;
        fn UnhookWindowsHookEx(hook:Handle)->i32;
        fn GetKeyState(key:i32)->i16;
    }
    unsafe extern "system" fn callback(code:i32, message:usize, data:isize)->isize {
        if code>=0 && data!=0 {
            let event=&*(data as *const KeyboardEvent);
            if event.vk_code==0x14 {
                if (message==0x0100||message==0x0104) && !DOWN.swap(true,Ordering::SeqCst) {
                    let next=!ENABLED.fetch_xor(true,Ordering::SeqCst);
                    if let Some(app)=APP.get() { let _=app.emit("caps-lock-changed",next); }
                } else if message==0x0101||message==0x0105 { DOWN.store(false,Ordering::SeqCst); }
            }
        }
        CallNextHookEx(std::ptr::null_mut(),code,message,data)
    }
    pub fn start(app:AppHandle) {
        ENABLED.store(unsafe { GetKeyState(0x14) } & 1 != 0,Ordering::SeqCst);
        if APP.set(app).is_err(){return}
        std::thread::spawn(|| unsafe {
            let hook=SetWindowsHookExW(13,Some(callback),std::ptr::null_mut(),0);
            if hook.is_null(){return}
            let mut message:Message=std::mem::zeroed();
            while GetMessageW(&mut message,std::ptr::null_mut(),0,0)>0 {}
            UnhookWindowsHookEx(hook);
        });
    }
}
pub fn start(app:tauri::AppHandle) {
    #[cfg(windows)] windows_impl::start(app);
    #[cfg(not(windows))] let _=app;
}
