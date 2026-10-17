import test from 'node:test';
import assert from 'node:assert/strict';
import { localClock, timezoneOffset, validTimezone } from '../shared/local-time.mjs';

test('local clock shows destination date across the date line and calendar year',()=>{
 const now=Date.parse('2026-12-31T23:30:00Z');
 const la=localClock({timezone:'America/Los_Angeles'},now);
 assert.equal(la.date,'2026-12-31');assert.equal(la.time,'15:30:00');assert.equal(la.utc,'UTC-08:00');
 assert.equal(la.dateLabel,'2026年12月31日');assert.equal(la.dateDifference,'当地比北京时间晚一天');
 const nz=localClock({timezone:'Pacific/Auckland'},now);
 assert.equal(nz.date,'2027-01-01');assert.equal(nz.time,'12:30:00');assert.equal(nz.weekday,'星期五');
 const east=localClock({timezone:'Pacific/Kiritimati'},Date.parse('2026-10-17T10:30:00Z'));
 assert.equal(east.date,'2026-10-18');assert.equal(east.dateDifference,'当地比北京时间早一天');
});

test('IANA time zones handle US DST transitions and half-hour and quarter-hour zones',()=>{
 const before=localClock({timezone:'America/New_York'},Date.parse('2026-11-01T05:30:00Z'));
 const after=localClock({timezone:'America/New_York'},Date.parse('2026-11-01T06:30:00Z'));
 assert.equal(before.time,'01:30:00');assert.equal(after.time,'01:30:00');
 assert.equal(before.utc,'UTC-04:00');assert.equal(after.utc,'UTC-05:00');
 const spring=localClock({timezone:'America/New_York'},Date.parse('2026-03-08T07:00:00Z'));
 assert.equal(spring.time,'03:00:00');
 const now=Date.parse('2026-10-17T00:00:00Z');
 assert.equal(localClock({timezone:'Asia/Kathmandu'},now).utc,'UTC+05:45');
 assert.equal(localClock({timezone:'Asia/Kolkata'},now).time,'05:30:00');
 assert.equal(timezoneOffset('Asia/Vladivostok',now),36000);
 assert.equal(timezoneOffset('Europe/Moscow',now),10800);
});

test('unknown time zones do not silently fall back to Beijing',()=>{
 assert.equal(validTimezone('invalid/timezone'),null);
 assert.equal(localClock({timezone:'invalid/timezone'},0),null);
 assert.equal(localClock({},0),null);
 assert.equal(localClock({utcOffsetSeconds:-7*3600},0).date,'1969-12-31');
});
