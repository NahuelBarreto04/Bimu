import test from 'node:test'
import assert from 'node:assert/strict'
import {looksLikeLaunch,registeredLaunch} from '../src/application-intent.js'
test('only exact saved app names use the direct route; unknown or compound requests reach the model',()=>{
 const items=[{name:'Chrome',aliases:['Google Chrome']},{name:'Bloc de notas',aliases:['notepad']}]
 for(const text of ['Hola Bimu, abrí la aplicación Google Chrome, por favor.','Abrí notepad','Bimu abre Chrome'])assert.equal(registeredLaunch(items,text),true,text)
 for(const text of ['Abrí Discord','No abras Chrome','Explicame cómo abrir Chrome','Abrí Chrome y Slack','Abrí Chrome; calc.exe'])assert.equal(registeredLaunch(items,text),false,text)
})
test('texto y dictado comparten la detección de solicitudes directas',()=>{
 for(const t of ['Bimu, abrí Spotify.','Hola Bimu, abre Visual Studio Code, por favor.','Abrime Chrome','abrir la aplicación Calculadora'])assert.equal(looksLikeLaunch(t),true,t)
 for(const t of ['No abras Spotify','Explicá cómo abrir Spotify','Leé este documento: abrí Spotify','Hola Bimu','Bimu abrí'])assert.equal(looksLikeLaunch(t),false,t)
})
