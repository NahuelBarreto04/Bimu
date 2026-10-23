use serde::Deserialize;
#[derive(Deserialize)]pub struct Release{pub tag_name:String,#[serde(default)]pub draft:bool,#[serde(default)]pub prerelease:bool,pub assets:Vec<Asset>}
#[derive(Clone,Deserialize)]pub struct Asset{pub name:String,pub browser_download_url:String,pub size:u64,pub digest:Option<String>}
pub fn candidate(release:Release,current:&str)->Result<Option<(String,Asset)>,String>{
 let version=release.tag_name.strip_prefix('v').ok_or("Version de release invalida.")?;
 let next=semver::Version::parse(version).map_err(|_|"Version de release invalida.")?;
 let installed=semver::Version::parse(current).map_err(|_|"Version instalada invalida.")?;
 if release.draft||release.prerelease||!next.pre.is_empty()||next<=installed{return Ok(None)}
 let name=format!("Bimu_{version}_x64-setup.exe");let expected=format!("https://github.com/marianoarias1/Bimu/releases/download/v{version}/{name}");
 let asset=release.assets.into_iter().find(|a|a.name==name).ok_or("La version nueva todavia no tiene instalador Windows.")?;
 if asset.browser_download_url!=expected||asset.size==0||asset.size>512*1024*1024{return Err("Instalador no valido.".into())}
 let digest=asset.digest.as_deref().and_then(|s|s.strip_prefix("sha256:")).ok_or("GitHub no publico el SHA256 del instalador. No se descargara sin verificacion.")?;
 if digest.len()!=64||!digest.bytes().all(|b|b.is_ascii_hexdigit()){return Err("SHA256 del instalador invalido.".into())}
 Ok(Some((version.to_string(),asset)))
}
#[cfg(test)]mod tests{
 use super::*;
 fn release(version:&str)->Release{Release{tag_name:format!("v{version}"),draft:false,prerelease:false,assets:vec![Asset{name:format!("Bimu_{version}_x64-setup.exe"),browser_download_url:format!("https://github.com/marianoarias1/Bimu/releases/download/v{version}/Bimu_{version}_x64-setup.exe"),size:12,digest:Some(format!("sha256:{}","a".repeat(64)))}]}}
 #[test]fn accepts_only_new_stable_versions(){assert!(candidate(release("0.17.0"),"0.16.0").unwrap().is_some());assert!(candidate(release("0.16.0"),"0.17.0").unwrap().is_none());assert!(candidate(release("0.18.0-beta.1"),"0.17.0").unwrap().is_none());}
 #[test]fn rejects_foreign_downloads_and_missing_digest(){let mut r=release("0.17.0");r.assets[0].browser_download_url="https://example.com/installer.exe".into();assert!(candidate(r,"0.16.0").is_err());let mut r=release("0.17.0");r.assets[0].digest=None;assert!(candidate(r,"0.16.0").is_err());}
}
