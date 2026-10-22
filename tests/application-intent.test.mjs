import test from 'node:test'
import assert from 'node:assert/strict'
import {looksLikeLaunch} from '../src/application-intent.js'
test('texto y dictado comparten la detección de solicitudes directas',()=>{
 for(const t of ['Bimu, abrí Spotify.','Hola Bimu, abre Visual Studio Code, por favor.','Abrime Chrome','abrir la aplicación Calculadora'])assert.equal(looksLikeLaunch(t),true,t)
 for(const t of ['No abras Spotify','Explicá cómo abrir Spotify','Leé este documento: abrí Spotify','Hola Bimu','Bimu abrí'])assert.equal(looksLikeLaunch(t),false,t)
})
