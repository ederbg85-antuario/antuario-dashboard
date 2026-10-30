import {test} from 'node:test'
import assert from 'node:assert/strict'
import {calendarDays,meetingDay,meetingCounts,type Meeting} from '../lib/commercial-calendar'
import {wosAsset,wosVariants} from '../lib/wos-assets'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
test('calendar aligns Monday-first correctly and preserves leap days',()=>{assert.equal(calendarDays('2026-10').filter(Boolean).length,31);assert.equal(calendarDays('2026-10').indexOf('2026-10-01'),3);assert.equal(calendarDays('2028-02').filter(Boolean).length,29)})
test('meeting days and upcoming counts use Mexico time and exclude cancelled/completed future appointments',()=>{assert.equal(meetingDay('2026-10-12T01:00:00Z'),'2026-10-11');const m={id:'a',meeting_at:'2026-10-12T01:00:00Z',meeting_status:'scheduled'} as Meeting;const counts=meetingCounts([m,{...m,id:'b',meeting_status:'cancelled'},{...m,id:'c',meeting_status:'completed'},{...m,id:'d',meeting_at:'invalid'}],'2026-10-11T20:00:00Z');assert.equal(counts.upcoming,1);assert.equal(counts.today,2);assert.equal(counts.cancelled,1);assert.equal(counts.completed,1)})
test('each mascot variant has a distinct real asset and preserves peace as principal only',()=>{const paths=wosVariants.map(wosAsset);assert.equal(new Set(paths).size,paths.length);assert.equal(wosAsset('peace'),'/wos/wos-peace.webp');for(const path of paths)assert.equal(existsSync(resolve('public',path.slice(1))),true,path)})
