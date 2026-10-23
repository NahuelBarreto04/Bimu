import React from 'react'
const LABELS={off:'Desactivada',waiting:'Esperando el motor local para recuperar la escucha…',starting:'Preparando el micrófono…',calibrating:'Midiendo el ruido del ambiente…',listening:'Escuchando «Bimu»',speech:'Detectando una frase…',transcribing:'Reconociendo en tu equipo…',armed:'Te escucho: decí tu pedido',paused:'Pausada mientras termina la operación'}
export function WakeIndicator({wake,notice,pending,onConfirm,onCancel}){
 if(!wake.enabled&&!notice&&!pending)return null
 const state=pending?'idle':notice?.state||'idle'
 const showGlow=!!notice||!!pending||wake.engaged
 return <><div className={'wake-glow '+state+(showGlow?' visible':'')} aria-hidden="true"/>
 {wake.enabled&&<button className="wake-stop" type="button" aria-label="Desactivar escucha de Bimu" title={LABELS[wake.phase]+' · Desactivar escucha'} onClick={wake.stop}>×</button>}
 {(notice||pending)&&<div className="wake-bubble" role="status" aria-live="polite"><span>{pending?(pending.kind==='shortcut'?'¿Ejecuto ':'¿Abro ')+pending.name+'?':notice.text}</span>{pending&&<div><button onClick={onConfirm}>{pending.kind==='shortcut'?'Ejecutar':'Abrir'}</button><button onClick={onCancel}>Cancelar</button></div>}</div>}</>
}
export function WakeSettings({wake}){
 const sensitivity=Math.round(1+(.025-wake.threshold)/.0245*99)
 return <section className="wake-settings glass-card" aria-label="Activación por Bimu">
  <h2>Decí «Bimu»</h2><p>Activá la escucha y decí “Bimu, abrí Spotify” sin tocar el micrófono. Sigue disponible con el notch pequeño.</p>
  <div><button disabled={wake.enabled} onClick={wake.start}>Activar escucha de Bimu</button><button disabled={!wake.enabled&&!wake.preferred} onClick={wake.stop}>Desactivar escucha</button></div>
  <p role="status">{LABELS[wake.phase]}</p><small>{wake.preferred?'Preferencia guardada: recuperar la escucha al abrir Bimu.':'Preferencia guardada: iniciar con la escucha apagada.'}</small>
  {wake.last&&<p>Último pedido: {wake.last}</p>}{wake.error&&<p role="alert" className="ollama-error">{wake.error}</p>}
  <MicrophoneLevel wake={wake}/>
  <label>Sensibilidad del micrófono <output>{sensitivity}%</output><input disabled={wake.calibrating} aria-label="Sensibilidad del micrófono" type="range" min="1" max="100" step="1" value={sensitivity} onChange={e=>wake.setThreshold(.025-(Number(e.target.value)-1)/99*.0245)}/></label>
  <small>Mayor sensibilidad permite detectar voces más bajas. Si también detecta el ruido del ambiente, calibrá el micrófono o bajá un poco este ajuste.</small>
  <label>Espera al terminar de hablar<select disabled={wake.calibrating} value={wake.silenceMs} onChange={e=>wake.setSilenceMs(e.target.value)}><option value={700}>Rápida · 0,7 s</option><option value={1200}>Equilibrada · 1,2 s</option><option value={1600}>Pausas largas · 1,6 s</option></select></label>
  <small>La opción rápida reduce la espera, pero puede separar el nombre del pedido si hacés una pausa. Sensibilidad, calibración y espera se guardan en este equipo.</small>
  <WakeDiagnostics wake={wake}/>
  <p>La detección de voz y el reconocimiento de palabras son pasos distintos. Si el medidor muestra voz detectada pero Bimu no reconoce su nombre, revisá el diagnóstico de escucha. El audio bajo se amplifica de forma limitada antes de enviarse a Whisper.</p>
  <p>Modo experimental con Whisper local: transcribe localmente las frases con voz para detectar el nombre y consume más CPU que el dictado manual. Las frases sin activación se descartan sin agregarlas al chat. El motor se administra desde Ajustes → Configuración de Voz. Durante la transcripción hay una pausa de escucha; para empezar, decí el nombre y el pedido en una misma frase.</p>
  <p>Para abrir sin confirmación, habilitá “Abrir sin volver a preguntar” en la aplicación correspondiente. Los comandos de voz no se guardan en el historial y conservan la vista actual. Los pedidos no reconocidos muestran una burbuja. Bimu recuerda si activaste la escucha y la recupera al abrirse. Desactivarla desde estos botones o con × guarda la elección apagada. Ocultar la ventana pausa el micrófono sin borrar tu preferencia; mostrarla vuelve a recuperarla.</p>
 </section>
}

