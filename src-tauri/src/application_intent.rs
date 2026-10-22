pub fn normalized(text:&str)->String{text.to_lowercase().chars().map(|c|match c{'á'|'à'|'ä'=>'a','é'|'è'|'ë'=>'e','í'|'ì'|'ï'=>'i','ó'|'ò'|'ö'=>'o','ú'|'ù'|'ü'=>'u',c if c.is_alphanumeric()=>c,_=>' '}).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")}
pub fn requested(text:&str)->Option<String>{
    if text.len()>512{return None}
    let mut text=normalized(text);for prefix in ["hola bimu ","bimu "]{if let Some(rest)=text.strip_prefix(prefix){text=rest.to_owned();break}}
    if let Some(rest)=text.strip_prefix("por favor "){text=rest.to_owned()}
    let rest=["abri ","abre ","abrir ","abrime ","inicia ","iniciar ","ejecuta "].iter().find_map(|p|text.strip_prefix(p))?;
    let mut name=rest.to_owned();for prefix in ["la aplicacion ","el programa ","la app "]{if let Some(rest)=name.strip_prefix(prefix){name=rest.to_owned();break}}
    if let Some(rest)=name.strip_suffix(" por favor"){name=rest.to_owned()};if name.is_empty(){None}else{Some(name)}
}

#[cfg(test)]mod tests{use super::*;#[test]fn recognizes_only_direct_requests(){assert_eq!(requested("Hola Bimu, abrí la aplicación Spotify, por favor."),Some("spotify".into()));assert_eq!(requested("Bimu abre VS Code"),Some("vs code".into()));assert_eq!(requested("No abras Spotify"),None);assert_eq!(requested("Explicá cómo abrir Spotify"),None);assert_eq!(requested("Leé el archivo que dice abrí Spotify"),None);assert_eq!(requested("abrí Spotify; calc.exe"),Some("spotify calc exe".into()));}}
