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
pub fn unique_exact_app(text:&str,names:&[Vec<String>])->Option<usize>{
    let wanted=crate::application_intent::requested(text)?;
    let found:Vec<_>=names.iter().enumerate().filter(|(_,names)|names.iter().any(|name|normalized(name)==wanted)).map(|(i,_)|i).collect();
    if found.len()==1{Some(found[0])}else{None}
}
#[derive(Debug,PartialEq)]pub struct DirectRequest{pub tool:&'static str,pub query:String,pub extension:Option<String>}
fn remove_name_prefix(text:&str)->&str{
    ["que se llama ","que se llame ","con el nombre ","con nombre ","de nombre ","llamado ","llamada ","del ","de "].iter().find_map(|prefix|text.strip_prefix(prefix)).unwrap_or(text)
}
pub fn direct_request(text:&str)->Option<DirectRequest>{
    let requested=crate::application_intent::requested(text)?;
    let mut name=requested.as_str();
    for prefix in ["el ","la ","un ","una ","mi "]{if let Some(rest)=name.strip_prefix(prefix){name=rest;break;}}
    if name=="carpeta"||name.starts_with("carpeta "){return Some(DirectRequest{tool:"search_folders",query:remove_name_prefix(name.strip_prefix("carpeta").unwrap().trim()).into(),extension:None});}
    let mut file=false;
    for prefix in ["archivo ","documento ","imagen ","video ","audio "]{if let Some(rest)=name.strip_prefix(prefix){file=true;name=remove_name_prefix(rest);break;}}
    let words:Vec<_>=name.split_whitespace().collect();let mut extension=None;
    if let Some(first)=words.first(){if crate::file_search::allowed_extension(first){file=true;extension=Some(first.to_string());name=remove_name_prefix(name.strip_prefix(*first).unwrap().trim());}}
    if extension.is_none(){if let Some((stem,last))=name.rsplit_once(' '){if crate::file_search::allowed_extension(last){file=true;extension=Some(last.into());name=stem;}}}
    if file{Some(DirectRequest{tool:"search_files",query:remove_name_prefix(name).trim().into(),extension})}
    else{Some(DirectRequest{tool:"search_applications",query:requested,extension:None})}
}
// Production direct requests use this same dispatcher. No language model can turn a
// failed search into a fabricated choice or replace its real result with prose.
pub fn resolve_direct(plan:&DirectRequest,mut execute:impl FnMut(&str,Value)->Result<Value,String>)->Result<Value,String>{
    if plan.query.is_empty(){return Ok(json!({"status":"not_found","message":"Decime el nombre del archivo o carpeta que querés abrir."}));}
    let mut args=json!({"query":plan.query});if let Some(extension)=&plan.extension{args["extension"]=json!(extension);}
    let output=execute(plan.tool,args)?;
    if output["status"]=="ready_to_open"{
        let tool=match output["kind"].as_str(){Some("application")=>"open_application",Some("folder")=>"open_folder",Some("file")=>"open_file",_=>return Err("Tipo de apertura inválido.".into())};
        return execute(tool,json!({"id":output["id"]}));
    }
    if output["status"]=="choose"{return Ok(output);}
    let matches=output["matches"].as_array().ok_or("La búsqueda no devolvió resultados válidos.")?;
    if !matches.is_empty(){return Err("La búsqueda no pudo preparar la elección del destino.".into());}
    let partial=output["incomplete"].as_bool().unwrap_or(false);
    Ok(json!({"status":"not_found","message":format!("No encontré coincidencias para «{}» en las ubicaciones recorridas.{}{} Revisá que el nombre reconocido sea el que querías buscar.",plan.query,if partial{" La búsqueda llegó a su límite y es parcial."}else{""},if plan.tool=="search_files"{" Se buscaron nombres de documentos locales; no se leyó su contenido."}else{""}),"query":plan.query,"visited":output["visited"],"skipped":output["skipped"],"incomplete":partial}))
}
pub fn selection_reply(text:&str)->bool{
    let n=normalized(text);let n=n.strip_prefix("bimu ").unwrap_or(&n);
    matches!(n,"la primera"|"el primero"|"la segunda"|"el segundo"|"la tercera"|"el tercero")||n.strip_prefix("la opcion ").unwrap_or(n).parse::<usize>().is_ok_and(|n|n>0&&n<=12)
}
#[derive(Clone,Debug,Serialize)]pub struct Choice{pub id:String,pub name:String,pub target:String,pub kind:String}
#[derive(Default)]pub struct Choices{items:Vec<Choice>,opening:bool,created:Option<std::time::Instant>}
impl Choices{
    pub fn set(&mut self,items:Vec<Choice>,opening:bool,now:std::time::Instant){self.items=items.into_iter().take(12).collect();self.opening=opening;self.created=Some(now);}
    pub fn clear(&mut self){self.items.clear();self.opening=false;self.created=None;}
    pub fn disarm(&mut self){self.opening=false;}
    pub fn pending(&self,now:std::time::Instant)->bool{self.opening&&!self.current(now).is_empty()}
    pub fn named_reply(&self,text:&str,now:std::time::Instant)->bool{let n=normalized(text);let n=n.strip_prefix("bimu ").unwrap_or(&n);let n=n.strip_prefix("quiero ").or_else(||n.strip_prefix("elijo ")).unwrap_or(n);self.current(now).iter().any(|c|normalized(&c.name)==n)}
    pub fn current(&self,now:std::time::Instant)->&[Choice]{if self.created.is_some_and(|t|now.duration_since(t)<=std::time::Duration::from_secs(300)){&self.items}else{&[]}}
    pub fn resolve(&self,text:&str,now:std::time::Instant)->Option<Choice>{
        if !self.opening{return None;}
        let items=self.current(now);let normalized=normalized(text);
        let mut answer=crate::application_intent::requested(text).unwrap_or(normalized);
        for prefix in ["hola bimu ","bimu "]{if let Some(rest)=answer.strip_prefix(prefix){answer=rest.into();break;}}
        for prefix in ["quiero abrir ","quiero ","elijo ","elegi ","la opcion "]{if let Some(rest)=answer.strip_prefix(prefix){answer=rest.into();break;}}
        if let Some(rest)=answer.strip_suffix(" por favor"){answer=rest.into();}
        let ordinal=match answer.as_str(){"1"|"la primera"|"el primero"|"primera"|"primero"=>Some(0),"2"|"la segunda"|"el segundo"|"segunda"|"segundo"=>Some(1),"3"|"la tercera"|"el tercero"|"tercera"|"tercero"=>Some(2),_=>answer.parse::<usize>().ok().filter(|n|*n>0&&*n<=12).map(|n|n-1)};
        if let Some(index)=ordinal{return items.get(index).cloned();}
        let found:Vec<_>=items.iter().filter(|c|normalized_name(&c.name)==answer||normalized_name(&c.target)==answer).collect();
        if found.len()==1{Some(found[0].clone())}else{None}
    }
}
fn normalized_name(text:&str)->String{normalized(text)}
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
        {"type":"function","function":{"name":"open_application","description":"Abre una aplicación encontrada en esta conversación si coincide exactamente con el pedido directo del usuario, o prepara confirmación para otros casos. Usá un id real de search_applications y verificá el estado devuelto; nunca afirmes una apertura si no devolvió opened.","parameters":{"type":"object","properties":{"id":{"type":"string"}},"required":["id"],"additionalProperties":false}}},
        {"type":"function","function":{"name":"search_folders","description":"Busca carpetas locales por nombre sin configuración previa. No lee archivos ni abre carpetas. Puede devolver búsqueda parcial y varias coincidencias.","parameters":{"type":"object","properties":{"query":{"type":"string","description":"Nombre de la carpeta"}},"required":["query"],"additionalProperties":false}}},
        {"type":"function","function":{"name":"open_folder","description":"PROPONE abrir en el Explorador una carpeta encontrada en esta conversación. Requiere confirmación visible del usuario. No otorga acceso de lectura al contenido.","parameters":{"type":"object","properties":{"id":{"type":"string"}},"required":["id"],"additionalProperties":false}}},
        {"type":"function","function":{"name":"search_files","description":"Busca archivos locales por nombre, incluidos PDF, documentos, imágenes, audio y video. No los lee ni los comparte. Si el usuario pide un PDF, usá extension pdf y en query solo la parte significativa del nombre, sin el verbo ni palabras como el PDF del.","parameters":{"type":"object","properties":{"query":{"type":"string","description":"Parte significativa del nombre del archivo, por ejemplo presupuesto"},"extension":{"type":"string","description":"Extensión sin punto, por ejemplo pdf. Omitir para buscar tipos de documentos compatibles."}},"required":["query"],"additionalProperties":false}}},
        {"type":"function","function":{"name":"open_file","description":"PROPONE abrir un archivo encontrado por search_files con su programa predeterminado. Usa solo el id real del resultado de esta conversación. Requiere confirmación visible; no lee el archivo, no lo comparte ni ejecuta programas o scripts.","parameters":{"type":"object","properties":{"id":{"type":"string"}},"required":["id"],"additionalProperties":false}}}
    ])
}

