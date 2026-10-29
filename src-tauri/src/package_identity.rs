// Package identity is provided by Windows for MSIX processes.
#[cfg(windows)]
pub fn is_packaged() -> bool {
    #[link(name = "kernel32")]
    extern "system" { fn GetCurrentPackageFullName(length: *mut u32, name: *mut u16) -> i32; }
    let mut length = 0u32;
    // ERROR_INSUFFICIENT_BUFFER means Windows found a package identity.
    unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) == 122 }
}
#[cfg(not(windows))]
pub fn is_packaged() -> bool { false }
