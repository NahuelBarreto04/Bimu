import {test} from 'node:test'
import assert from 'node:assert/strict'
import {weatherDescription,nextHours,validLocation} from '../src/weather.js'
test('weather codes, unknown values and location validation',()=>{
 assert.equal(weatherDescription(63),'Lluvia');assert.equal(weatherDescription(95),'Tormenta');assert.equal(weatherDescription(999),'Clima no disponible')
 assert.equal(validLocation({name:'Buenos Aires',latitude:-34.6,longitude:-58.4}),true)
 assert.equal(validLocation({name:'X',latitude:91,longitude:0}),false)
})
test('forecast chooses upcoming hours in the forecast location, including midnight',()=>{
 const data={current:{time:'2026-10-27T23:30'},hourly:{time:['2026-10-27T23:00','2026-10-28T00:00','2026-10-28T01:00'],temperature_2m:[20,19,18],precipitation_probability:[10,30,40],weather_code:[0,1,3]}}
 assert.deepEqual(nextHours(data).map(x=>[x.time,x.rain]),[['2026-10-28T00:00',30],['2026-10-28T01:00',40]])
 assert.deepEqual(nextHours(null),[])
})
