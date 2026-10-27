import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseSyncedLyrics,lyricIndex} from '../src/lyrics.js'
test('extracts and sorts multiple timestamps and ignores metadata',()=>{
 const lines=parseSyncedLyrics('[ar:Artist]\n[00:03.50][00:01.25]Hello\n[00:05.100]World\n[00:80.00]bad')
 assert.deepEqual(lines,[{time:1.25,text:'Hello'},{time:3.5,text:'Hello'},{time:5.1,text:'World'}])
 assert.equal(lyricIndex(lines,0),-1);assert.equal(lyricIndex(lines,3.7),1);assert.equal(lyricIndex(lines,9),2)
})
