export function validTimezone(value) {
  if (typeof value !== 'string' || !value) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return value; } catch { return null; }
}
export function timezoneOffset(timezone, now = Date.now()) {
  if (!validTimezone(timezone)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type,p.value]));
  return (Date.UTC(+parts.year, +parts.month-1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(now / 1000) * 1000) / 1000;
}
export function localClock({ timezone, utcOffsetSeconds } = {}, now = Date.now()) {
  const zone = validTimezone(timezone);
  const offset = zone ? timezoneOffset(zone, now) : utcOffsetSeconds;
  if (!Number.isFinite(offset) || Math.abs(offset) > 14 * 3600) return null;
  const local = new Date(now + offset * 1000);
  const date = local.toISOString().slice(0,10), time = local.toISOString().slice(11,19);
  const sign = offset < 0 ? '-' : '+';
  const pad = n => String(Math.floor(n)).padStart(2,'0');
  const utc = `UTC${sign}${pad(Math.abs(offset)/3600)}:${pad(Math.abs(offset)%3600/60)}`;
  const beijingDate = new Date(now + 8 * 3600 * 1000).toISOString().slice(0,10);
  return { date, time, weekday: ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][local.getUTCDay()],
    dateLabel: `${date.slice(0,4)}年${date.slice(5,7)}月${date.slice(8,10)}日`,
    timezone: zone, utc, beijingDate,
    dateDifference: date < beijingDate ? '当地比北京时间晚一天' : date > beijingDate ? '当地比北京时间早一天' : '',
  };
}