function MicrophoneLevel({wake}){
 const position=value=>Math.max(0,Math.min(100,(20*Math.log10(Math.max(.000001,value))+70)/60*100))
 const level=wake.level,percent=level?position(level.rms):0
 const status=wake.calibrating?'No hables durante dos segundos.':!wake.enabled?'Activá la escucha para ver el nivel del micrófono.':wake.phase==='transcribing'?'Voz capturada. Reconociendo las palabras…':!level?'Esperando señal del micrófono…':level.speaking?'Voz detectada':level.rms>=level.threshold?'Nivel suficiente para detectar voz':'La señal está por debajo del nivel de detección'
 return <section className="microphone-level" aria-label="Nivel y calibración del micrófono"><h3>Probá tu voz</h3><div className={'microphone-meter'+(level?.speaking?' detecting':'')} role="meter" aria-label="Nivel de entrada del micrófono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{width:percent+'%'}}/>{level&&<i style={{left:position(level.threshold)+'%'}} title="Nivel mínimo de detección"/>}</div><p role="status">{status}</p><small>La línea marca el nivel necesario para empezar a detectar una frase. Hablá con tu volumen habitual.</small>
 <div className="calibration-actions">{wake.calibrating?<button onClick={wake.cancelCalibration}>Cancelar calibración</button>:<button disabled={!wake.enabled||['starting','paused','transcribing'].includes(wake.phase)} onClick={wake.calibrate}>Calibrar ruido de fondo · 2 s</button>}<button disabled={wake.calibrating||!wake.calibrated} onClick={wake.resetCalibration}>Quitar calibración</button></div>
 {wake.calibrating&&<progress aria-label="Calibración de ruido de fondo" value={level?.progress||0} max={1}/>}<small>{wake.calibrated?'Calibración guardada para este micrófono.':'Este micrófono está usando la sensibilidad sin calibración.'}</small>{wake.calibrationNotice&&<p role="status">{wake.calibrationNotice}</p>}</section>
}

function WakeDiagnostics({wake}){
 const m=wake.metrics
 return <section className="wake-diagnostics" aria-label="Diagnóstico de escucha"><h3>Medir la escucha</h3><p>Mediciones de esta sesión, sin guardar audio ni transcripciones. Activá la medición y probá cinco veces “Bimu” y cinco pedidos completos, intercalando frases sin su nombre.</p><button onClick={wake.toggleDiagnostics}>{wake.diagnostics?'Detener medición':'Iniciar medición'}</button>{(wake.diagnostics||m.count>0)&&<><dl><dt>Frases procesadas</dt><dd>{m.count}</dd><dt>Activaciones reconocidas</dt><dd>{m.activated}</dd><dt>Frases ignoradas</dt><dd>{m.ignored}</dd><dt>Errores / frases demasiado largas</dt><dd>{m.errors} / {m.clipped}</dd><dt>Último procesamiento / máximo</dt><dd>{(m.lastMs/1000).toFixed(2)} s / {(m.maxMs/1000).toFixed(2)} s</dd><dt>Tiempo acumulado de procesamiento</dt><dd>{(m.processingMs/1000).toFixed(1)} s</dd><dt>Audio enviado a Whisper</dt><dd>{(m.audioMs/1000).toFixed(1)} s</dd><dt>No respondió / activación incorrecta (marcados por vos)</dt><dd>{m.missed} / {m.falseActivations}</dd></dl><p>El procesamiento mide desde la preparación del audio hasta la respuesta de Whisper. Se suma la espera elegida al terminar de hablar; no incluye abrir la app ni la respuesta de Ollama. No mide CPU o RAM: para eso compará Bimu y whisper-server en el Administrador de tareas, con escucha apagada, en silencio y al hablar. Los conteos no equivalen a un porcentaje de precisión.</p><div><button disabled={!wake.diagnostics} onClick={()=>wake.report('missed')}>Lo llamé y no respondió</button><button disabled={!wake.diagnostics} onClick={()=>wake.report('falseActivations')}>Se activó sin llamarlo</button><button onClick={wake.resetMetrics}>Reiniciar medición</button></div></>}</section>
}