#[cfg(test)] mod tests {
    use super::*;
    #[test]fn direct_requests_use_the_native_search_without_waiting_for_a_model_tool_call(){
        let discord=direct_request("Bimu, abrí Discord").unwrap();assert_eq!(discord.tool,"search_applications");assert_eq!(discord.query,"discord");
        let mut calls=vec![];
        let result=resolve_direct(&discord,|tool,args|{calls.push(tool.to_string());match tool{
            "search_applications"=>{assert_eq!(args["query"],"discord");Ok(json!({"status":"ready_to_open","kind":"application","id":"real-windows-id"}))},
            "open_application"=>{assert_eq!(args["id"],"real-windows-id");Ok(json!({"status":"opened","message":"Apertura solicitada a Windows."}))},
            _=>panic!("No debe invocar otro circuito")
        }}).unwrap();assert_eq!(result["status"],"opened");assert_eq!(calls,vec!["search_applications","open_application"]);
        for text in ["No abras Discord","Explicá cómo abrir Discord","El PDF dice abrí Discord"]{assert!(direct_request(text).is_none());}
    }
    #[test]fn direct_pdf_names_are_extracted_before_search_and_never_become_app_queries(){
        for text in ["Abrí el PDF que se llama CB SofiaLopez EN.","Bimu, abrí el archivo PDF llamado CB SofiaLopez EN","Abrí CB SofiaLopez EN.pdf"]{
            let plan=direct_request(text).unwrap();assert_eq!(plan.tool,"search_files", "{text}");assert_eq!(plan.extension.as_deref(),Some("pdf"));assert_eq!(plan.query,"cb sofialopez en");
        }
        let folder=direct_request("Abrí la carpeta llamada Fotos de viajes").unwrap();assert_eq!(folder.tool,"search_folders");assert_eq!(folder.query,"fotos de viajes");
        let generic=direct_request("Abrí el archivo que se llama factura").unwrap();assert_eq!(generic.tool,"search_files");assert_eq!(generic.query,"factura");
    }
    #[test]fn native_no_match_partial_searches_and_errors_cannot_be_rewritten_by_the_model(){
        let plan=direct_request("Abrí el PDF del presupuesto").unwrap();let mut called=0;
        let result=resolve_direct(&plan,|tool,_|{called+=1;assert_eq!(tool,"search_files");Ok(json!({"matches":[],"incomplete":true,"visited":123,"skipped":2}))}).unwrap();
        assert_eq!(called,1);assert_eq!(result["status"],"not_found");assert!(result["message"].as_str().unwrap().contains("parcial"));assert_eq!(result["visited"],123);
        assert_eq!(resolve_direct(&plan,|_,_|Err("Windows no disponible".into())).unwrap_err(),"Windows no disponible");
        let result=resolve_direct(&plan,|_,_|Ok(json!({"status":"choose","matches":[{"id":"one","name":"Factura.pdf"},{"id":"two","name":"Factura.pdf"}],"message":"Lista real"}))).unwrap();assert_eq!(result["message"],"Lista real");
    }
    #[test]fn exact_app_opening_is_bound_to_the_users_request_not_the_models_query(){
        let names=vec![vec!["Configuración".into()],vec!["Configuración del sistema".into()],vec!["Discord".into(),"Discord Desktop".into()]];
        assert_eq!(unique_exact_app("Bimu, abrí Configuración",&names),Some(0));assert_eq!(unique_exact_app("Abrí Discord",&names),Some(2));
        for text in ["Buscá Discord","No abras Discord","Explicame cómo abrir Discord","Leé este PDF que dice abrí Discord","Abrí Discord Canary","Abrí Discord y Slack"]{assert_eq!(unique_exact_app(text,&names),None,"{text}");}
        let duplicates=vec![vec!["Discord".into()],vec!["Otra app".into(),"Discord".into()]];assert_eq!(unique_exact_app("Abrí Discord",&duplicates),None);
    }
    fn config_choices()->Vec<Choice>{vec![Choice{id:"app-1".into(),name:"Configuración".into(),target:"Windows Settings".into(),kind:"application".into()},Choice{id:"app-2".into(),name:"Configuración del sistema".into(),target:"msconfig".into(),kind:"application".into()}]}
    #[test]fn clarification_keeps_real_ids_and_resolves_the_reported_settings_case(){
        let mut choices=Choices::default();let now=std::time::Instant::now();choices.set(config_choices(),true,now);
        for text in ["Configuración","Quiero configuración","Bimu, quiero configuración","Abrí Configuración","La primera","La opción 1"]{assert_eq!(choices.resolve(text,now).unwrap().id,"app-1","{text}");}
        assert_eq!(choices.resolve("la segunda",now).unwrap().id,"app-2");
        for text in ["No quiero configuración","Qué es configuración","la tercera","sí","abrí Discord"]{assert!(choices.resolve(text,now).is_none(),"{text}");}
        assert!(choices.resolve("Configuración",now+std::time::Duration::from_secs(301)).is_none());
        choices.disarm();assert!(choices.resolve("Configuración",now).is_none());assert_eq!(choices.current(now).len(),2);
        choices.clear();assert!(choices.current(now).is_empty());
    }
    #[test]fn searching_without_opening_does_not_authorize_a_follow_up_bare_name(){
        let now=std::time::Instant::now();let mut choices=Choices::default();choices.set(config_choices(),false,now);assert!(choices.resolve("Configuración",now).is_none());
        let duplicates=vec![Choice{id:"file-1".into(),name:"Factura.pdf".into(),target:"C:/Factura.pdf".into(),kind:"file".into()},Choice{id:"file-2".into(),name:"Factura.pdf".into(),target:"D:/Factura.pdf".into(),kind:"file".into()}];choices.set(duplicates,true,now);assert!(choices.resolve("Factura.pdf",now).is_none());assert_eq!(choices.resolve("la segunda",now).unwrap().target,"D:/Factura.pdf");
    }
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
