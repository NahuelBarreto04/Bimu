export function weatherDescription(code) {
  if (code === 0) return 'Despejado'
  if (code === 1) return 'Mayormente despejado'
  if (code === 2) return 'Parcialmente nublado'
  if (code === 3) return 'Nublado'
  if ([45,48].includes(code)) return 'Niebla'
  if ([51,53,55,56,57].includes(code)) return 'Llovizna'
  if ([61,63,65,66,67,80,81,82].includes(code)) return 'Lluvia'
  if ([71,73,75,77,85,86].includes(code)) return 'Nieve'
  if ([95,96,99].includes(code)) return 'Tormenta'
  return 'Clima no disponible'
}
export function nextHours(data, count=4) {
  const h=data?.hourly, now=data?.current?.time
  if (!h?.time || !now) return []
  return h.time.map((time,i)=>({time,temperature:h.temperature_2m?.[i],rain:h.precipitation_probability?.[i],code:h.weather_code?.[i]})).filter(hour=>hour.time>now.slice(0,13)+':00').slice(0,count)
}
export function validLocation(loc) { return !!loc && typeof loc.name==='string' && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) && Math.abs(loc.latitude)<=90 && Math.abs(loc.longitude)<=180 }
