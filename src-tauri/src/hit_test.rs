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
#[derive(Default,Clone)]pub struct HitRegions(Arc<Mutex<Vec<Region>>>);
#[tauri::command]
pub fn desktop_hit_regions(regions:Vec<Region>,state:State<'_,HitRegions>)->Result<(),String>{
 if regions.len()>16||regions.iter().any(|r|[r.x,r.y,r.width,r.height].iter().chain(r.radii.iter()).any(|v|!v.is_finite())||r.width<0.||r.height<0.){return Err("Regiones de ventana invalidas.".into())}
 *state.inner().0.lock().map_err(|_|"No se pudo actualizar la ventana.")?=regions;Ok(())
}
pub fn start(app:tauri::AppHandle){
 #[cfg(windows)]
 std::thread::spawn(move||{
  let regions=app.state::<HitRegions>().inner().clone();let mut ignored=false;
  loop{
   std::thread::sleep(std::time::Duration::from_millis(20));
   let Some(window)=app.get_webview_window("main")else{break};
   // Never change the target while a mouse button is held (including dragging).
   use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState,VK_LBUTTON,VK_RBUTTON};
   if unsafe{GetAsyncKeyState(VK_LBUTTON as i32)}<0 || unsafe{GetAsyncKeyState(VK_RBUTTON as i32)}<0{continue}
   let (Ok(cursor),Ok(origin),Ok(scale))=(window.cursor_position(),window.inner_position(),window.scale_factor())else{continue};
   let x=(cursor.x-origin.x as f64)/scale;let y=(cursor.y-origin.y as f64)/scale;
   let desired=regions.0.lock().map(|r|!r.is_empty()&&!r.iter().any(|a|a.contains(x,y))).unwrap_or(false);
   if desired!=ignored && window.set_ignore_cursor_events(desired).is_ok(){ignored=desired}
  }
 });
 #[cfg(not(windows))]let _=app;
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn rounded_regions_leave_corners_transparent(){let r=Region{x:10.,y:20.,width:100.,height:50.,radii:[20.;4]};assert!(r.contains(60.,45.));assert!(!r.contains(10.,20.));assert!(!r.contains(9.,45.));assert!(r.contains(10.,45.));assert!(r.contains(45.,55.));}
}
