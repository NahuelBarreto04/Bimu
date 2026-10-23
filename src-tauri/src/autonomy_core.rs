use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use crate::application_intent::normalized;

#[derive(Clone, Deserialize, Debug)]
pub struct InstalledApp {
    #[serde(rename = "Name")] pub name: String,
    #[serde(rename = "AppID")] pub app_id: String,
}

// Only identifiers obtained from Windows are ever used as AppsFolder destinations.
pub fn valid_app_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 1024 && !id.chars().any(|c| c.is_control() || matches!(c, '"' | '\'' | '\r' | '\n'))
}
pub fn installed_apps(bytes: &[u8]) -> Result<Vec<InstalledApp>, String> {
    if bytes.len() > 2 * 1024 * 1024 { return Err("La lista de aplicaciones es demasiado grande.".into()); }
    let text = std::str::from_utf8(bytes).map_err(|_| "Windows devolvió una lista inválida.")?.trim_start_matches('\u{feff}').trim();
    if text.is_empty() || text == "null" { return Ok(vec![]); }
    let values: Vec<InstalledApp> = serde_json::from_str(text).map_err(|_| "No se pudo leer la lista de aplicaciones de Windows.")?;
    if values.len() > 5000 { return Err("Windows devolvió demasiadas aplicaciones.".into()); }
    Ok(values.into_iter().filter(|a| !a.name.trim().is_empty() && a.name.len() <= 300 && valid_app_id(&a.app_id)).collect())
}
pub fn query(value: &Value, field: &str) -> Result<String, String> {
    let value = value.get(field).and_then(Value::as_str).ok_or_else(|| format!("Falta el argumento {field}."))?.trim();
    if value.is_empty() || value.len() > 160 || value.chars().any(char::is_control) { return Err(format!("El argumento {field} no es válido.")); }
    Ok(value.to_owned())
}
pub fn arguments(value: Value) -> Result<Value, String> {
    let value = if let Value::String(text) = value { serde_json::from_str(&text).map_err(|_| "Los argumentos no son JSON válido.")? } else { value };
    if !value.is_object() { return Err("Los argumentos deben ser un objeto.".into()); }
    Ok(value)
}
pub fn score(name: &str, query: &str) -> u8 {
    let name = normalized(name); let query = normalized(query);
    if query.is_empty() { return 0; }
    if name == query { 3 } else if name.starts_with(&query) { 2 } else if query.split_whitespace().all(|word| name.contains(word)) { 1 } else { 0 }
}
pub fn time_at(timezone: &str, now: chrono::DateTime<chrono::Utc>) -> Result<Value, String> {
    if timezone == "local" {
        let local = now.with_timezone(&chrono::Local);
        return Ok(json!({"timezone":"local", "datetime":local.to_rfc3339(), "time":local.format("%H:%M:%S").to_string(), "date":local.format("%Y-%m-%d").to_string(), "source":"Reloj del equipo"}));
    }
    let tz: chrono_tz::Tz = timezone.parse().map_err(|_| "Usá una zona IANA válida, por ejemplo America/Jamaica o America/Argentina/Buenos_Aires.")?;
    let local = now.with_timezone(&tz);
    Ok(json!({"timezone":timezone, "datetime":local.to_rfc3339(), "time":local.format("%H:%M:%S").to_string(), "date":local.format("%Y-%m-%d").to_string(), "source":"Reloj del equipo y zonas IANA"}))
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Proposal { pub id: u64, pub kind: String, pub name: String, pub target: String }

#[derive(Debug)]
pub struct Pending<T> { pub proposal: Proposal, pub destination: T, created: std::time::Instant }
pub struct Confirmations<T> { counter: u64, pending: Option<Pending<T>> }
impl<T> Default for Confirmations<T> { fn default()->Self {Self{counter:0,pending:None}} }
impl<T> Confirmations<T> {
    pub fn propose(&mut self, kind:String, name:String, target:String, destination:T, now:std::time::Instant)->Result<Proposal,String> {
        if self.pending.as_ref().is_some_and(|p|now.duration_since(p.created)>std::time::Duration::from_secs(300)){self.pending=None;}
        if self.pending.is_some(){return Err("Confirmá o cancelá la apertura pendiente.".into());}
        self.counter=self.counter.wrapping_add(1);
        let proposal=Proposal{id:self.counter,kind,name,target};
        self.pending=Some(Pending{proposal:proposal.clone(),destination,created:now});Ok(proposal)
    }
    pub fn take(&mut self,id:u64,now:std::time::Instant)->Result<Pending<T>,String> {
        if !self.pending.as_ref().is_some_and(|p|p.proposal.id==id){return Err("La solicitud cambió. Volvé a pedir la apertura.".into());}
        let pending=self.pending.take().unwrap();
        if now.duration_since(pending.created)>std::time::Duration::from_secs(300){return Err("La confirmación venció. Volvé a pedir la apertura.".into());}
        Ok(pending)
    }
    pub fn cancel(&mut self,id:u64) {if self.pending.as_ref().is_some_and(|p|p.proposal.id==id){self.pending=None;}}
}
pub fn definitions() -> Value {
    json!([
        {"type":"function","function":{"name":"get_current_time","description":"Consulta la fecha y hora REAL del reloj del equipo en cualquier zona horaria. Para lugares convertí el nombre a una zona IANA, por ejemplo Jamaica -> America/Jamaica. No necesita Internet.","parameters":{"type":"object","properties":{"timezone":{"type":"string","description":"Zona IANA, o local para la hora del usuario"}},"required":["timezone"],"additionalProperties":false}}},
        {"type":"function","function":{"name":"search_applications","description":"Busca aplicaciones instaladas de Windows por nombre, sin registro manual. No abre nada. Devuelve candidatos con identificadores; si hay varios preguntá cuál quiere el usuario.","parameters":{"type":"object","properties":{"query":{"type":"string","description":"Nombre de la aplicación, sin verbos ni instrucciones"}},"required":["query"],"additionalProperties":false}}},
        {"type":"function","function":{"name":"open_application","description":"PROPONE abrir una aplicación encontrada por search_applications EN ESTE pedido. Solo prepara una confirmación visible: todavía no la abre. Usá únicamente un id devuelto por la búsqueda y solo si el usuario pidió abrirla.","parameters":{"type":"object","properties":{"id":{"type":"string"}},"required":["id"],"additionalProperties":false}}},
        {"type":"function","function":{"name":"search_folders","description":"Busca carpetas locales por nombre sin configuración previa. No lee archivos ni abre carpetas. Puede devolver búsqueda parcial y varias coincidencias.","parameters":{"type":"object","properties":{"query":{"type":"string","description":"Nombre de la carpeta"}},"required":["query"],"additionalProperties":false}}},
        {"type":"function","function":{"name":"open_folder","description":"PROPONE abrir en el Explorador una carpeta encontrada por search_folders EN ESTE pedido. Requiere confirmación visible del usuario. No otorga acceso de lectura al contenido.","parameters":{"type":"object","properties":{"id":{"type":"string"}},"required":["id"],"additionalProperties":false}}}
    ])
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn windows_catalog_is_bounded_and_keeps_unicode() {
        let list = installed_apps("[{\"Name\":\"Fotos de José\",\"AppID\":\"Microsoft.Photos_abc!App\"},{\"Name\":\"Bad\",\"AppID\":\"x\\ncalc\"}]".as_bytes()).unwrap();
        assert_eq!(list.len(),1); assert_eq!(list[0].name,"Fotos de José");
        assert!(installed_apps(b"not json").is_err()); assert!(installed_apps(&vec![b' ';2*1024*1024+1]).is_err());
        assert!(installed_apps(b"[]").unwrap().is_empty());
    }
    #[test] fn ranks_specific_names_and_rejects_empty_queries() {
        assert_eq!(score("Discord","discord"),3); assert_eq!(score("Discord Canary","discord"),2);
        assert_eq!(score("Google Chrome","chrome"),1); assert_eq!(score("Chrome",""),0); assert_eq!(score("Slack","discord"),0);
        assert!(query(&json!({"query":"\n"}),"query").is_err()); assert!(arguments(json!("[]")).is_err());
        assert_eq!(arguments(json!("{\"query\":\"Discord\"}")).unwrap()["query"],"Discord");
    }
    #[test] fn time_uses_real_timezone_rules_and_date_boundaries() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-01-01T02:30:00Z").unwrap().with_timezone(&chrono::Utc);
        let jamaica = time_at("America/Jamaica",now).unwrap(); assert_eq!(jamaica["time"],"21:30:00"); assert_eq!(jamaica["date"],"2025-12-31");
        let summer = chrono::DateTime::parse_from_rfc3339("2026-07-01T12:00:00Z").unwrap().with_timezone(&chrono::Utc);
        assert_eq!(time_at("Europe/Madrid",summer).unwrap()["time"],"14:00:00");
        assert!(time_at("Jamaica-no-existe",now).is_err()); assert!(time_at("local",now).is_ok());
    }
    #[test] fn confirmation_binds_to_the_original_destination_and_is_consumed_once() {
        let mut queue=Confirmations::default();let now=std::time::Instant::now();
        let first=queue.propose("application".into(),"Discord".into(),"Windows ID".into(),"actual-os-id",now).unwrap();
        assert!(queue.take(first.id+1,now).is_err());
        assert!(queue.propose("application".into(),"Other".into(),"Other".into(),"wrong",now).is_err());
        assert_eq!(queue.take(first.id,now).unwrap().destination,"actual-os-id");assert!(queue.take(first.id,now).is_err());
        let next=queue.propose("folder".into(),"Fotos".into(),"C:/Fotos".into(),"real-folder",now).unwrap();
        queue.cancel(first.id);assert_eq!(queue.take(next.id,now).unwrap().destination,"real-folder");
    }
    #[test] fn cancellation_and_expiry_cannot_launch_or_leave_a_reusable_permission() {
        let mut queue=Confirmations::default();let now=std::time::Instant::now();
        let make=|q:&mut Confirmations<&str>,time|q.propose("application".into(),"App".into(),"App".into(),"dest",time).unwrap();
        let first=make(&mut queue,now);queue.cancel(first.id);assert!(queue.take(first.id,now).is_err());
        let second=make(&mut queue,now);let later=now+std::time::Duration::from_secs(301);assert!(queue.take(second.id,later).unwrap_err().contains("venció"));
        let third=make(&mut queue,later);assert_ne!(first.id,third.id);
        let fourth=make(&mut queue,later+std::time::Duration::from_secs(301));assert!(queue.take(third.id,later+std::time::Duration::from_secs(301)).is_err());assert!(queue.take(fourth.id,later+std::time::Duration::from_secs(301)).is_ok());
    }
}
