use serde::Deserialize;
use std::sync::{Arc,Mutex};
use tauri::{Manager,State};
#[derive(Clone,Copy,Deserialize)]
pub struct Region { x:f64,y:f64,width:f64,height:f64, radii:[f64;4] }
impl Region {
 fn contains(&self,x:f64,y:f64)->bool {
  if x<self.x || y<self.y || x>=self.x+self.width || y>=self.y+self.height{return false}
  let corner=if y<self.y+self.height/2.{if x<self.x+self.width/2.{0}else{1}}else if x<self.x+self.width/2.{3}else{2};
  let r=self.radii[corner].max(0.).min(self.width/2.).min(self.height/2.);
  let cx=x.clamp(self.x+r,self.x+self.width-r);let cy=y.clamp(self.y+r,self.y+self.height-r);
  (x-cx).powi(2)+(y-cy).powi(2)<=r*r
 }
}
#[derive(Default)]struct PointerCapture{down:bool,owned:bool}
impl PointerCapture{
 fn hold(&mut self,down:bool,on_bimu:bool)->bool{
  if down&&!self.down{self.owned=on_bimu;}
  if !down{self.owned=false;}
  self.down=down;self.owned&&down
 }
}
#[derive(Default,Clone)]pub struct HitRegions(Arc<Mutex<Vec<Region>>>);
#[tauri::command]
pub fn desktop_hit_regions(regions:Vec<Region>,state:State<'_,HitRegions>)->Result<(),String>{
 if regions.len()>16||regions.iter().any(|r|[r.x,r.y,r.width,r.height].iter().chain(r.radii.iter()).any(|v|!v.is_finite())||r.width<0.||r.height<0.){return Err("Regiones de ventana invalidas.".into())}
 *state.inner().0.lock().map_err(|_|"No se pudo actualizar la ventana.")?=regions;Ok(())
}
pub fn start(app:tauri::AppHandle){
 #[cfg(windows)]
 std::thread::spawn(move||{
  let regions=app.state::<HitRegions>().inner().clone();let mut ignored=false;let mut mouse=PointerCapture::default();
  loop{
   std::thread::sleep(std::time::Duration::from_millis(20));
   let Some(window)=app.get_webview_window("main")else{break};
   use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState,VK_LBUTTON,VK_RBUTTON};
   let down=unsafe{GetAsyncKeyState(VK_LBUTTON as i32)}<0 || unsafe{GetAsyncKeyState(VK_RBUTTON as i32)}<0;
   let (Ok(cursor),Ok(origin),Ok(scale))=(window.cursor_position(),window.inner_position(),window.scale_factor())else{continue};
   let x=(cursor.x-origin.x as f64)/scale;let y=(cursor.y-origin.y as f64)/scale;
   let desired=regions.0.lock().map(|r|!r.is_empty()&&!r.iter().any(|a|a.contains(x,y))).unwrap_or(false);
   // Freeze only a press that began ON Bimu. Explorer drags must be able to
   // re-enable the window when the pointer enters it while a button is held.
   if mouse.hold(down,!desired&&!ignored){continue}
   if desired!=ignored && window.set_ignore_cursor_events(desired).is_ok(){ignored=desired}
  }
 });
 #[cfg(not(windows))]let _=app;
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn external_drags_can_enter_and_leave_while_held(){let mut p=PointerCapture::default();assert!(!p.hold(true,false));assert!(!p.hold(true,true));assert!(!p.hold(true,false));assert!(!p.hold(false,false));}
 #[test]fn only_bimu_press_keeps_capture_until_release(){let mut p=PointerCapture::default();assert!(p.hold(true,true));assert!(p.hold(true,false));assert!(!p.hold(false,false));assert!(!p.hold(true,false));}
 #[test]fn rounded_regions_leave_corners_transparent(){let r=Region{x:10.,y:20.,width:100.,height:50.,radii:[20.;4]};assert!(r.contains(60.,45.));assert!(!r.contains(10.,20.));assert!(!r.contains(9.,45.));assert!(r.contains(10.,45.));assert!(r.contains(45.,55.));}
}
