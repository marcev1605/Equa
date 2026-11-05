// node tools/ui-flows.cjs
// Compila las pantallas reales con esbuild + shims DOM (tools/web-harness) y prueba flujos completos en Chromium.
const path = require('path'), fs = require('fs'), cp = require('child_process');
const root = path.resolve(__dirname, '..');
cp.execFileSync(process.execPath, [path.join(root, 'tools/web-harness/build.cjs')], { stdio: 'inherit', env: process.env });
const seed = require('./web-harness/seed.cjs');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const PAGE = 'file://' + path.join(root, 'tools/web-harness/dist/index.html');
let fails=0;const ok=(c,m)=>{console.log(c?'  ✓':'  ✗ FALLA',m);if(!c)fails++};
(async()=>{
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
// La ventana "Guardado" (con botón OK) tapa la pantalla hasta que se cierra. Playwright la cierra sola antes de la siguiente acción;
// las pruebas que verifican la ventana leen el texto antes de actuar (leer no dispara el cierre).
{const nc=b.newContext.bind(b);b.rawContext=nc;b.newContext=async o=>{const c=await nc(o);const np=c.newPage.bind(c);c.newPage=async()=>{const pg=await np();
 await pg.addLocatorHandler(pg.locator('[aria-label="Movimiento guardado"]').getByText('OK',{exact:true}),async l=>{await l.click()});return pg};return c}}
const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();
await p.clock.install({time:new Date('2026-10-02T12:00:00')});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.addInitScript(s=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',s)},seed);
await p.goto(PAGE+'#/');await p.waitForTimeout(400);
const txt=async()=>(await p.innerText('body')).replace(/\n+/g,' | ');
const click=async(sel)=>{await p.locator(sel).first().click();await p.waitForTimeout(150)};
const clickText=async(t,exact=true)=>{await p.getByText(t,{exact}).last().click();await p.waitForTimeout(150)};
const openNew=async(pg,w,label)=>{if(w>=900)await pg.getByText('＋ Nuevo movimiento',{exact:true}).click();else await pg.locator('[aria-label="Agregar movimiento"]').click();await pg.waitForTimeout(250);await pg.locator('[aria-label="'+label+'"]').first().click();await pg.waitForTimeout(300)};
const state=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));

// 0) responsive: móvil = barra inferior + botón +, escritorio = menú lateral
ok((await p.locator('[aria-label="Agregar movimiento"]').count())===1,'móvil: botón flotante +');
ok((await txt()).includes('Estadísticas')&&!(await txt()).includes('Nuevo movimiento'),'móvil: barra inferior sin menú lateral');
{const c2=await b.newContext({viewport:{width:1280,height:800}});const q=await c2.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(s=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',s)},seed);await q.goto(PAGE+'#/');await q.waitForTimeout(400);
 const w=(await q.innerText('body'));ok(w.includes('Nuevo movimiento')&&(await q.locator('[aria-label="Agregar movimiento"]').count())===0,'escritorio: menú lateral, sin botón flotante');
 const ml=await q.getByText('Movimientos',{exact:true}).first().boundingBox(),dp=await q.getByText('Disponible ahora').first().boundingBox();ok(ml.x>dp.x+300,'escritorio: dos columnas (Movimientos a la derecha)');await c2.close();}
// menú del botón +: Ingreso / Gasto / Gasto con tarjeta, cada uno con su formulario simple (colores: verde ingreso, rojo gasto)
{for (const w of [320,360,390,820]) {
  const c4=await b.newContext({viewport:{width:w,height:800}});const q=await c4.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/');await q.waitForTimeout(400);
  if(w>=900)await q.getByText('＋ Nuevo movimiento',{exact:true}).click();else await q.locator('[aria-label="Agregar movimiento"]').first().click();await q.waitForTimeout(250);
  const names=[];for(const n of ['Ingreso','Gasto','Gasto con tarjeta'])names.push(await q.locator('[aria-label="'+n+'"]').count());
  ok(names.every(x=>x===1),'menú + @'+w+': ofrece Ingreso, Gasto y Gasto con tarjeta');
  if(w<900){const bx=await Promise.all(['Ingreso','Gasto','Gasto con tarjeta'].map(n=>q.locator('[aria-label="'+n+'"]').boundingBox()));
   ok(bx.every(x=>x.x>=0&&x.x+x.width<=w&&x.y>=0),'menú + @'+w+': las tres opciones entran en pantalla');}
  const bgOf=async tx=>q.evaluate(tx=>{const e=[...document.querySelectorAll('[role=button]')].find(x=>x.textContent===tx);return getComputedStyle(e).backgroundColor},'Guardar');
  const kinds=[['Ingreso','Nuevo ingreso','rgb(31, 138, 91)'],['Gasto','Nuevo gasto','rgb(194, 69, 47)'],['Gasto con tarjeta','Nuevo gasto con tarjeta','rgb(194, 69, 47)']];
  for(const [lab,title,col] of kinds){
   if(lab!=='Ingreso'){ if(w>=900)await q.getByText('＋ Nuevo movimiento',{exact:true}).click();else await q.locator('[aria-label="Agregar movimiento"]').first().click();await q.waitForTimeout(250);}
   await q.locator('[aria-label="'+lab+'"]').first().click();await q.waitForTimeout(300);
   const tt=await q.innerText('body');
   ok(tt.includes(title)&&(await q.locator('input[aria-label="Monto"]').count())===1,'formulario @'+w+': "'+title+'"');
   const d=await q.locator('input[type=date]').boundingBox(),nt=await q.locator('input[aria-label="Nota (opcional)"]').boundingBox();
   const overlap=!(nt.x>=d.x+d.width-0.5||d.x>=nt.x+nt.width-0.5||nt.y>=d.y+d.height-0.5||d.y>=nt.y+nt.height-0.5);
   ok(!overlap&&d.x>=0&&nt.x+nt.width<=w,'formulario "'+lab+'" @'+w+': Fecha y Nota no se superponen ni se salen');
   if(w===360)ok((await bgOf())===col,'formulario "'+lab+'": botón Guardar '+(col.includes('138')?'verde':'rojo'));
   ok(lab==='Gasto con tarjeta'?(tt.includes('Tarjeta')&&tt.includes('Cuotas')):!tt.includes('Cuotas'),'formulario "'+lab+'" @'+w+': '+(lab==='Gasto con tarjeta'?'pide tarjeta y cuotas':'sin campos de tarjeta'));
   ok(!tt.includes('Fijo mensual')&&!tt.includes('Efectivo / débito'),'formulario "'+lab+'" @'+w+': las opciones avanzadas están plegadas en "Más opciones"');
   await q.getByText('Cancelar',{exact:true}).last().click();await q.waitForTimeout(250);
  }
  await c4.close();}}
// el formulario arranca con la última categoría y la última tarjeta usadas
{const st0=await state();const lastOut=[...st0.tx].reverse().find(x=>x.type==='out'&&!x.card),lastCard=[...st0.tx].reverse().find(x=>x.card);
 await openNew(p,390,'Gasto');
 ok((await p.locator('[aria-label="Categoría"]').first().innerText()).includes(lastOut.cat),'gasto: arranca con la última categoría usada ('+lastOut.cat+')');
 await clickText('Cancelar');await p.waitForTimeout(200);
 await openNew(p,390,'Gasto con tarjeta');
 ok((await p.locator('[aria-label="Tarjeta"]').first().innerText()).includes(lastCard.cardName),'gasto con tarjeta: arranca con la última tarjeta usada ('+lastCard.cardName+')');
 await clickText('Cancelar');await p.waitForTimeout(200);}
// 1) alta de gasto
await openNew(p,390,'Gasto');
await p.locator('input').first().fill('2500');
await p.locator('[aria-label="Categoría"]').first().click();await p.waitForTimeout(150);
await p.locator('[aria-label="Comida"]').first().click();await p.waitForTimeout(150);
await p.locator('input[aria-label="Nota (opcional)"]').fill('Verdulería');
{const h=await p.locator('[aria-label="Ya está pagado"]').boundingBox(),ti=await p.getByText('Nuevo gasto',{exact:true}).last().boundingBox();ok(!!h&&!!ti&&Math.abs((h.y+h.height/2)-(ti.y+ti.height/2))<14&&h.x>ti.x+ti.width&&h.x+h.width<=390,'gasto nuevo: "Pagado" va arriba a la derecha, en la línea del título');}
ok(!(await txt()).includes('Ya está pagado'),'gasto nuevo: el tilde ya no está en "Más opciones"');
await p.locator('[aria-label="Ya está pagado"]').click();await p.waitForTimeout(100);
await clickText('Guardar');await p.waitForTimeout(300);
let s=await state();ok(s.tx.some(t=>t.note==='Verdulería'&&t.amt===2500),'alta de gasto guardada');
ok(Object.keys(s.paid).some(k=>k.startsWith(s.tx.find(t=>t.note==='Verdulería').id)),'marcada como pagada');
ok((await txt()).includes('Verdulería'),'aparece en Movimientos');
ok((await txt()).includes('Hoy · viernes 2 de Octubre'),'movimientos agrupados por día: encabezado "Hoy · viernes 2 de octubre"');
{const hs=await p.locator('[aria-label^="Día "]').allTextContents();ok(hs.length>=2,'hay varios días como grupos');}

// 2) tildar con confirmación
await click('[aria-label="Marcar"][role="checkbox"]');
ok((await txt()).includes('Marcar como pagado'),'pide confirmación al tildar');
await clickText('Cancelar');await p.waitForTimeout(100);
let before=Object.keys((await state()).paid).length;
await click('[aria-label="Marcar"][role="checkbox"]');await clickText('Marcar como pagado');await p.waitForTimeout(300);
ok(Object.keys((await state()).paid).length===before+1,'tildar confirma y guarda');

// 2b) editar un gasto: el tilde "Pagado" (arriba a la derecha) llega con el estado actual y se puede cambiar
{const vid=(await state()).tx.find(t=>t.note==='Verdulería').id,paidKeys=async()=>Object.keys((await state()).paid).filter(k=>k.startsWith(vid));
 ok((await paidKeys()).length===1,'editar: la Verdulería arranca pagada');
 const h=await p.getByText('Verdulería',{exact:false}).first().elementHandle();
 const btn=await h.evaluateHandle(el=>{let n=el;while(n&&!n.querySelector('[aria-label="Opciones"]'))n=n.parentElement;return n.querySelector('[aria-label="Opciones"]')});
 await btn.asElement().click();await p.waitForTimeout(200);await clickText('Editar',true);await p.waitForTimeout(300);
 {const tk=p.locator('[aria-label="Ya está pagado"]');ok((await tk.count())===1&&(await tk.getAttribute('aria-checked'))==='true','editar: el tilde "Pagado" aparece marcado, junto al título');
  const hb=await tk.boundingBox(),tb=await p.getByText('Editar gasto',{exact:true}).last().boundingBox();ok(Math.abs((hb.y+hb.height/2)-(tb.y+tb.height/2))<14&&hb.x>tb.x+tb.width,'editar: el tilde queda arriba a la derecha, en la línea del título');
  await tk.click();await p.waitForTimeout(100);ok((await tk.getAttribute('aria-checked'))==='false','editar: se puede destildar');}
 await clickText('Guardar cambios');await p.waitForTimeout(300);
 ok((await paidKeys()).length===0,'editar: al guardar sin el tilde, el gasto vuelve a pendiente');
 const h2=await p.getByText('Verdulería',{exact:false}).first().elementHandle();
 const b2=await h2.evaluateHandle(el=>{let n=el;while(n&&!n.querySelector('[aria-label="Opciones"]'))n=n.parentElement;return n.querySelector('[aria-label="Opciones"]')});
 await b2.asElement().click();await p.waitForTimeout(200);await clickText('Editar',true);await p.waitForTimeout(300);
 await p.locator('[aria-label="Ya está pagado"]').click();await clickText('Guardar cambios');await p.waitForTimeout(300);
 ok((await paidKeys()).length===1,'editar: al guardar con el tilde, queda pagado');}

// 2c) los fijos dicen que son mensuales y, si terminan, hasta cuándo
{await p.goto(PAGE+'#/');await p.waitForTimeout(300);const tx=await txt();
 ok(tx.includes('Mascotas · fijo mensual · hasta Octubre 2026'),'fijo con fecha de fin: "fijo mensual · hasta Octubre 2026"');
 ok(tx.includes('Sueldo · fijo mensual · pendiente')&&!tx.includes('Sueldo · fijo mensual · hasta'),'fijo sin fecha de fin: solo "fijo mensual"');
 await p.locator('[aria-label="Mes siguiente"]').click();await p.waitForTimeout(250);
 ok(!(await txt()).includes('Mascotas'),'el fijo que termina en octubre no aparece en noviembre');
 await p.locator('[aria-label="Mes anterior"]').click();await p.waitForTimeout(250);}

// 2d) las repeticiones dicen hasta cuándo van
for(const [opt,veces,esperado] of [['Se repite cada mes','7','mes 1 de 7 · hasta Abril 2027'],['Se repite cada semana','4','semana 1 de 4 · hasta Octubre 2026']]){
 const cr=await b.newContext({viewport:{width:390,height:1400}});const q=await cr.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/');await q.waitForTimeout(400);
 await openNew(q,390,'Gasto');await q.locator('input[aria-label="Monto"]').fill('900');await q.locator('input[aria-label="Nota (opcional)"]').fill('Pilates');
 await q.getByText('Más opciones',{exact:false}).click();await q.locator('[aria-label="¿Cada cuánto?"]').click();await q.getByText(opt,{exact:false}).last().click();await q.waitForTimeout(150);
 await q.locator('input[aria-label="Veces en total (incluye esta)"]').fill(veces);await q.getByText('Guardar',{exact:true}).last().click();await q.waitForTimeout(400);
 ok((await q.innerText('body')).replace(/\s+/g,' ').includes('Ocio · '+esperado),'repetición "'+opt+' x'+veces+'": dice "'+esperado+'"');
 await cr.close();}

// 2e) estadísticas: resumen con comparación, ritmo, fijos vs. variables, por tarjeta y categorías contra el mes anterior
for(const w of [320,390,1280]){
 const ce=await b.newContext({viewport:{width:w,height:900}});const q=await ce.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/stats');await q.waitForTimeout(500);
 const T=async()=>(await q.innerText('body')).replace(/\s+/g,' ');const tx=await T();
 ok(tx.includes('Resumen del mes')&&tx.includes('vs. septiembre')&&(await q.locator('[aria-label^="Resumen "]').count())>=5,'estadísticas @'+w+': resumen del mes con sus 4 datos y "vs. septiembre"');
 {const g=await q.locator('[aria-label="Resumen Gastos"]').innerText(),i=await q.locator('[aria-label="Resumen Ingresos"]').innerText();
  ok(g.includes('$26.667')&&/▲ [\d.]+% más/.test(g)&&i.includes('$300.000'),'estadísticas @'+w+': Gastos e Ingresos muestran importe y comparación ('+g.replace(/\s+/g,' ')+')');
  }
 ok(tx.includes('Ritmo del mes')&&tx.includes('Gastás por día')&&/Este mes vas a cerrar en \$26\.667/.test(tx),'estadísticas @'+w+': ritmo del mes con el gasto por día y el cierre previsto');
 ok(tx.includes('Fijos vs. variables')&&tx.includes('Fijos · 34%')&&tx.includes('Tarjeta · 63%')&&tx.includes('Del mes · 4%')&&tx.includes('El 34% de tus gastos se repite todos los meses'),'estadísticas @'+w+': fijos vs. variables (34% / 63% / 4%)');
 {const tj=await q.locator('[aria-label="Tarjeta Visa ICBC"]').innerText();ok(tx.includes('Por tarjeta')&&tj.includes('$16.667')&&tj.includes('Cuotas pendientes: $33.333 en 2 meses')&&tx.includes('Tenés $33.333 comprometidos en cuotas'),'estadísticas @'+w+': por tarjeta con lo del mes y las cuotas pendientes');}
 ok(tx.includes('Casa · 63% Nueva')&&tx.includes('Mascotas · 34% Nueva')&&/Ocio · 4% \$1\.000/.test(tx),'estadísticas @'+w+': categorías sin gasto el mes anterior dicen "Nueva" y las que no cambiaron no muestran nada');
 ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'estadísticas @'+w+': sin desplazamiento horizontal');
 await q.locator('[aria-label="Mes siguiente"]').click();await q.waitForTimeout(300);
 {const t2=await T();ok(t2.includes('vs. octubre')&&t2.includes('Noviembre 2026')&&t2.includes('Este mes se prevé cerrar en'),'estadísticas @'+w+': al avanzar de mes compara con octubre y el ritmo habla de previsión');}
 await q.locator('[aria-label="Mes siguiente"]').click();for(let k=0;k<8;k++){await q.locator('[aria-label="Mes siguiente"]').click();}await q.waitForTimeout(300);
 {const t3=await T();ok(t3.includes('Resumen del mes')&&!t3.includes('Ritmo del mes')&&t3.includes('Sin gastos con tarjeta este mes ni cuotas pendientes'),'estadísticas @'+w+': un mes sin gastos no muestra ritmo ni fijos y lo dice en tarjetas');}
 await ce.close();}

// 2f) tarjetas: peso sobre ingresos + deuda por mes (pocas y muchas tarjetas)
for(const [w,muchas] of [[320,false],[390,false],[1280,false],[320,true],[390,true]]){
 const d=JSON.parse(seed);
 if(muchas)['Visa Bna','Master Galicia','Amex','Naranja X','Mercado Pago','Cabal','Brubank','Ualá','Santander'].forEach((n,k)=>{d.cards.push(n);d.tx.push({id:'m'+k,type:'out',amt:(k+2)*12000,cat:'Ocio',note:n,date:'2026-09-12',card:true,cardName:n,fixed:false,inst:3+k%5,skip:[]})});
 const ct=await b.newContext({viewport:{width:w,height:900}});const q=await ct.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},JSON.stringify(d));await q.goto(PAGE+'#/cards');await q.waitForTimeout(500);
 const T=async()=>(await q.innerText('body')).replace(/\s+/g,' ');const tg='tarjetas @'+w+(muchas?' (10 tarjetas)':'')+': ';
 ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),tg+'sin desplazamiento horizontal');
 if(!muchas){
  const tx=await T();
  ok(tx.includes('Tarjeta vs. ingresos')&&tx.includes('6%')&&tx.includes('$16.667 de $300.000 de ingresos de noviembre'),tg+'franja "Tarjeta vs. ingresos" con porcentaje e importes del mes en que se paga');
  ok(tx.includes('Lo que ya debés, mes a mes')&&tx.includes('solo cuotas')&&(await q.locator('[aria-label="Deuda Nov: $16.667"]').count())===1&&(await q.locator('[aria-label="Deuda Dic: $16.667"]').count())===1,tg+'gráfico de deuda por mes (Nov y Dic con $16.667)');
  ok(tx.includes('Tenés $33.333 comprometidos en cuotas')&&tx.includes('Desde Enero se libera todo'),tg+'resumen del total comprometido y cuándo se libera');
  ok((await q.locator('[aria-label="Detalle de Noviembre"]').count())===0,tg+'con pocas tarjetas la deuda va en una tabla (sin desplegables)');
  if(w===390){await q.locator('[aria-label="Mes siguiente"]').click();await q.waitForTimeout(300);const t2=await T();ok(t2.includes('ingresos de diciembre')&&t2.includes('Tenés $16.667 comprometidos en cuotas'),tg+'al avanzar de mes, la franja y la deuda se recalculan');}
 } else {
  const tx=await T();
  ok(tx.includes('Otras (6)')&&(await q.locator('[aria-label="Detalle de Noviembre"]').count())===1,tg+'muestra las 4 tarjetas mayores y "Otras (6)", con meses desplegables');
  await q.locator('[aria-label="Detalle de Noviembre"]').click();await q.waitForTimeout(250);
  ok((await q.locator('[aria-label="Detalle de Noviembre"]').getAttribute('aria-expanded'))==='true',tg+'el desplegable queda abierto');const t2=await T();ok(t2.includes('Noviembre 10 tarjetas')&&['Cabal','Brubank','Visa ICBC','Master Galicia'].every(n=>t2.includes(n)),tg+'al tocar Noviembre se ven las 10 tarjetas que lo componen');
  ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),tg+'abierto, sin desplazamiento horizontal');
  await q.locator('[aria-label="Detalle de Noviembre"]').click();await q.waitForTimeout(200);
  ok((await q.locator('[aria-label="Detalle de Noviembre"]').getAttribute('aria-expanded'))==='false',tg+'se vuelve a plegar');
 }
 await ct.close();}
// ventana "Guardado": al guardar un movimiento aparece al centro con el detalle y un botón OK (celulares chicos, grandes y escritorio)
for(const [w,h] of [[320,568],[390,844],[1280,800]]){
 const cg=await b.rawContext({viewport:{width:w,height:h}});const q=await cg.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/');await q.waitForTimeout(500);
 const T=async()=>(await q.innerText('body')).replace(/\s+/g,' ');const tg='ventana guardado @'+w+'x'+h+': ';
 const box=async()=>q.evaluate(()=>{const e=document.querySelector('[aria-label="Movimiento guardado"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});
 const inside=async()=>{const r=await box();return !!r&&r.x>=0&&r.y>=0&&r.x+r.width<=w+0.5&&r.y+r.height<=h+0.5};
 // gasto en efectivo, ya pagado
 await openNew(q,w,'Gasto');await q.locator('input[aria-label="Monto"]').fill('12500');await q.locator('[aria-label="Ya está pagado"]').click();await q.getByText('Guardar',{exact:true}).last().click();await q.waitForTimeout(450);
 let t=await T();
 ok(t.includes('Gasto guardado')&&t.includes('−$12.500')&&t.includes('Tu disponible pasa de $320.000 a $307.500.'),tg+'gasto: título, importe y cómo cambia el disponible');
 ok(await inside(),tg+'la ventana entra completa en la pantalla');
 ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),tg+'sin desplazamiento horizontal');
 await q.getByText('OK',{exact:true}).last().click();await q.waitForTimeout(300);
 ok((await q.locator('[aria-label="Movimiento guardado"]').count())===0,tg+'OK cierra la ventana');
 // gasto sin pagar: queda pendiente
 await openNew(q,w,'Gasto');await q.locator('input[aria-label="Monto"]').fill('3000');await q.getByText('Guardar',{exact:true}).last().click();await q.waitForTimeout(400);
 t=await T();ok(t.includes('Gasto guardado')&&t.includes('Queda pendiente de pago'),tg+'gasto sin tildar: avisa que queda pendiente y que el disponible no cambia');
 await q.keyboard.press('Enter');await q.waitForTimeout(300);
 ok((await q.locator('[aria-label="Movimiento guardado"]').count())===0,tg+'Enter también cierra');
 // ingreso cobrado
 await openNew(q,w,'Ingreso');await q.locator('input[aria-label="Monto"]').fill('50000');await q.locator('[aria-label="Ya está cobrado"]').click();await q.getByText('Guardar',{exact:true}).last().click();await q.waitForTimeout(400);
 t=await T();ok(t.includes('Ingreso guardado')&&t.includes('+$50.000')&&t.includes('Tu disponible pasa de $307.500 a $357.500.'),tg+'ingreso cobrado: +importe y nuevo disponible');
 await q.getByText('OK',{exact:true}).last().click();await q.waitForTimeout(250);
 // tarjeta en cuotas
 await openNew(q,w,'Gasto con tarjeta');await q.locator('input[aria-label="Monto"]').fill('60000');await q.locator('[aria-label="Cuotas: 3"]').click();await q.waitForTimeout(150);await q.getByText('Guardar',{exact:true}).last().click();await q.waitForTimeout(450);
 t=await T();ok(t.includes('Gasto guardado')&&t.includes('3 cuotas de $20.000')&&t.includes('Hoy tu disponible no cambia: se paga con el resumen de'),tg+'tarjeta en cuotas: detalle de las cuotas y que hoy no cambia el disponible');
 ok(await inside(),tg+'tarjeta: la ventana entra completa');
 await q.getByText('OK',{exact:true}).last().click();await q.waitForTimeout(250);
 // ahorro: depósito y programado
 await q.goto(PAGE+'#/savings');await q.waitForTimeout(400);
 await q.locator('[aria-label="Depositar"]').first().click();await q.waitForTimeout(250);await q.locator('input[aria-label="Monto"]').fill('7000');
 await q.locator('[aria-label="Categoría"]').first().click();await q.waitForTimeout(150);await q.locator('[aria-label="Acciones"]').first().click();await q.waitForTimeout(150);
 await q.getByText('Continuar',{exact:true}).last().click();await q.waitForTimeout(250);await q.getByText('Depositar',{exact:true}).last().click();await q.waitForTimeout(450);
 t=await T();ok(t.includes('Depósito guardado')&&t.includes('+$7.000')&&t.includes('Ahorro · Acciones: $7.000.')&&t.includes('Tu disponible pasa de'),tg+'depósito de ahorro: detalle y saldo de la categoría');
 await q.getByText('OK',{exact:true}).last().click();await q.waitForTimeout(250);
 await q.locator('[aria-label="Depositar"]').first().click();await q.waitForTimeout(250);await q.locator('input[aria-label="Monto"]').fill('2000');
 await q.locator('[aria-label="Categoría"]').first().click();await q.waitForTimeout(150);await q.locator('[aria-label="Acciones"]').first().click();await q.waitForTimeout(150);await q.locator('input[aria-label="Fecha"]').fill('2026-11-20');
 await q.getByText('Continuar',{exact:true}).last().click();await q.waitForTimeout(250);await q.getByText('Programar',{exact:true}).last().click();await q.waitForTimeout(450);
 t=await T();ok(t.includes('Depósito programado')&&t.includes('Para el 20/11/2026')&&t.includes('Hasta ese día no cambia tu cuenta ni tu ahorro.'),tg+'depósito programado: lo dice y aclara que hoy no cambia nada');
 ok(await inside(),tg+'ahorro: la ventana entra completa');
 await q.getByText('OK',{exact:true}).last().click();await q.waitForTimeout(250);
 await cg.close();}
// ahorro programado: un depósito con fecha futura no mueve la cuenta ni el saldo de Ahorro hasta su día
for(const w of [320,390,1280]){
 const cs=await b.newContext({viewport:{width:w,height:900}});const q=await cs.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/savings');await q.waitForTimeout(500);
 const T=async()=>(await q.innerText('body')).replace(/\s+/g,' ');const tg='ahorro programado @'+w+': ';
 const head=async()=>{const t=await T();return {tot:(t.match(/Total ahorrado (\$[\d.]+)/)||[])[1],dis:(t.match(/Disponible ahora: (-?\$[\d.]+)/)||[])[1]}};
 const h0=await head();
 await q.locator('[aria-label="Depositar"]').first().click();await q.waitForTimeout(250);
 await q.locator('input[aria-label="Monto"]').fill('2000');
 await q.locator('[aria-label="Categoría"]').first().click();await q.waitForTimeout(150);await q.locator('[aria-label="Acciones"]').first().click();await q.waitForTimeout(150);
 await q.locator('input[aria-label="Fecha"]').fill('2026-11-20');await q.waitForTimeout(150);
 ok((await T()).includes('queda programado: no mueve nada hasta el 20/11/2026'),tg+'el formulario avisa que con fecha futura queda programado');
 await q.getByText('Continuar',{exact:true}).last().click();await q.waitForTimeout(250);
 ok((await T()).includes('Programar un depósito de $2.000 en Ahorro · Acciones para el 20/11/2026')&&(await T()).includes('no cambia tu cuenta'),tg+'la confirmación dice que queda programado y que hoy no cambia nada');
 await q.getByText('Programar',{exact:true}).last().click();await q.waitForTimeout(400);
 const h1=await head(),t1=await T();
 ok(h1.tot===h0.tot&&h1.dis===h0.dis,tg+'hoy no cambia ni el total de Ahorro ('+h1.tot+') ni el disponible ('+h1.dis+')');
 ok(t1.includes('Programado: 1 movimiento, el próximo el 20/11/2026 · depósitos +$2.000'),tg+'una línea avisa lo que hay programado');
 await q.locator('[aria-label="Mes siguiente"]').first().click();await q.waitForTimeout(300);
 ok((await T()).includes('20/11/2026 · Programado'),tg+'en noviembre el movimiento figura como "Programado"');
 ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),tg+'sin desplazamiento horizontal');
 if(w===390){
  await q.locator('[aria-label="Retirar"]').first().click();await q.waitForTimeout(250);
  await q.locator('input[aria-label="Monto"]').fill('999999');await q.locator('input[aria-label="Fecha"]').fill('2026-11-25');
  await q.getByText('Continuar',{exact:true}).last().click();await q.waitForTimeout(250);
  ok(/solo tendrás \$[\d.]+ el 25\/11\/2026/.test(await T()),tg+'un retiro a futuro se valida contra el saldo de esa fecha');
 }
 await cs.close();}
// ahorro programado: al llegar la fecha el movimiento pasa a contar solo (sin avisos ni pasos manuales)
{const d=JSON.parse(seed);d.sav.push({id:'prog2',cat:'Acciones',amt:900000,date:'2026-11-20',note:''});
 for(const [dia,cuenta] of [['2026-11-19',false],['2026-11-20',true]]){
  const cc=await b.newContext({viewport:{width:390,height:900}});const q=await cc.newPage();await q.clock.install({time:new Date(dia+'T12:00:00')});
  await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},JSON.stringify(d));await q.goto(PAGE+'#/savings');await q.waitForTimeout(500);
  const t=(await q.innerText('body')).replace(/\s+/g,' ');
  ok(cuenta?(t.includes('Total ahorrado $1.000.000')&&!t.includes('Programado:')):(t.includes('Total ahorrado $100.000')&&t.includes('Programado: 1 movimiento')),'ahorro programado: el '+dia.slice(8)+'/11 '+(cuenta?'ya cuenta en el total y desaparece el aviso de programado':'todavía no cuenta y figura como programado'));
  await cc.close();}}
// previsión: aviso cuando un depósito programado deja la cuenta en negativo
for(const w of [320,390,1280]){
 const d=JSON.parse(seed);d.sav.push({id:'prog1',cat:'Acciones',amt:900000,date:'2026-11-20',note:''});
 const cp=await b.newContext({viewport:{width:w,height:900}});const q=await cp.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},JSON.stringify(d));await q.goto(PAGE+'#/forecast');await q.waitForTimeout(600);
 const tx=(await q.innerText('body')).replace(/\s+/g,' ');const tg='previsión con ahorro programado @'+w+': ';
 ok(tx.includes('El depósito programado de $900.000 (20/11)')&&tx.includes('sin él cerraría en'),tg+'el cartel de avisos lo menciona con su fecha');
 ok((await q.locator('[aria-label="Ahorro programado en negativo"]').count())===1,tg+'solo el mes de noviembre lleva la nota (no los demás)');
 ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),tg+'sin desplazamiento horizontal');
 await cp.close();}
 {const q0=await b.newContext({viewport:{width:390,height:900}});const q=await q0.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/forecast');await q.waitForTimeout(600);
  ok((await q.locator('[aria-label="Ahorro programado en negativo"]').count())===0&&!(await q.innerText('body')).includes('depósito programado'),'previsión: sin ahorro programado no aparece ningún aviso de este tipo');await q0.close();}
// encabezado: logo compacto fijo (móvil) y cinta "Volver a hoy" al bajar estando en otro mes
for(const [w,h,wide] of [[320,568,false],[390,700,false],[1280,420,true]]){const ch=await b.newContext({viewport:{width:w,height:h}});const q=await ch.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/');await q.waitForTimeout(500);
  const scr=()=>q.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+50&&/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&e.clientWidth>200);if(!el)return null;return {y:el.scrollTop}});
  const down=y=>q.evaluate(y=>{const el=[...document.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+50&&/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&e.clientWidth>200);el.scrollTop=y},y);
  const eq=()=>q.evaluate(()=>{const i=document.querySelector('img[alt="Equa"]');if(!i)return null;const r=i.getBoundingClientRect();return {top:Math.round(r.top),h:Math.round(r.height)}});
  const cintas=()=>q.getByRole('button',{name:'Volver a hoy'}).count();
  await down(300);await q.waitForTimeout(250);
  if(!wide){const e=await eq();ok(e&&e.h===22&&e.top<14,`encabezado @${w}: logo compacto (22px) queda fijo arriba al deslizar`)}
  ok((await cintas())===0,`cinta @${w}: no aparece en el mes de hoy`);
  await down(0);await q.waitForTimeout(150);await q.getByRole('button',{name:'Mes siguiente'}).click();await q.waitForTimeout(250);
  ok((await cintas())===1,`cinta @${w}: arriba de todo solo está el botón del selector`);
  await down(300);await q.waitForTimeout(300);
  if(wide){ok((await cintas())===1&&!(await q.innerText('body')).includes('↑ Volver a hoy'),`web @${w}: el selector de mes queda fijo en el encabezado (no hace falta cinta)`)}
  else ok((await cintas())===2&&(await q.innerText('body')).includes('↑ Volver a hoy · Octubre'),`cinta @${w}: al bajar en otro mes aparece debajo del logo`);
  if(!wide){const rb=await q.evaluate(()=>{const el=document.querySelector('[aria-label="Volver a hoy"]');const r=el.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right)}});ok(rb.t>=36&&rb.b<=120&&rb.l>=0&&rb.r<=w,`cinta @${w}: queda pegada bajo el logo y dentro de la pantalla`)}
  await q.getByRole('button',{name:'Volver a hoy'}).first().click();await q.waitForTimeout(300);
  ok((await q.locator('[aria-label="Mes elegido"]').innerText()).includes('Octubre 2026')&&(wide||(await scr()).y===0)&&(await cintas())===0,`cinta @${w}: vuelve al mes de hoy, sube al inicio y desaparece`);
  await ch.close();}
// web: encabezado fijo con título, selector de mes y totales que se achican al bajar; módulos sin superponerse y con aire
for(const [w,h] of [[1024,520],[1280,520],[1920,700]]){const cw=await b.newContext({viewport:{width:w,height:h}});const q=await cw.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);
  const scroller=y=>q.evaluate(y=>{const el=[...document.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+20&&/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&e.clientWidth>400);if(!el)return -1;el.scrollTop=y;return el.scrollTop},y);
  const rects=()=>q.evaluate(()=>[...document.querySelectorAll('[role=button],div')].filter(e=>e.children.length&&getComputedStyle(e).borderTopWidth==='1px'&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().width>120).map(e=>{const r=e.getBoundingClientRect();return {t:r.top,b:r.bottom,l:r.left,r:r.right}}));
  const overlap=a=>{for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const x=a[i],y=a[j];const ix=Math.min(x.r,y.r)-Math.max(x.l,y.l),iy=Math.min(x.b,y.b)-Math.max(x.t,y.t);const inside=(p,q)=>p.l>=q.l-1&&p.r<=q.r+1&&p.t>=q.t-1&&p.b<=q.b+1;if(ix>2&&iy>2&&!inside(x,y)&&!inside(y,x))return true}return false};
  for(const [rt,titulo,txts] of [['','Resumen',['Disponible ahora','Ingresos','Gastos']],['savings','Ahorro',['Total ahorrado','Ahorraste este mes','Programado']],['cards','Tarjetas',['Total a abonar de todas las tarjetas','Pagado','Pendiente']]]){
    await q.goto(PAGE+'#/'+rt);await q.waitForTimeout(450);
    const t0=await q.innerText('body');
    ok(txts.every(x=>t0.includes(x))&&t0.includes(titulo),`web @${w} ${titulo}: encabezado con título y los 3 totales`);
    ok(!overlap(await rects()),`web @${w} ${titulo}: los bloques no se superponen`);
    const hh=()=>q.evaluate(()=>{const e=[...document.querySelectorAll('*')].find(x=>x.textContent&&x.children.length===0&&/^(Resumen|Ahorro|Tarjetas)$/.test(x.textContent)&&x.getBoundingClientRect().left>260);let p=e;for(let i=0;i<3;i++)p=p.parentElement;return Math.round(p.getBoundingClientRect().height)});
    const h1=await hh();const got=await scroller(300);await q.waitForTimeout(350);const h2=await hh();
    if(got>0)ok(h2<h1-30,`web @${w} ${titulo}: al bajar los totales se achican (${h1}px → ${h2}px) y siguen visibles`);
    ok((await q.innerText('body')).includes(txts[0]),`web @${w} ${titulo}: los totales siguen a la vista al bajar`);
    await scroller(0);await q.waitForTimeout(350);ok(Math.abs(await hh()-h1)<3,`web @${w} ${titulo}: al volver arriba se agrandan otra vez`);
  }
  // Ahorro: botones separados de las categorías
  await q.goto(PAGE+'#/savings');await q.waitForTimeout(450);
  const gap=await q.evaluate(()=>{const tl=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent==='Depositar');const ct=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent==='Por categoría');const box=n=>{while(n&&getComputedStyle(n).borderTopWidth!=='1px')n=n.parentElement;return n};const a=box(tl),c=box(ct);return Math.round(c.getBoundingClientRect().top-a.getBoundingClientRect().bottom)});
  ok(gap>=20,`web @${w} Ahorro: Depositar/Retirar/Transferir separados de las categorías (${gap}px)`);
  await cw.close();}
// iPhone con isla/notch: la zona de arriba (y los costados en horizontal) lleva el mismo color de la app, en claro y oscuro
for(const [esq,bg] of [['light','rgb(238, 242, 243)'],['dark','rgb(14, 34, 38)']])for(const [w,h,ins] of [[390,844,{top:59,bottom:34,left:0,right:0}],[844,390,{top:0,bottom:21,left:47,right:47}],[320,568,{top:20,bottom:0,left:0,right:0}]]){
  const cx=await b.newContext({viewport:{width:w,height:h},colorScheme:esq});const q=await cx.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(([sd,i])=>{localStorage.setItem('equa-local-v1',sd);globalThis.__insets=i},[seed,ins]);await q.goto(PAGE+'#/');await q.waitForTimeout(450);
  const r=await q.evaluate(()=>{const bgOf=e=>getComputedStyle(e).backgroundColor;const top=document.elementFromPoint(8,2),logo=document.querySelector('img[alt="Equa"]').getBoundingClientRect(),tab=document.querySelector('[role=tablist]').getBoundingClientRect();let n=top;while(n&&bgOf(n)==='rgba(0, 0, 0, 0)')n=n.parentElement;
    return {html:bgOf(document.documentElement),body:bgOf(document.body),top:n?bgOf(n):null,logoTop:Math.round(logo.top),tabBottom:Math.round(tab.bottom),tabLeft:Math.round(tab.left),tabRight:Math.round(tab.right),hs:document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1,meta:[...document.querySelectorAll('meta[name=theme-color]')].map(m=>m.content+'|'+m.media)}});
  ok(r.html===bg&&r.body===bg&&r.top===bg,`iPhone @${w}x${h} ${esq}: la zona de arriba y el fondo de la página son del color de la app`);
  ok(r.logoTop>=ins.top&&r.tabBottom<=h-ins.bottom+1&&r.tabLeft>=ins.left&&r.tabRight<=w-ins.right&&!r.hs,`iPhone @${w}x${h} ${esq}: logo debajo de la cámara, barra sobre el borde inferior y nada fuera de la pantalla`);
  ok(r.meta.length===2&&r.meta.some(m=>m.startsWith('#0e2226'))&&r.meta.some(m=>m.startsWith('#eef2f3')),`iPhone @${w}x${h} ${esq}: theme-color declarado para claro y oscuro`);
  await cx.close();}
// Datos: saldo inicial y respaldo en tarjetas separadas; último respaldo manual; confirmación al cambiar el saldo inicial
for(const [w,h] of [[390,844],[1280,800]]){const cd=await b.rawContext({viewport:{width:w,height:h},acceptDownloads:true});const q=await cd.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/data');await q.waitForTimeout(450);
  const body=()=>q.innerText('body');const open=()=>q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')).open||0);
  const box=t=>q.evaluate(t=>{const e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent===t);let n=e;while(n&&getComputedStyle(n).borderTopWidth!=='1px')n=n.parentElement;const r=n.getBoundingClientRect();return {t:r.top,b:r.bottom,l:r.left,r:r.right}},t);
  const a=await box('Saldo inicial'),r=await box('Respaldo');
  ok(a.t!==r.t||a.l!==r.l,`datos @${w}: saldo inicial y respaldo son tarjetas distintas`);
  ok(!(Math.min(a.r,r.r)-Math.max(a.l,r.l)>2&&Math.min(a.b,r.b)-Math.max(a.t,r.t)>2),`datos @${w}: las tarjetas no se superponen`);
  ok((await body()).includes('Todavía no hiciste ningún respaldo manual'),`datos @${w}: sin respaldos avisa que todavía no hay ninguno`);
  const dl=q.waitForEvent('download');await q.getByText('Guardar respaldo',{exact:true}).click();await dl;await q.waitForTimeout(300);
  ok((await body()).includes('Último respaldo manual: hoy, 2 de octubre, a las 12:00'),`datos @${w}: muestra el último respaldo manual con día y hora`);
  await q.reload();await q.waitForFunction(()=>document.body.innerText.includes('Último respaldo manual'),null,{timeout:5000}).catch(()=>{});
  ok((await body()).includes('Último respaldo manual: hoy, 2 de octubre, a las 12:00'),`datos @${w}: el último respaldo se recuerda al volver a abrir`);
  const before=await open();
  // cancelar en la confirmación no cambia nada
  await q.getByText('Cambiar',{exact:true}).click();await q.waitForTimeout(200);await q.locator('input').last().fill('250000');await q.getByText('Continuar',{exact:true}).click();await q.waitForTimeout(250);
  const t1=await body();ok(t1.includes('¿Cambiar el saldo inicial')&&t1.includes('Diferencia')&&t1.includes('Tu disponible ahora pasa de')&&t1.includes('Sí, cambiar saldo'),`datos @${w}: pide confirmar y muestra qué cambia`);
  await q.getByText('Cancelar',{exact:true}).last().click();await q.waitForTimeout(250);ok((await open())===before,`datos @${w}: cancelar la confirmación no cambia el saldo`);
  // mismo monto: avisa que no hay cambios
  await q.getByText('Cambiar',{exact:true}).click();await q.waitForTimeout(200);await q.locator('input').last().fill(String(before));await q.getByText('Continuar',{exact:true}).click();await q.waitForTimeout(250);
  ok((await body()).includes('No hay cambios')&&(await open())===before,`datos @${w}: mismo monto avisa que no hay cambios`);
  // confirmar
  await q.getByText('Cambiar',{exact:true}).click();await q.waitForTimeout(200);await q.locator('input').last().fill('250000');await q.getByText('Continuar',{exact:true}).click();await q.waitForTimeout(250);
  await q.getByText('Sí, cambiar saldo',{exact:true}).click();await q.waitForTimeout(350);
  const t2=await body();ok(t2.includes('Saldo inicial guardado')&&t2.includes('$250.000')&&t2.includes('Tu disponible ahora pasa de'),`datos @${w}: avisa que se guardó con el antes y el después`);
  await q.getByText('OK',{exact:true}).click();await q.waitForTimeout(250);ok((await open())===250000,`datos @${w}: confirmar guarda el nuevo saldo inicial`);
  await cd.close();}
// borrar desde los tres puntitos: gasto único, "solo este mes" y "este mes y los siguientes" piden confirmación
for(const [w,h] of [[390,844],[1280,800]]){const cb=await b.newContext({viewport:{width:w,height:h}});const q=await cb.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/');await q.waitForTimeout(450);
  const st=()=>q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));const body=()=>q.innerText('body');
  const dots=async t=>{await q.evaluate(t=>{const e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent===t);let n=e;while(n&&!n.querySelector('[aria-label="Opciones"]'))n=n.parentElement;n.querySelector('[aria-label="Opciones"]').click()},t);await q.waitForTimeout(200)};
  const n0=(await st()).tx.length;
  // gasto único (compra con tarjeta en 3 cuotas)
  await dots('TV');await q.getByText('Borrar',{exact:true}).last().click();await q.waitForTimeout(250);
  {const t=await body();ok(t.includes('¿Borrar "TV"')&&t.includes('3 cuotas')&&t.includes('No se puede deshacer'),`borrar gasto @${w}: pide confirmación y avisa que se borran las 3 cuotas`);}
  await q.getByText('Cancelar',{exact:true}).last().click();await q.waitForTimeout(250);ok((await st()).tx.length===n0,`borrar gasto @${w}: cancelar no borra nada`);
  await dots('TV');await q.getByText('Borrar',{exact:true}).last().click();await q.waitForTimeout(250);
  await q.getByText('Borrar',{exact:true}).last().click();await q.waitForTimeout(350);ok((await st()).tx.length===n0-1&&!(await st()).tx.some(x=>x.note==='TV'),`borrar gasto @${w}: al confirmar se borra`);
  // fijo: solo este mes
  const f0=(await st()).tx.find(x=>x.note==='Alimento'||x.cat==='Mascotas');
  await dots('Alimento');await q.getByText('Borrar solo este mes',{exact:true}).last().click();await q.waitForTimeout(250);
  {const t=await body();ok(t.includes('¿Borrar "Alimento" solo de')&&t.includes('Los demás meses no cambian'),`borrar fijo @${w}: "solo este mes" pide confirmación`);}
  await q.getByText('Cancelar',{exact:true}).last().click();await q.waitForTimeout(250);
  ok(JSON.stringify((await st()).tx.find(x=>x.id===f0.id))===JSON.stringify(f0),`borrar fijo @${w}: cancelar deja el fijo igual`);
  await dots('Alimento');await q.getByText('Borrar solo este mes',{exact:true}).last().click();await q.waitForTimeout(250);
  await q.getByText('Borrar',{exact:true}).last().click();await q.waitForTimeout(350);
  ok(JSON.stringify((await st()).tx.find(x=>x.id===f0.id))!==JSON.stringify(f0),`borrar fijo @${w}: al confirmar se salta ese mes`);
  await cb.close();}
// respaldo en el celular (web): usa el menú de compartir y NO abre el archivo en la pantalla de la app (al deslizar desde el borde no aparece el código)
for(const cancel of [false,true]){const cm=await b.rawContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',hasTouch:true});const q=await cm.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(([sd,c])=>{localStorage.setItem('equa-local-v1',sd);window.__shared=[];navigator.canShare=o=>!!(o&&o.files&&o.files.length);navigator.share=async o=>{if(c){const e=new Error('cancel');e.name='AbortError';throw e}window.__shared.push({n:o.files[0].name,t:o.files[0].type,sz:o.files[0].size})}},[seed,cancel]);
  await q.goto(PAGE+'#/data');await q.waitForTimeout(450);const u0=q.url();
  await q.getByText('Guardar respaldo',{exact:true}).click();await q.waitForTimeout(400);
  const sh=await q.evaluate(()=>window.__shared);const body=await q.innerText('body');
  if(!cancel)ok(sh.length===1&&/^equa-respaldo-2026-10-02\.json$/.test(sh[0].n)&&sh[0].t==='application/json'&&sh[0].sz>100&&body.includes('Último respaldo manual: hoy, 2 de octubre, a las 12:00'),'respaldo en iPhone: abre el menú de compartir con el archivo .json y anota el respaldo');
  else ok(sh.length===0&&body.includes('Todavía no hiciste ningún respaldo manual'),'respaldo en iPhone: si cierra el menú de compartir sin guardar, no cuenta como respaldo');
  ok(q.url()===u0&&cm.pages().length===1&&!(await q.evaluate(()=>/"app":"equa"/.test(document.body.innerText))),'respaldo en iPhone: no navega ni abre el archivo en la pantalla de la app');
  await cm.close();}
// pago/cobro masivo desde "Por pagar" / "Por cobrar"
for(const [w,h] of [[390,844],[1280,800]]){const cp=await b.rawContext({viewport:{width:w,height:h}});const q=await cp.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/');await q.waitForTimeout(450);
  const body=()=>q.innerText('body');const paid=()=>q.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('equa-local-v1')).paid||{}).length);
  const p0=await paid();
  await q.getByText('Por pagar ›',{exact:true}).click();await q.waitForTimeout(300);
  let t=await body();ok(t.includes('Seleccionar')&&!t.includes('Pagar seleccionados'),`pago masivo @${w}: "Por pagar" ofrece Seleccionar`);
  // la ventana queda por encima del encabezado: tocar donde está el selector de mes cierra la ventana y no cambia de mes
  await q.mouse.click(w>800?1240:w-30,w>800?42:20);await q.waitForTimeout(300);
  t=await body();ok(!t.includes('Por pagar · Octubre')&&(await q.locator('[aria-label="Mes elegido"]').count()>=0)&&(w>800?t.includes('Octubre 2026'):true),`pago masivo @${w}: la ventana tapa también el encabezado fijo`);
  await q.getByText('Por pagar ›',{exact:true}).click();await q.waitForTimeout(300);
  await q.getByText('Seleccionar',{exact:true}).click();await q.waitForTimeout(250);
  t=await body();ok(t.includes('Seleccionar todos')&&t.includes('0 seleccionados')&&t.includes('Se paga desde el resumen'),`pago masivo @${w}: modo selección con la tarjeta bloqueada ("se paga desde el resumen")`);
  ok(!(await q.getByText('Pagar',{exact:true}).count()),`pago masivo @${w}: en selección el resumen de tarjeta no ofrece pagar acá`);
  await q.getByText('Seleccionar todos',{exact:true}).click();await q.waitForTimeout(250);
  t=await body();ok(/3 seleccionados/.test(t)&&t.includes('$11.000')&&t.includes('Tu disponible: $320.000 → $309.000'),`pago masivo @${w}: barra con cantidad, total y cómo queda el disponible`);
  await q.getByText('Pagar seleccionados',{exact:true}).click();await q.waitForTimeout(300);
  t=await body();ok(t.includes('¿Pagar 3 gastos juntos?')&&t.includes('Total: −$11.000')&&t.includes('Disponible ahora: $320.000 → $309.000')&&t.includes('Sí, pagar todos'),`pago masivo @${w}: pide confirmar y muestra el total`);
  await q.getByText('Cancelar',{exact:true}).last().click();await q.waitForTimeout(250);ok((await paid())===p0,`pago masivo @${w}: cancelar no paga nada`);
  await q.getByText('Pagar seleccionados',{exact:true}).click();await q.waitForTimeout(300);await q.getByText('Sí, pagar todos',{exact:true}).click();await q.waitForTimeout(400);
  t=await body();ok(t.includes('3 pagos guardados')&&t.includes('−$11.000')&&t.includes('Tu disponible ahora pasa de $320.000 a $309.000'),`pago masivo @${w}: aviso de pagos guardados con el efecto`);
  await q.getByText('OK',{exact:true}).click();await q.waitForTimeout(300);
  ok((await paid())===p0+3,`pago masivo @${w}: los 3 gastos quedaron pagados (y la tarjeta no)`);
  t=await body();ok(t.includes('Por pagar · Octubre')&&t.includes('$6.667')&&!t.includes('Seleccionar todos'),`pago masivo @${w}: sale del modo selección y queda solo lo de la tarjeta`);
  await q.getByText('Cerrar',{exact:true}).last().click();await q.waitForTimeout(250);
  // cobros
  await q.getByText('Por cobrar ›',{exact:true}).click();await q.waitForTimeout(300);await q.getByText('Seleccionar',{exact:true}).click();await q.waitForTimeout(250);
  await q.locator('[aria-label="Seleccionar Sueldo"]').click();await q.waitForTimeout(250);
  t=await body();ok(t.includes('1 seleccionado')&&t.includes('$300.000')&&t.includes('Cobrar seleccionados'),`cobro masivo @${w}: selecciona el sueldo y ofrece "Cobrar seleccionados"`);
  await q.getByText('Cobrar seleccionados',{exact:true}).click();await q.waitForTimeout(300);
  t=await body();ok(t.includes('¿Cobrar 1 ingreso?')&&t.includes('Total: +$300.000')&&t.includes('Sí, cobrar'),`cobro masivo @${w}: pide confirmar`);
  await q.getByText('Sí, cobrar',{exact:true}).click();await q.waitForTimeout(400);
  t=await body();ok(t.includes('1 cobro guardado')&&t.includes('+$300.000')&&t.includes('$609.000'),`cobro masivo @${w}: aviso de cobro guardado con el disponible nuevo`);
  await q.getByText('OK',{exact:true}).click();await q.waitForTimeout(300);ok((await paid())===p0+4,`cobro masivo @${w}: el sueldo quedó cobrado`);
  await cp.close();}
// estadísticas: no lleva el módulo de tarjeta vs. ingresos (vive solo en Tarjetas)
{const ce=await b.newContext({viewport:{width:390,height:900}});const q=await ce.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/stats');await q.waitForTimeout(500);
 const tx=(await q.innerText('body')).replace(/\s+/g,' ');
 ok(!tx.includes('Tarjeta vs. ingresos')&&!tx.includes('se van en tarjeta')&&tx.includes('Por tarjeta'),'estadísticas: sin el módulo "Tarjeta vs. ingresos" (sigue "Por tarjeta")');
 await ce.close();}

// 3) detalle Gastos
await clickText('Gastos ›');await p.waitForTimeout(200);
ok((await txt()).includes('Ya pagado'),'abre detalle de Gastos');
await clickText('Cerrar');

// 4) tarjetas: abrir, pagar resumen con adelanto
await p.goto(PAGE+'#/cards');await p.waitForTimeout(300);
{const t0=await txt();ok(t0.includes('Cierre de')&&t0.includes('Octubre 2026')&&t0.includes('Total a abonar de todas las tarjetas')&&t0.includes('$16.667'),'tarjetas: navegador de meses y total de todas las tarjetas del mes');
 await p.locator('[aria-label="Mes siguiente"]').click();await p.waitForTimeout(200);
 const t1=await txt();ok(t1.includes('Noviembre 2026')&&t1.includes('Volver a hoy')&&t1.includes('Se paga en Diciembre'),'tarjetas: al avanzar de mes cambia el cierre y el total');
 await p.locator('[aria-label="Mes anterior"]').click();await p.waitForTimeout(200);
 ok((await txt()).includes('Octubre 2026'),'tarjetas: se puede volver al mes anterior');
 await p.locator('[aria-label="Mes siguiente"]').click();await p.waitForTimeout(150);await p.locator('[aria-label="Mes siguiente"]').click();await p.waitForTimeout(150);
 ok((await p.locator('[aria-label="Mes anterior"]').innerText()).includes('Ene')===false&&(await p.locator('[aria-label="Mes siguiente"]').innerText()).includes('Ene ’27'),'selector: el mes vecino de otro año muestra el año (Ene ’27)');
 await p.getByText('Volver a hoy',{exact:true}).click();await p.waitForTimeout(200);
 ok((await p.locator('[aria-label="Mes elegido"]').innerText()).includes('Octubre 2026')&&(await p.getByText('Volver a hoy',{exact:true}).count())===0,'selector: "Volver a hoy" regresa al mes actual y desaparece');}
await p.locator('[aria-label="Ver Visa ICBC"]').click();await p.waitForTimeout(200);
ok((await txt()).includes('Pagar resumen')&&(await txt()).includes('‹ Volver a Tarjetas'),'tarjeta: abre su detalle con botón Volver a Tarjetas');
{const bg=await p.getByText('‹ Volver a Tarjetas',{exact:true}).last().evaluate(e=>{const x=e.parentElement;return [getComputedStyle(x).backgroundColor,getComputedStyle(x).borderTopWidth]});ok(bg[0]==='rgba(0, 0, 0, 0)'&&bg[1]==='0px','tarjeta: "Volver a Tarjetas" es un enlace discreto, igual que en Previsión');}
await clickText('Pagar resumen');await p.waitForTimeout(200);
ok((await txt()).includes('todavía no cerró'),'avisa que el resumen no cerró (adelanto)');
await clickText('Hacer adelanto');await p.waitForTimeout(200);
await p.locator('input').last().fill('5000');await clickText('Guardar');await p.waitForTimeout(200);
ok((await txt()).includes('¿Adelantar $5.000'),'confirma el adelanto');
await clickText('Adelantar');await p.waitForTimeout(300);
{const t=await txt();ok(t.includes('Adelanto guardado')&&t.includes('−$5.000')&&t.includes('Visa ICBC · resumen de')&&t.includes('Tu disponible pasa de'),'adelanto: ventana "Guardado" con el detalle y cómo cambió el disponible');}
s=await state();ok(s.pay.length===2&&s.pay.some(x=>x.amt===5000),'adelanto guardado');

// tarjeta: detalle nuevo (barra de pago, cuotas pendientes y edición de los gastos desde la lista)
{const c9=await b.newContext({viewport:{width:360,height:900}});const q=await c9.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/cards');await q.waitForTimeout(400);
 {const lt=(await q.innerText('body')).replace(/\s+/g,' ');
  const hero=q.locator('[aria-label^="Tarjeta "]');const nh=await hero.count();
  ok(nh>=1&&lt.includes('FALTA PAGAR $16.667')&&lt.includes('Pagado $0')&&lt.includes('Resumen $16.667')&&lt.includes('Total a abonar de todas las tarjetas'),'tarjetas: cada tarjeta de la lista es la pieza con "Falta pagar", cierre, pagado y resumen ('+nh+')');
  const bx=await hero.first().boundingBox();ok(bx.x>=0&&bx.x+bx.width<=360,'tarjetas: la pieza entra en 360px sin desbordar');
  await q.locator('[aria-label="Opciones de Visa ICBC"]').first().click();await q.waitForTimeout(250);
  const mt=(await q.innerText('body')).replace(/\s+/g,' ');
  ok(mt.includes('Editar nombre')&&mt.includes('Editar cierre de')&&mt.includes('Eliminar tarjeta')&&!mt.includes('Total del resumen')&&!mt.includes('Cuotas pendientes'),'tarjetas: los tres puntitos de la lista abren el editor de la tarjeta sin entrar al detalle');
  await q.getByText('Cancelar',{exact:true}).last().click({timeout:1500}).catch(()=>{});await q.waitForTimeout(200);}
 await q.locator('[aria-label="Ver Visa ICBC"]').click();await q.waitForTimeout(250);
 const T=async()=>(await q.innerText('body')).replace(/\s+/g,' '),ovf=async()=>(await q.evaluate(()=>document.documentElement.scrollWidth))<=360;
 let tx=await T();
 ok(tx.includes('FALTA PAGAR $16.667')&&tx.includes('Cierra el día 28')&&tx.includes('Pagado $0')&&tx.includes('Resumen $16.667')&&tx.includes('Compras del mes $16.667')&&tx.includes('Movimientos (1)')&&!tx.includes('Ver movimientos'),'tarjeta: arriba muestra cuánto falta pagar, cierre, pagado y resumen; los movimientos van en la misma pantalla');
 ok(/Cuotas pendientes 1 compra · falta 1 cuota · \$16\.667/.test(tx),'tarjeta: fila "Cuotas pendientes" con compras, cuotas que faltan y total');
 ok((await q.getByText('TV',{exact:true}).count())>=1&&(await q.locator('[aria-label="Opciones de TV"]').count())===1,'tarjeta: cada gasto del resumen tiene sus tres puntitos');
 ok(await ovf(),'tarjeta: sin desborde horizontal a 360px');
 await q.locator('[aria-label="Opciones de TV"]').click();await q.waitForTimeout(200);
 ok((await q.getByText('Editar',{exact:true}).count())>=1&&(await q.getByText('Borrar',{exact:true}).count())>=1,'tarjeta: los tres puntitos ofrecen Editar y Borrar');
 await q.getByText('Editar',{exact:true}).last().click();await q.waitForTimeout(350);
 await q.locator('input[aria-label="Monto"]').fill('60000');await q.getByText('Guardar cambios',{exact:true}).last().click();await q.waitForTimeout(350);
 {const st=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));tx=await T();
  ok(st.tx.some(x=>x.card&&(x.note==='TV'||x.cat==='Casa')&&x.amt===60000)&&tx.includes('$20.000')&&tx.includes('FALTA PAGAR $20.000'),'tarjeta: se edita un gasto desde la tarjeta y el resumen se recalcula (cuota de $20.000)');}
 await q.locator('[aria-label="Cuotas pendientes"]').click();await q.waitForTimeout(250);tx=await T();
 ok(tx.includes('Te falta pagar en cuotas $20.000')&&tx.includes('Cómo baja por mes')&&tx.includes('Por compra')&&tx.includes('Cuota 2 de 3 · en este resumen')&&tx.includes('Faltan 1 · $20.000')&&tx.includes('‹ Volver a Visa ICBC'),'cuotas pendientes: total, gráfico por mes y detalle por compra');
 ok(await ovf(),'cuotas pendientes: sin desborde horizontal a 360px');
 await q.locator('[aria-label="Opciones de TV"]').click();await q.waitForTimeout(200);
 ok((await q.getByText('Editar',{exact:true}).count())>=1,'cuotas pendientes: también se puede editar cada compra desde acá');
 await q.keyboard.press('Escape');await q.getByText('Cancelar',{exact:true}).last().click({timeout:1500}).catch(()=>{});await q.waitForTimeout(200);
 await q.getByText('‹ Volver a Visa ICBC',{exact:true}).last().click();await q.waitForTimeout(250);
 ok((await T()).includes('FALTA PAGAR'),'cuotas pendientes: "Volver a Visa ICBC" regresa a la tarjeta');
 await c9.close();}
// tarjetas: color y estilo por tarjeta (lista, editor en los tres puntitos, guardado)
{const c10=await b.newContext({viewport:{width:360,height:900}});const q=await c10.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 const d2=JSON.parse(seed);d2.cards=[...d2.cards,'Amex'];d2.tx.push({id:'ax1',type:'out',amt:30000,cat:'Ocio',note:'Cine',date:'2026-10-03',card:true,cardName:'Amex',fixed:false,inst:1,end:null,skip:[]});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},JSON.stringify(d2));await q.goto(PAGE+'#/cards');await q.waitForTimeout(450);
 const bgs=async()=>q.locator('[aria-label^="Tarjeta "]').evaluateAll(els=>els.map(e=>getComputedStyle(e).backgroundColor));
 let g=await bgs();
 ok(g.length>=3&&new Set(g).size===g.length,'tarjetas: cada tarjeta de la lista tiene su propio color por defecto ('+g.length+' tarjetas)');
 await q.locator('[aria-label="Opciones de Amex"]').first().click();await q.waitForTimeout(250);
 ok((await q.getByText('Color y estilo',{exact:true}).count())>=1,'tarjetas: los tres puntitos ofrecen "Color y estilo"');
 await q.getByText('Color y estilo',{exact:true}).last().click();await q.waitForTimeout(350);
 {const tx=(await q.innerText('body')).replace(/\s+/g,' ');
  ok(tx.includes('Color y estilo')&&(await q.locator('[aria-label^="Color "]').count())===8&&(await q.locator('[aria-label^="Estilo: "]').count())===5&&(await q.locator('[aria-label="Vista previa de la tarjeta"]').count())===1,'color y estilo: vista previa, 8 colores y 5 estilos');
  ok((await q.locator('input[aria-label^="Últimos 4"]').count())===0,'color y estilo: los últimos 4 números solo aparecen con la tarjeta física');
  const prev=()=>q.locator('[aria-label="Vista previa de la tarjeta"] [aria-label^="Tarjeta "]').evaluate(e=>{const c=getComputedStyle(e);return [c.backgroundColor,e.getBoundingClientRect().width,e.getBoundingClientRect().height]});
  const p0=await prev();
  await q.locator('[aria-label="Color Bordó"]').click();await q.waitForTimeout(150);const p1=await prev();
  ok(p0[0]!==p1[0],'color y estilo: la vista previa cambia al elegir otro color');
  await q.locator('[aria-label="Estilo: Tarjeta física"]').click();await q.waitForTimeout(150);
  const p2=await prev();ok((p2[1]/p2[2])>1.1,'color y estilo: "Tarjeta física" tiene forma de tarjeta (apaisada) ('+(p2[1]/p2[2]).toFixed(2)+')');
  ok((await q.locator('input[aria-label^="Últimos 4"]').count())===1,'color y estilo: la tarjeta física pide los últimos 4 números');
  await q.locator('input[aria-label^="Últimos 4"]').pressSequentially('45a21');await q.waitForTimeout(100);
  ok((await q.locator('input[aria-label^="Últimos 4"]').inputValue())==='4521'&&(await q.innerText('body')).includes('•••• 4521'),'color y estilo: acepta solo 4 dígitos y los muestra en la vista previa');
  ok((await q.evaluate(()=>document.documentElement.scrollWidth))<=360,'color y estilo: sin desborde horizontal a 360px');
  await q.getByText('Guardar',{exact:true}).last().click();await q.waitForTimeout(350);}
 {const st=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));const a=st.cardInfo.Amex||{};
  ok(a.color==='bordo'&&a.style==='fisica'&&a.last4==='4521','color y estilo: se guarda en la tarjeta (bordó, tarjeta física, 4521)');
  const hb=await q.locator('[aria-label="Tarjeta Amex"]').first().evaluate(e=>e.getBoundingClientRect().width/e.getBoundingClientRect().height);
  ok(hb>1.1,'tarjetas: la lista muestra la tarjeta con el estilo elegido');}
 // todos los estilos se ven bien y no desbordan
 for(const [sn] of [['Liso'],['Degradé'],['Franja de color'],['Borde lateral'],['Tarjeta física']]){
  await q.locator('[aria-label="Opciones de Amex"]').first().click();await q.waitForTimeout(200);await q.getByText('Color y estilo',{exact:true}).last().click();await q.waitForTimeout(300);
  await q.locator('[aria-label="Estilo: '+sn+'"]').click();await q.waitForTimeout(120);
  const r=await q.locator('[aria-label="Vista previa de la tarjeta"] [aria-label^="Tarjeta "]').evaluate(e=>{const r=e.getBoundingClientRect();return [r.x>=0,r.x+r.width<=360,document.documentElement.scrollWidth<=360]});
  ok(r.every(Boolean),'estilo "'+sn+'": la pieza entra en 360px sin desbordar');
  await q.getByText('Cancelar',{exact:true}).last().click();await q.waitForTimeout(250);}
 // detalle usa el mismo aspecto
 await q.locator('[aria-label="Ver Amex"]').click();await q.waitForTimeout(300);
 {const hb=await q.locator('[aria-label="Tarjeta Amex"]').first().evaluate(e=>e.getBoundingClientRect().width/e.getBoundingClientRect().height);ok(hb>1.1,'detalle: arriba tiene el mismo aspecto elegido');}
 await c10.close();}
// tarjeta nueva: toma el próximo color libre
{const c11=await b.newContext({viewport:{width:360,height:900}});const q=await c11.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/cards');await q.waitForTimeout(400);
 const before=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));
 await q.getByText('＋ Agregar tarjeta',{exact:true}).click();await q.waitForTimeout(250);await q.locator('input').last().fill('Naranja Pay');await q.getByText('Guardar',{exact:true}).last().click();await q.waitForTimeout(350);
 const st=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));
 const used=new Set(Object.values(before.cardInfo||{}).map(x=>x.color).filter(Boolean));
 ok(!!st.cardInfo['Naranja Pay']&&!!st.cardInfo['Naranja Pay'].color&&!used.has(st.cardInfo['Naranja Pay'].color),'agregar tarjeta: toma un color que no usa otra ('+(st.cardInfo['Naranja Pay']||{}).color+')');
 await c11.close();}
// ahorro: movimientos navegables por mes (depósitos, retiros, transferencias y ajustes); el total de arriba no cambia
{const c8=await b.newContext({viewport:{width:390,height:900}});const q=await c8.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 const d=JSON.parse(seed);d.sav.push({id:'m1',cat:'Acciones',amt:5000,date:'2026-10-03',note:'',adj:false},{id:'m2',cat:'Acciones',amt:700,date:'2026-10-04',note:'sube',adj:true},{id:'m3',cat:'Acciones',amt:-200,date:'2026-09-10',note:''},{id:'m0',cat:'Acciones',amt:900,date:'2026-09-01',note:''});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},JSON.stringify(d));await q.goto(PAGE+'#/savings');await q.waitForTimeout(400);
 const tx=async()=>(await q.innerText('body')).replace(/\n+/g,' | ');
 const total0=((await tx()).match(/Total ahorrado \| (\$[\d.]+)/)||[])[1];
 {const t0=await tx();ok(t0.includes('Octubre 2026')&&t0.includes('Ajuste · ganancia · Acciones')&&t0.includes('Depósito · Acciones')&&!t0.includes('Retiro · Acciones'),'movimientos de ahorro: abre en el mes actual y solo lista ese mes');}
 {const t0=await tx(),ps=[...t0.matchAll(/Por categoría[\s\S]*?(?=Movimientos)/g)].map(m=>[...m[0].matchAll(/· (<?\d+)%/g)].map(x=>x[1]==='<1'?0:+x[1]))[0]||[];
  const cols=await q.locator('[aria-label="Distribución del capital"] > div').evaluateAll(els=>els.map(e=>getComputedStyle(e).backgroundColor));
  const sum=ps.reduce((a,b)=>a+b,0);
  ok(ps.length>=3&&sum>=97&&sum<=103,'ahorro: cada categoría muestra su % del capital y suman ~100% ('+ps.join('+')+')');
  ok(cols.length>=2&&new Set(cols).size===cols.length,'ahorro: cada categoría tiene su propio color en la distribución ('+cols.length+' colores distintos)');}
 {const t0=await tx();const i1=t0.indexOf('Movimientos'),i2=t0.indexOf('Ahorraste'),i3=t0.indexOf('Octubre 2026');
  const m=t0.match(/Ahorraste · (\d+)% \| \$([\d.]+)/);
  ok(i1>0&&i2>i1&&i3>i2,'ahorro: "Ahorraste" va entre el título Movimientos y el selector de meses');
  ok(!!m&&m[2]==='5.000','ahorro: muestra el % y el monto ahorrado del mes ('+(m&&m[1])+'% · $'+(m&&m[2])+')');
  const col=await q.getByText('$5.000',{exact:true}).first().evaluate(e=>getComputedStyle(e).color);ok(col==='rgb(47, 111, 219)','ahorro: el monto usa el mismo azul que Estadísticas');}
 await q.locator('[aria-label="Mes anterior"]').click();await q.waitForTimeout(200);
 {const t1=await tx();ok(t1.includes('Septiembre 2026')&&t1.includes('Retiro · Acciones')&&t1.includes('Transferencia · USD → Auto')&&t1.includes('Depósito · USD')&&!t1.includes('Ajuste · ganancia'),'movimientos de ahorro: al ir al mes anterior muestra depósitos, retiros y transferencias de ese mes');
  ok(((t1.match(/Total ahorrado \| (\$[\d.]+)/)||[])[1])===total0,'movimientos de ahorro: el total de arriba no cambia al navegar ('+total0+')');}
 await q.getByText('Auto',{exact:true}).first().click();await q.waitForTimeout(200);
 {const t2=await tx();ok(t2.includes('Movimientos · Auto')&&t2.includes('Transferencia · USD → Auto')&&!t2.includes('Retiro · Acciones'),'movimientos de ahorro: el filtro por categoría se combina con el mes');}
 await q.getByText('Ver todas las categorías',{exact:true}).click();await q.waitForTimeout(150);
 await q.locator('[aria-label="Mes siguiente"]').click();await q.waitForTimeout(150);await q.locator('[aria-label="Mes siguiente"]').click();await q.waitForTimeout(150);
 ok((await tx()).includes('Sin movimientos en Noviembre de 2026'),'movimientos de ahorro: un mes sin movimientos lo dice');
 await c8.close();}
// barra inferior: ninguna etiqueta se parte en dos líneas (incluida "Estadísticas" activa) en pantallas angostas
for (const w of [320,360,390]) {
  const c7=await b.newContext({viewport:{width:w,height:800}});const q=await c7.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/stats');await q.waitForTimeout(400);
  const hs=[];for(const n of ['Resumen','Previsión','Tarjetas','Ahorro','Estadísticas','Datos']){const r=await q.getByText(n,{exact:true}).last().boundingBox();hs.push(r.height)}
  ok(hs.every(h=>h<16),'barra inferior: etiquetas en una sola línea ('+w+'px)');
  await c7.close();
}
// 5) ahorro: depósito + transferencia + borrar con saldo
await p.goto(PAGE+'#/savings');await p.waitForTimeout(300);
await clickText('Depositar');await p.waitForTimeout(200);
await p.locator('input[aria-label="Monto"], input').first().fill('7000');
await p.locator('[aria-label="Categoría"]').first().click();await p.waitForTimeout(150);
{const n=async x=>p.locator('[aria-label="'+x+'"]').count();
 ok((await n('Bonos'))===1&&(await n('Otro'))===1&&(await n('Acciones'))===1&&(await n('＋ Nueva categoría'))===1,'depositar: desplegable con todas las categorías y "＋ Nueva categoría" al final');}
await p.locator('[aria-label="Acciones"]').first().click();await p.waitForTimeout(150);
await clickText('Continuar');await p.waitForTimeout(200);
ok((await txt()).includes('Mover $7.000 de tu cuenta a Ahorro · Acciones'),'confirma el depósito con disponible');
await clickText('Depositar',true);await p.waitForTimeout(300);
s=await state();ok(s.sav.some(x=>x.cat==='Acciones'&&x.amt===7000),'depósito guardado');
await clickText('Retirar');await p.waitForTimeout(200);
await p.locator('[aria-label="Categoría"]').first().click();await p.waitForTimeout(150);
{const n=async x=>p.locator('[aria-label="'+x+'"]').count();
 ok((await n('USD'))===1&&(await n('Auto'))===1&&(await n('Acciones'))===1&&(await n('Bonos'))===0&&(await n('Otro'))===0&&(await n('＋ Nueva categoría'))===0&&(await txt()).includes('Saldo: $'),'retirar: desplegable solo con categorías con saldo (y su saldo), sin "Nueva"');}
await p.locator('[aria-label="Acciones"]').first().click();await p.waitForTimeout(150);
await p.locator('input[aria-label="Monto"]').fill('1000');await clickText('Continuar');await p.waitForTimeout(200);
ok((await txt()).includes('Retirar $1.000 de Ahorro · Acciones'),'retirar: confirma con la categoría elegida');
await clickText('Retirar',true);await p.waitForTimeout(300);
s=await state();ok(s.sav.some(x=>x.cat==='Acciones'&&x.amt===-1000),'retiro guardado');
// acciones de Ahorro (Depositar / Retirar / Transferir): tarjetas en una fila, misma altura, ícono y textos alineados a la izquierda
for (const [w,h] of [[320,700],[390,844],[820,1000],[1280,800]]) {
  const c3=await b.newContext({viewport:{width:w,height:h}});const q=await c3.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
  await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/savings');await q.waitForTimeout(400);
  const bx=[];for(const n of ['Depositar','Retirar','Transferir']){const el=q.locator('[aria-label="'+n+'"]').first();bx.push({r:await el.boundingBox(),t:await el.getByText(n,{exact:true}).boundingBox(),n:await el.getByText(/^(Sumar ahorro|Sacar plata|Entre categorías)$/).count()?await el.getByText(/^(Sumar ahorro|Sacar plata|Entre categorías)$/).boundingBox():null});}
  ok(bx.every(x=>Math.abs(x.r.y-bx[0].r.y)<1&&Math.abs(x.r.height-bx[0].r.height)<1),'acciones de ahorro alineadas y de igual altura ('+w+'px)');
  ok(bx.every(x=>x.t.x>=x.r.x+8&&x.t.x+x.t.width<=x.r.x+x.r.width-8&&(!x.n||x.n.x+x.n.width<=x.r.x+x.r.width-8)),'texto de cada acción dentro de su tarjeta, sin cortarse ('+w+'px)');
  ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'ahorro sin desplazamiento horizontal ('+w+'px)');
  const tx=(await q.innerText('body')).replace(/\s+/g,' ');
  ok(tx.includes('Actualizar saldo (ganancia o pérdida)')&&tx.includes('Nueva categoría')&&!tx.includes('＋ Nueva categoría'),'ahorro: "Actualizar saldo" y "Nueva categoría" son filas dentro de Por categoría ('+w+'px)');
  await c3.close();
}
await clickText('Transferir');await p.waitForTimeout(200);
{const t0=await txt();ok(t0.includes('Desde')&&t0.includes('Hacia')&&t0.includes('Saldo: $'),'transferencia: desplegables Desde/Hacia con saldo bajo cada cuenta');}
await p.locator('[aria-label="Desde"]').first().click();await p.waitForTimeout(150);
ok((await p.locator('[aria-label="Desde"]').count())>=1&&(await txt()).includes('Saldo: $'),'el desplegable lista las cuentas con su saldo');
{const n=async x=>p.locator('[aria-label="'+x+'"]').count();
 ok((await n('USD'))===1&&(await n('Auto'))===1&&(await n('Acciones'))===1&&(await n('Bonos'))===0&&(await n('Otro'))===0&&(await n('Inversiones'))===0,'origen: solo categorías con saldo (USD, Auto y Acciones, que recién recibió un depósito)');}
await p.locator('[aria-label="Desde"]').first().click();await p.waitForTimeout(150);
// tocar el campo Monto con un toque real: la hoja no se cierra y se puede escribir
await p.locator('input[aria-label="Monto"]').click();await p.keyboard.type('3000');await p.waitForTimeout(200);
ok((await p.locator('input[aria-label="Monto"]').count())===1&&(await p.locator('input[aria-label="Monto"]').inputValue())==='3000','Monto: toque real, escribe y la hoja sigue abierta');
await p.locator('input[aria-label="Monto"]').fill('');
await p.locator('input').first().fill('3000');await clickText('Continuar');await p.waitForTimeout(200);
await clickText('Transferir',true);await p.waitForTimeout(300);
s=await state();ok(s.sav.filter(x=>x.tid&&x.amt===-3000||x.tid&&x.amt===3000).length>=2,'transferencia = dos movimientos');
// no se puede borrar USD con saldo
await p.locator('[aria-label="Quitar categoría"]').first().click();await p.waitForTimeout(200);
ok((await txt()).includes('Solo se elimina con saldo cero'),'bloquea borrar categoría con saldo');
// ajuste de saldo: ganancia / pérdida sin tocar el disponible
await p.keyboard.press('Escape');await p.waitForTimeout(150);
{const availTxt=async()=>((await txt()).match(/Disponible ahora: (\$[\d.]+)/)||[])[1];
 const balAcc=async()=>{const st=await state();return st.sav.filter(x=>x.cat==='Acciones').reduce((a,x)=>a+x.amt,0)};
 const av0=await availTxt();const b0=await balAcc();
 await clickText('Actualizar saldo (ganancia o pérdida)',false);await p.waitForTimeout(250);
 {const t0=await txt();ok(t0.includes('Actualizar saldo')&&t0.includes('¿Cuánto vale hoy?')&&t0.includes('no cambia tu cuenta disponible'),'ajuste: formulario "Actualizar saldo" con aviso de que no toca el disponible');}
 await p.locator('[aria-label="Categoría"]').first().click();await p.waitForTimeout(150);
 ok((await txt()).includes('Figura: $'),'ajuste: el desplegable muestra lo que figura en cada categoría');
 await p.locator('[aria-label="Acciones"]').first().click();await p.waitForTimeout(150);
 ok(Math.round(+(await p.locator('input[aria-label="¿Cuánto vale hoy?"]').inputValue()))===Math.round(b0),'ajuste: parte del valor actual de la categoría');
 await p.locator('input[aria-label="¿Cuánto vale hoy?"]').fill(String(b0+2000));await p.waitForTimeout(150);
 ok((await txt()).includes('Ganancia: +$2.000'),'ajuste: muestra la diferencia como ganancia al escribir');
 await clickText('Continuar');await p.waitForTimeout(200);
 ok((await txt()).includes('Se registra una ganancia de $2.000. Tu cuenta disponible no cambia.'),'ajuste: confirma la ganancia y avisa que no cambia el disponible');
 await clickText('Actualizar saldo',true);await p.waitForTimeout(300);
 s=await state();ok(s.sav.some(x=>x.adj&&x.cat==='Acciones'&&x.amt===2000),'ajuste: guardado como ganancia de $2.000');
 ok((await availTxt())===av0,'ajuste: el disponible no cambió ('+av0+')');
 {const t1=await txt();ok(t1.includes('Ganancia +$2.000')&&t1.includes('Rendimiento acumulado: +$2.000')&&t1.includes('Ajuste · ganancia · Acciones'),'ajuste: la categoría muestra aportado y ganancia, hay rendimiento acumulado y el movimiento figura como ajuste');}
 // pérdida
 await clickText('Actualizar saldo (ganancia o pérdida)',false);await p.waitForTimeout(250);
 await p.locator('[aria-label="Categoría"]').first().click();await p.waitForTimeout(150);await p.locator('[aria-label="Acciones"]').first().click();await p.waitForTimeout(150);
 await p.locator('input[aria-label="¿Cuánto vale hoy?"]').fill(String(b0+1500));await p.waitForTimeout(150);
 ok((await txt()).includes('Pérdida: −$500'),'ajuste: muestra la pérdida');
 await clickText('Continuar');await p.waitForTimeout(200);await clickText('Actualizar saldo',true);await p.waitForTimeout(300);
 ok((await balAcc())===b0+1500&&(await availTxt())===av0,'ajuste: pérdida registrada; valor de la categoría actualizado y disponible intacto');
 ok((await txt()).includes('Rendimiento acumulado: +$1.500'),'ajuste: rendimiento acumulado = ganancia − pérdida');
 // mismo valor: no hace nada
 await clickText('Actualizar saldo (ganancia o pérdida)',false);await p.waitForTimeout(250);
 await p.locator('[aria-label="Categoría"]').first().click();await p.waitForTimeout(150);await p.locator('[aria-label="Acciones"]').first().click();await p.waitForTimeout(150);
 await clickText('Continuar');await p.waitForTimeout(200);
 ok((await txt()).includes('ya vale ese monto'),'ajuste: sin diferencia avisa y no guarda');
 await clickText('Cancelar',true);await p.waitForTimeout(250);
 // editar y borrar un ajuste desde el menú del movimiento
 const dotsOf=async label=>{const h=await p.getByText(label,{exact:false}).first().elementHandle();const btn=await h.evaluateHandle(el=>{let n=el;while(n&&!n.querySelector('[aria-label="Opciones"]'))n=n.parentElement;return n.querySelector('[aria-label="Opciones"]')});await btn.asElement().scrollIntoViewIfNeeded();await btn.asElement().click({force:true});await p.waitForTimeout(200)};
 await dotsOf('Ajuste · pérdida · Acciones');
 ok((await txt()).includes('Editar')&&(await txt()).includes('Borrar'),'ajuste: el menú ofrece Editar y Borrar');
 await clickText('Borrar',true);await p.waitForTimeout(200);
 ok((await txt()).includes('Tu cuenta disponible no cambia.')&&(await txt()).includes('¿Borrar este ajuste'),'ajuste: aviso claro antes de borrar');
 await clickText('Borrar',true);await p.waitForTimeout(300);
 ok((await balAcc())===b0+2000&&(await availTxt())===av0,'ajuste: borrado; vuelve a la ganancia anterior y el disponible sigue igual');
 await dotsOf('Ajuste · ganancia · Acciones');await clickText('Editar',true);await p.waitForTimeout(250);
 ok((await txt()).includes('Actualizar saldo')&&Math.round(+(await p.locator('input[aria-label="¿Cuánto vale hoy?"]').inputValue()))===Math.round(b0+2000),'ajuste: editar abre el mismo formulario con el valor resultante');
 await p.locator('input[aria-label="¿Cuánto vale hoy?"]').fill(String(b0+3000));await clickText('Continuar');await p.waitForTimeout(200);
 await clickText('Guardar cambios',true);await p.waitForTimeout(300);
 s=await state();ok(s.sav.filter(x=>x.adj).length===1&&s.sav.find(x=>x.adj).amt===3000&&(await availTxt())===av0,'ajuste: editado a ganancia de $3.000 sin tocar el disponible');
 // el ajuste no aparece como depósito/retiro en Inicio ni en Estadísticas
 await p.goto(PAGE+'#/');await p.waitForTimeout(300);
 ok(!(await txt()).includes('Ajuste ·'),'ajuste: no se mezcla con los movimientos de Inicio');
 await p.goto(PAGE+'#/savings');await p.waitForTimeout(300);
}

// formulario de gasto con tarjeta: los botones Guardar / Cancelar quedan siempre a la vista (celulares chicos, pantalla baja por el teclado, escritorio)
for(const [w,h] of [[320,568],[360,640],[390,844],[360,420],[1280,800]]){const cn=await b.newContext({viewport:{width:w,height:h}});const q=await cn.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/');await q.waitForTimeout(400);
 await openNew(q,w,'Gasto con tarjeta');
 await q.locator('input[aria-label="Monto"]').fill('4500');
 ok((await q.getByText('Más opciones',{exact:false}).count())===1&&!(await q.innerText('body')).includes('Fijo mensual'),'gasto con tarjeta @'+w+': muestra "Más opciones" plegado');
 await q.getByText('Más opciones',{exact:false}).click();await q.waitForTimeout(150);await q.locator('[aria-label="¿Cada cuánto?"]').click();await q.waitForTimeout(200);
 {const tt=await q.innerText('body');ok(tt.includes('Solo este mes')&&tt.includes('Fijo mensual')&&!tt.includes('Se repite cada semana')&&!tt.includes('Se repite cada mes')&&!tt.includes('Ya está pagado')&&!tt.includes('Efectivo / débito'),'gasto con tarjeta @'+w+': "Más opciones" ofrece solo "Solo este mes" y "Fijo mensual"');}
 await q.getByText('Fijo mensual',{exact:false}).last().click();await q.waitForTimeout(200);
 ok(!(await q.getByText('Cuotas',{exact:true}).count()),'gasto con tarjeta @'+w+': fijo mensual oculta las cuotas');
 await q.locator('[aria-label="¿Cada cuánto?"]').click();await q.waitForTimeout(200);await q.getByText('Solo este mes',{exact:true}).last().click();await q.waitForTimeout(200);
 await q.getByText('Más opciones',{exact:false}).click();await q.waitForTimeout(150);
 await q.locator('[aria-label="Tarjeta"]').click();await q.waitForTimeout(150);
 const vis=async name=>{const bb=await q.getByText(name,{exact:true}).last().boundingBox();return !!bb&&bb.y>=0&&bb.y+bb.height<=h&&bb.x>=0&&bb.x+bb.width<=w};
 {await q.waitForTimeout(500);const li=await q.locator('[aria-label="＋ Nueva tarjeta"]').boundingBox(),gu=await q.getByText('Guardar',{exact:true}).last().boundingBox();
  ok(!!li&&li.y>=0&&li.y+li.height<=gu.y,'gasto con tarjeta @'+w+'x'+h+': al desplegar, la lista de tarjetas se desplaza sola y queda entera a la vista (sobre Guardar)');}
 {const cb=await q.getByText('Cancelar',{exact:true}).last().boundingBox();ok(cb.height<30,'gasto con tarjeta @'+w+'x'+h+': "Cancelar" cabe en una sola línea');}
 ok(await vis('Guardar')&&await vis('Cancelar'),'gasto con tarjeta @'+w+'x'+h+': Guardar y Cancelar siempre a la vista (con la lista de tarjetas abierta)');
 await q.locator('[aria-label="Visa Bna"]').click();await q.waitForTimeout(150);
 ok(await vis('Guardar'),'gasto con tarjeta @'+w+'x'+h+': Guardar a la vista tras elegir tarjeta');
 const sc=await q.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return /(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+2});return els.length});
 ok(h>=800||sc>=1,'gasto con tarjeta @'+w+'x'+h+': si no entra todo, el formulario se desplaza por dentro'+(h>=800?' (no hace falta)':''));
 await q.locator('[aria-label="Cuotas: 3"]').scrollIntoViewIfNeeded().catch(()=>{});
 await q.locator('[aria-label="Cuotas: 3"]').click();await q.waitForTimeout(100);
 {const bt=await q.innerText('body');ok(bt.includes('3 cuotas de $1.500 cada una · total $4.500'),'gasto con tarjeta @'+w+'x'+h+': muestra "3 cuotas de $1.500 cada una · total $4.500"');
  await q.locator('input[aria-label="Monto"]').fill('100000');
  const b2=await q.innerText('body');ok(b2.includes('3 cuotas de $33.333 cada una (aprox.)'),'gasto con tarjeta @'+w+'x'+h+': si la cuota no es exacta lo aclara (aprox.)');
  await q.locator('[aria-label="Cuotas: 1"]').click();await q.waitForTimeout(100);
  ok((await q.innerText('body')).includes('Pago único de $100.000'),'gasto con tarjeta @'+w+'x'+h+': con 1 cuota dice "Pago único"');
  await q.locator('input[aria-label="Monto"]').fill('4500');await q.locator('[aria-label="Cuotas: Otra"]').click();await q.waitForTimeout(100);await q.locator('input[aria-label="¿Cuántas cuotas?"]').fill('18');
  ok((await q.innerText('body')).includes('18 cuotas de $250 cada una'),'gasto con tarjeta @'+w+'x'+h+': "Otra" permite escribir cualquier cantidad de cuotas');
  await q.locator('[aria-label="Cuotas: 3"]').click();await q.waitForTimeout(100);}
 await q.getByText('Guardar',{exact:true}).last().click();await q.waitForTimeout(300);
 const st=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));
 const nt=st.tx.filter(x=>x.amt===4500);
 ok(nt.length>=1&&nt.every(x=>x.card&&x.cardName==='Visa Bna'&&x.inst===3),'gasto con tarjeta @'+w+'x'+h+': se guardó con la tarjeta elegida y 3 cuotas');
 await cn.close();}

// diálogos largos en pantalla baja: el botón Cancelar queda a la vista y las opciones se desplazan
{const cn=await b.newContext({viewport:{width:320,height:420}});const q=await cn.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/data');await q.waitForTimeout(400);
 await q.getByText('Restaurar',{exact:true}).last().click();await q.waitForTimeout(150);
 await q.locator('textarea').fill(fs.readFileSync(path.join(root,'supabase/tests/legacy-sample.json'),'utf8'));
 await q.getByText('Revisar respaldo',{exact:true}).click();await q.waitForTimeout(250);
 const bb=await q.getByText('Cancelar',{exact:true}).last().boundingBox();
 ok(!!bb&&bb.y>=0&&bb.y+bb.height<=420,'diálogo de restaurar @320x420: Cancelar siempre a la vista');
 await q.getByText('Restaurar sin guardar copia',{exact:true}).scrollIntoViewIfNeeded();
 const b2=await q.getByText('Restaurar sin guardar copia',{exact:true}).boundingBox();
 ok(!!b2&&b2.y>=0&&b2.y+b2.height<=420,'diálogo de restaurar @320x420: las opciones se alcanzan desplazando');
 await cn.close();}

// menú inferior: barra flotante con íconos dibujados (SVG) y recuadro amarillo en el activo
for(const w of [320,360,390,430]){const cn=await b.newContext({viewport:{width:w,height:760}});const q=await cn.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/savings');await q.waitForTimeout(400);
 const bar=await q.locator('[role="tablist"]').boundingBox(),fab=await q.locator('[aria-label="Agregar movimiento"]').boundingBox();
 const links=q.locator('[role="tablist"] [aria-label]'),n=await links.count();
 const svgs=await q.locator('[role="tablist"] svg').count();
 ok(bar.x>=4&&bar.x+bar.width<=w-4&&bar.y+bar.height<=760-4,'menú @'+w+': la barra flota con margen a los costados y abajo');
 ok(n===6&&svgs===6,'menú @'+w+': 6 pestañas, cada una con su ícono SVG');
 const act=await q.locator('[role="tablist"] [aria-label="Ahorro"] > div').first().evaluate(e=>getComputedStyle(e).backgroundColor);
 const idle=await q.locator('[role="tablist"] [aria-label="Resumen"] > div').first().evaluate(e=>getComputedStyle(e).backgroundColor);
 ok(act==='rgb(226, 167, 46)'&&idle!==act,'menú @'+w+': solo la pestaña activa lleva el recuadro amarillo');
 const lab=await q.locator('[role="tablist"] span, [role="tablist"] div').evaluateAll(els=>els.filter(e=>e.children.length===0&&e.textContent==='Estadísticas').map(e=>e.scrollWidth<=e.clientWidth+1));
 ok(lab.length===1&&lab[0],'menú @'+w+': "Estadísticas" se lee completo');
 ok(fab.y+fab.height<=bar.y-4,'menú @'+w+': el botón + queda por encima de la barra sin taparla');
 await cn.close();}

// estadísticas: barra azul de ahorro en el gráfico y colores propios por categoría de gasto
{const c9=await b.newContext({viewport:{width:390,height:900}});const q=await c9.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 const d=JSON.parse(seed);d.sav.push({id:'e1',cat:'Acciones',amt:5000,date:'2026-10-03',note:''},{id:'e2',cat:'Acciones',amt:3000,date:'2026-08-03',note:''});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},JSON.stringify(d));await q.goto(PAGE+'#/stats');await q.waitForTimeout(400);
 const blue=await q.locator('[aria-label^="Ahorro "]').evaluateAll(els=>els.map(e=>[e.getAttribute('aria-label'),getComputedStyle(e).backgroundColor]));
 ok(blue.length>=2&&blue.some(x=>x[0]==='Ahorro Oct')&&blue.some(x=>x[0]==='Ahorro Ago')&&new Set(blue.map(x=>x[1])).size===1,'estadísticas: barra azul de ahorro solo en los meses con ahorro ('+blue.map(x=>x[0]).join(', ')+')');
 ok(!blue.some(x=>x[0]==='Ahorro Jul')&&!blue.some(x=>x[0]==='Ahorro Jun'),'estadísticas: sin barra azul en los meses sin ahorro');
 {const bt=await q.innerText('body');const m=bt.match(/Ahorraste · (\d+)%/),inc=bt.match(/de tus ingresos del mes \(\$([\d.]+)\)/);
  ok(!!m&&!!inc&&+m[1]===Math.round(5000/+inc[1].replace(/\./g,'')*100),'estadísticas: junto a "Ahorraste" muestra el % de ahorro sobre los ingresos del mes ('+(m&&m[1])+'%)');
  const amt=await q.getByText('$5.000',{exact:true}).first().evaluate(e=>getComputedStyle(e).color),bar=await q.locator('[aria-label="Ahorro Oct"]').evaluate(e=>getComputedStyle(e).backgroundColor);
  ok(amt===bar,'estadísticas: el importe de "Ahorro del mes" tiene el mismo azul que la barra del gráfico ('+amt+')');}
 ok((await q.innerText('body')).includes('Azul: ahorro del mes'),'estadísticas: la leyenda explica el azul');
 const cols=await q.locator('[aria-expanded]').evaluateAll(els=>els.map(e=>{const bar=e.lastElementChild&&e.lastElementChild.firstElementChild;return bar&&e.textContent.includes('%')?getComputedStyle(bar).backgroundColor:''}).filter(Boolean));
 ok(cols.length>=3&&new Set(cols).size===cols.length,'estadísticas: cada categoría de gasto tiene su color ('+cols.length+' categorías)');}

// previsión: detalle del mes con gastos fijos, dos columnas por categoría y filtro
{const c5=await b.newContext({viewport:{width:360,height:900}});const q=await c5.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 const dsv=JSON.parse(seed);dsv.sav.push({id:'f1',cat:'Acciones',amt:30000,date:'2026-10-05',note:''},{id:'f2',cat:'Acciones',amt:-10000,date:'2026-11-05',note:''});
 await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},JSON.stringify(dsv));await q.goto(PAGE+'#/forecast');await q.waitForTimeout(400);
 {const mny=x=>+x.replace(/[^\d-]/g,'');
  const cards=(await q.locator('[aria-label^="Resumen de "]').allInnerTexts()).map(x=>x.replace(/\s+/g,' '));
  ok(cards.length===6&&cards.every(c=>/Saldo del mes anterior/.test(c)&&/Ingresos/.test(c)&&/Gastos/.test(c)&&/Saldo previsto al cierre/.test(c)&&!/Ingresan|Salen/.test(c)),'previsión: cada uno de los 6 meses muestra saldo anterior, Ingresos, Gastos y saldo previsto');
  const P=cards.map(c=>{const carry=c.match(/Saldo del mes anterior (-?\$[\d.]+)/),eq=c.match(/(-?\$[\d.]+) − (-?\$[\d.]+)(?: ([−+]) (\$[\d.]+))? = (− )?(\$[\d.]+)/),pv=c.match(/Saldo previsto al cierre (-?\$[\d.]+) ([+−]) (\$[\d.]+) (-?\$[\d.]+)/),ch=c.match(/Te (sobran|faltan) (\$[\d.]+) este mes|Este mes queda en \$0/);return carry&&eq&&pv&&ch?{carry:mny(carry[1]),inc:mny(eq[1]),out:mny(eq[2]),sv:eq[3]?(eq[3]==='−'?1:-1)*mny(eq[4]):0,net:(eq[5]?-1:1)*mny(eq[6]),chip:ch[1]?(ch[1]==='sobran'?1:-1)*mny(ch[2]):0,pc:mny(pv[1]),pn:(pv[2]==='−'?-1:1)*mny(pv[3]),prev:mny(pv[4])}:null});
  ok(P.every(Boolean),'previsión: cada mes muestra el neto con su cuenta y el previsto con su cuenta');
  ok(P.every(x=>x&&Math.abs(x.inc-x.out-x.sv-x.net)<=1&&x.chip===x.net),'previsión: neto del mes = ingresos − gastos − ahorro, y el cartel dice lo mismo ('+P.map(x=>x&&x.net).join(', ')+')');
  ok(P.every(x=>x&&Math.abs(x.carry+x.pn-x.prev)<=1&&x.pc===x.carry&&x.pn===x.net),'previsión: previsto = saldo anterior + neto del mes');
  ok(P[0].sv===30000&&P[1].sv===-10000&&/Ahorro \$30\.000/.test(cards[0])&&/Retiro de ahorro \$10\.000/.test(cards[1])&&!/Ahorro/.test(cards[2]),'previsión: el ahorro del mes aparece aparte (Ahorro / Retiro de ahorro) y no aparece si no hubo');
  ok(P.every((x,k)=>k===0||x.carry===P[k-1].prev),'previsión: el saldo anterior de cada mes es el previsto del mes anterior');
   {const w=await q.locator('[aria-label="Saldo previsto al cierre"]').evaluateAll(els=>els.map(e=>{const v=e.lastElementChild;return v.getBoundingClientRect().height<30}));ok(w.length>=6&&w.every(Boolean),'previsión: el previsto no se parte en dos líneas a 360px ('+w.length+' meses)');}
  {const bx=async k=>q.locator('[aria-label="Resumen de '+k+'"]').boundingBox();
   const b0=await bx('Octubre de 2026'),b1=await bx('Noviembre de 2026');
   ok(Math.abs(b0.y-b1.y)<1&&b1.x>=b0.x+b0.width&&b0.x+b0.width<=360&&b1.x<360,'previsión: los meses se deslizan hacia los costados (uno al lado del otro; asoma el siguiente a 360px)');
   const sc=await q.locator('[aria-label="Meses"]').evaluate(e=>[e.scrollWidth>e.clientWidth,getComputedStyle(e).overflowX]);
   ok(sc[0]&&sc[1]==='auto','previsión: el carrusel de meses tiene desplazamiento horizontal');
   ok(cards.every(c=>!c.includes('›')),'previsión: sin flechita en la parte alta de cada mes');
   ok((await q.getByText('Mostrar detalle',{exact:true}).count())===6,'previsión: cada mes tiene "Mostrar detalle" abajo');
   const bot=await q.getByText('Mostrar detalle',{exact:true}).first().boundingBox(),cb=await q.locator('[aria-label="Meses"] >> nth=0').boundingBox();
   ok(bot.y>b0.y+b0.height*0.6,'previsión: "Mostrar detalle" va debajo de todo el resumen');
   const hs=await q.locator('[aria-label="Resumen de Octubre de 2026"] div').evaluateAll(els=>els.filter(e=>getComputedStyle(e).overflow==='hidden'&&e.getBoundingClientRect().height>0&&e.getBoundingClientRect().height<=12).map(e=>e.getBoundingClientRect().height));
   ok(hs.length>=2&&hs.every(h=>h===8),'previsión: las barras de Ingresos, Gastos y Ahorro miden lo mismo que la de pendientes (8px) ('+hs.join(',')+')');
   const step=b1.x-b0.x;
   await q.locator('[aria-label="Meses"]').evaluate((e,x)=>{e.scrollLeft=x},step*2);await q.waitForTimeout(500);
   ok((await q.locator('[aria-label="Ir a Diciembre de 2026"]').getAttribute('aria-selected'))==='true','previsión: al deslizar, el punto de abajo marca el mes que se ve');
   await q.locator('[aria-label="Ir a Octubre de 2026"]').click();await q.waitForTimeout(900);
   ok((await q.locator('[aria-label="Meses"]').evaluate(e=>e.scrollLeft))<3,'previsión: tocar un punto lleva a ese mes');}
  await q.locator('[aria-label="Mostrar detalle de Octubre de 2026"]').click();await q.waitForTimeout(250);
  const dt=(await q.innerText('body')).replace(/\s+/g,' ');
  ok(dt.includes('Saldo del mes anterior')&&dt.includes('Saldo previsto al cierre')&&dt.includes((cards[0].match(/Te (?:sobran|faltan) \$[\d.]+ este mes|Este mes queda en \$0/)||['?'])[0]),'previsión: el detalle del mes muestra el mismo resumen (saldo anterior, neto y previsto)');
 }
 const tx=(await q.innerText('body'));
 ok(tx.includes('‹ Volver a Previsión')&&!/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(tx),'previsión: botón "Volver a Previsión" y meses con mayúscula inicial');
 ok(!tx.includes('Gastos fijos del mes')&&tx.includes('Del mes')&&tx.includes('Solo fijos')&&!tx.includes('Sin fijos'),'previsión: sin el widget de gastos fijos; filtros Todos / Solo fijos / Del mes');
 const ci=await q.locator('[aria-label="Columna Ingresos"]').boundingBox(),cg=await q.locator('[aria-label="Columna Gastos"]').boundingBox();
 ok(ci.x+ci.width<=cg.x+1&&Math.abs(ci.y-cg.y)<1&&cg.x+cg.width<=360,'previsión: ingresos y gastos en dos columnas lado a lado (360px)');
 ok((await q.locator('[aria-label="Gastos · Ocio"]').count())===1,'previsión: gastos agrupados por categoría');
 await q.getByText('Solo fijos',{exact:true}).last().click();await q.waitForTimeout(200);
 ok((await q.locator('[aria-label="Columna Gastos"]').innerText()).includes('$9.000'),'previsión: "Solo fijos" muestra el total de gastos fijos del mes ($9.000)');
 ok((await q.locator('[aria-label="Gastos · Ocio"]').count())===0&&(await q.locator('[aria-label="Gastos · Mascotas"]').count())===1,'previsión: filtro "Solo fijos" deja solo los fijos');
 await q.getByText('Del mes',{exact:true}).last().click();await q.waitForTimeout(200);
 ok((await q.locator('[aria-label="Gastos · Ocio"]').count())===1&&(await q.locator('[aria-label="Gastos · Mascotas"]').count())===0,'previsión: filtro "Del mes" quita los fijos');
 // editar un gasto fijo: "este mes y los siguientes" y después "solo este mes"
 await q.getByText('Solo fijos',{exact:true}).last().click();await q.waitForTimeout(150);
 await q.locator('[aria-label="Gastos · Mascotas"]').click();await q.waitForTimeout(150);
 await q.locator('[aria-label="Opciones de Alimento"]').click();await q.waitForTimeout(200);
 {const t2=await q.innerText('body');ok(t2.includes('Editar solo este mes')&&t2.includes('Editar este mes y los siguientes'),'fijo: el menú ofrece "solo este mes" y "este mes y los siguientes"');}
 await q.getByText('Editar este mes y los siguientes',{exact:true}).last().click();await q.waitForTimeout(250);
 {const t4=await q.innerText('body');ok(t4.includes('Se cambia Octubre de 2026 y todos los meses siguientes'),'fijo "este mes y siguientes": aviso claro');}
 await q.locator('input[aria-label="Monto"]').fill('9500');await q.getByText('Guardar cambios',{exact:true}).last().click();await q.waitForTimeout(350);
 {const st=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));const fx=st.tx.filter(x=>x.fixed&&x.cat==='Mascotas');
  ok(fx.length===2&&fx.some(x=>x.amt===9000&&x.end===2026*12+8)&&fx.some(x=>x.amt===9500),'fijo "este mes y siguientes": la serie vieja termina en septiembre y la nueva arranca en octubre con $9.500');}
 await q.locator('[aria-label="Opciones de Alimento"]').click();await q.waitForTimeout(200);
 await q.getByText('Editar solo este mes',{exact:true}).last().click();await q.waitForTimeout(250);
 {const t3=await q.innerText('body');ok(t3.includes('Se cambia solo Octubre de 2026')&&!t3.includes('Fijo mensual'),'fijo "solo este mes": aviso claro y sin el selector de fijo');}
 await q.locator('input[aria-label="Monto"]').fill('12000');await q.getByText('Guardar cambios',{exact:true}).last().click();await q.waitForTimeout(350);
 {const st=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));const f=st.tx.find(x=>x.fixed&&x.cat==='Mascotas'&&x.amt===9500);const one=st.tx.find(x=>!x.fixed&&x.cat==='Mascotas');
  ok(f&&(f.skip||[]).includes(2026*12+9)&&one&&one.amt===12000,'fijo "solo este mes": octubre pasa a $12.000 y la serie queda intacta');}
 // el mes editado sigue ofreciendo las 4 opciones (editar/borrar solo este mes o este mes y los siguientes)
 await q.locator('[aria-label="Opciones de Alimento"]').click();await q.waitForTimeout(200);
 {const t5=await q.innerText('body');ok(['Editar solo este mes','Editar este mes y los siguientes','Borrar solo este mes','Borrar este mes y los siguientes'].every(x=>t5.includes(x)),'mes editado de un fijo: vuelve a ofrecer editar y borrar (solo este mes / este mes y los siguientes)');}
 await q.getByText('Editar este mes y los siguientes',{exact:true}).last().click();await q.waitForTimeout(250);
 {const t6=await q.innerText('body');ok(t6.includes('Se cambia Octubre de 2026 y todos los meses siguientes')&&t6.includes('Fijo mensual'),'mes editado: "este mes y siguientes" vuelve a ser fijo mensual');}
 await q.locator('input[aria-label="Monto"]').fill('7000');await q.getByText('Guardar cambios',{exact:true}).last().click();await q.waitForTimeout(350);
 {const st=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));const m=st.tx.filter(x=>x.cat==='Mascotas');
  ok(!m.some(x=>x.of)&&m.some(x=>x.fixed&&x.amt===7000)&&!m.some(x=>x.fixed&&x.amt===9500),'mes editado + "este mes y siguientes": la edición puntual se absorbe y rige $7.000 desde octubre');}
 await q.locator('[aria-label="Opciones de Alimento"]').click();await q.waitForTimeout(200);
 await q.getByText('Borrar este mes y los siguientes',{exact:true}).last().click();await q.waitForTimeout(300);
 {const tb=await q.innerText('body');ok(tb.includes('¿Borrar "Alimento" de')&&tb.includes('todos los meses siguientes'),'borrar este mes y los siguientes: pide confirmación antes de borrar');}
 await q.getByText('Cancelar',{exact:true}).last().click();await q.waitForTimeout(250);
 {const st=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));ok(st.tx.some(x=>x.cat==='Mascotas'),'borrar este mes y los siguientes: cancelar no borra nada');}
 await q.locator('[aria-label="Opciones de Alimento"]').click();await q.waitForTimeout(200);
 await q.getByText('Borrar este mes y los siguientes',{exact:true}).last().click();await q.waitForTimeout(300);
 await q.getByText('Borrar',{exact:true}).last().click();await q.waitForTimeout(350);
 {const st=await q.evaluate(()=>JSON.parse(localStorage.getItem('equa-local-v1')));
  ok(!st.tx.some(x=>x.cat==='Mascotas'&&(x.of||(x.fixed&&x.amt!==9000))),'borrar este mes y los siguientes: no queda el fijo nuevo ni meses editados');}
 await q.getByText('‹ Volver a Previsión',{exact:true}).last().click();await q.waitForTimeout(200);
 ok((await q.innerText('body')).includes('Disponible hoy'),'previsión: volver a la lista de meses');
 {await q.locator('[aria-label="Ir a Diciembre de 2026"]').click();await q.waitForTimeout(900);
  await q.locator('[aria-label="Mostrar detalle de Diciembre de 2026"]').click();await q.waitForTimeout(250);
  const bg=await q.getByText('‹ Volver a Previsión',{exact:true}).last().evaluate(e=>{const p=e.parentElement;return [getComputedStyle(p).backgroundColor,getComputedStyle(p).borderTopWidth]});
  ok(bg[0]==='rgba(0, 0, 0, 0)'&&bg[1]==='0px','previsión: "Volver a Previsión" es un enlace discreto, sin caja ni relleno');
  await q.getByText('‹ Volver a Previsión',{exact:true}).last().click();await q.waitForTimeout(400);
  ok((await q.locator('[aria-label="Ir a Diciembre de 2026"]').getAttribute('aria-selected'))==='true','previsión: al volver del detalle queda en el mismo mes');}
 await c5.close();}
// previsión: gráfico del saldo, rango con meses atrás, avisos y simulador de compra
for(const w of [320,360,1280]){
 const sn=JSON.parse(seed);sn.tx.push({id:'gran',type:'out',amt:5000000,cat:'Ocio',note:'Gasto grande',date:'2027-01-10',card:false,cardName:'',fixed:true,inst:1,skip:[]});
 const c7=await b.newContext({viewport:{width:w,height:900}});const q=await c7.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},JSON.stringify(sn));await q.goto(PAGE+'#/forecast');await q.waitForTimeout(500);
 const T=async()=>(await q.innerText('body')).replace(/\s+/g,' ');
 ok((await q.locator('[aria-label="Gráfico del saldo previsto"]').count())===1&&(await q.locator('[aria-label^="Mes en el gráfico: "]').count())===6,'previsión @'+w+': gráfico del saldo con un punto tocable por mes (6 meses por defecto)');
 ok((await q.locator('[aria-label^="Rango: "]').count())===4,'previsión @'+w+': cuatro rangos para elegir (6 adelante, 12 adelante, 3 atrás, 6 atrás)');
 {const tx=await T();
  ok(/es el mes más pesado de los próximos 12\. Te faltan \$[\d.]+ ese mes: es el peor balance mensual de todos\./.test(tx),'previsión @'+w+': aviso del mes más pesado por balance mensual');
  ok(/Ojo con [A-Za-zé]+: el saldo llega a -\$[\d.]+, el punto más bajo de los próximos 12\./.test(tx),'previsión @'+w+': aviso del saldo negativo más bajo');
  ok(/\d+ meses? en rojo|1 mes en rojo/.test(tx),'previsión @'+w+': el gráfico cuenta los meses en rojo');}
 {const g=await q.locator('[aria-label="Gráfico del saldo previsto"]').boundingBox();ok(g.x>=0&&g.x+g.width<=w+0.5&&g.height>60,'previsión @'+w+': el gráfico entra en el ancho ('+Math.round(g.width)+'x'+Math.round(g.height)+')');
  ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'previsión @'+w+': sin desplazamiento horizontal de la página');}
 // el gráfico lleva al mes tocado
 await q.locator('[aria-label="Mes en el gráfico: Diciembre de 2026"]').click();await q.waitForTimeout(900);
 ok((await q.locator('[aria-label="Ir a Diciembre de 2026"]').getAttribute('aria-selected'))==='true','previsión @'+w+': tocar un punto del gráfico lleva a ese mes');
 // meses hacia atrás
 await q.locator('[aria-label="Rango: 6 atrás"]').click();await q.waitForTimeout(700);
 {const cards=(await q.locator('[aria-label^="Resumen de "]').allInnerTexts()).map(x=>x.replace(/\s+/g,' '));
  ok(cards.length===18,'previsión @'+w+': "6 atrás" muestra 18 meses ('+cards.length+')');
  ok(cards[0].includes('Abril de 2026')&&cards[0].includes('Real')&&cards[0].includes('Saldo al cierre')&&!cards[0].includes('Saldo previsto'),'previsión @'+w+': los meses cerrados dicen "Real" y "Saldo al cierre"');
  ok(cards[6].includes('Octubre de 2026')&&cards[6].includes('En curso')&&cards[7].includes('Previsto'),'previsión @'+w+': el mes actual dice "En curso" y los que vienen "Previsto"');
  ok((await q.locator('[aria-label="Ir a Octubre de 2026"]').getAttribute('aria-selected'))==='true','previsión @'+w+': al cambiar de rango queda parado en el mes actual');
  const sc=await q.locator('[aria-label="Meses"]').evaluate(e=>e.scrollLeft);ok(sc>100,'previsión @'+w+': el carrusel se posiciona en el mes actual (scroll '+Math.round(sc)+')');}
 await q.locator('[aria-label="Mes en el gráfico: Abril de 2026"]').click();await q.waitForTimeout(900);
 ok((await q.locator('[aria-label="Ir a Abril de 2026"]').getAttribute('aria-selected'))==='true'&&(await q.locator('[aria-label="Meses"]').evaluate(e=>e.scrollLeft))<3,'previsión @'+w+': desde el gráfico se llega a un mes pasado');
 if(w===360){
  await q.locator('[aria-label="Mostrar detalle de Abril de 2026"]').click();await q.waitForTimeout(250);
  ok((await T()).includes('Saldo al cierre')&&(await q.innerText('body')).includes('‹ Volver a Previsión'),'previsión: el detalle de un mes pasado funciona');
  await q.getByText('‹ Volver a Previsión',{exact:true}).last().click();await q.waitForTimeout(400);
  ok((await q.locator('[aria-label="Ir a Abril de 2026"]').getAttribute('aria-selected'))==='true'&&(await q.locator('[aria-label="Rango: 6 atrás"]').count())===1,'previsión: al volver del detalle queda el mismo rango y mes');
  await q.locator('[aria-label="Rango: 6 adelante"]').click();await q.waitForTimeout(600);
  ok((await q.locator('[aria-label^="Resumen de "]').count())===6&&(await q.locator('[aria-label="Ir a Octubre de 2026"]').getAttribute('aria-selected'))==='true'&&(await q.locator('[aria-label="Meses"]').evaluate(e=>e.scrollLeft))<3,'previsión: volver a "6 adelante" deja 6 meses desde hoy');
  // simulador
  const before=await q.evaluate(()=>localStorage.getItem('equa-local-v1'));
  await q.locator('[aria-label="Simular una compra"]').click();await q.waitForTimeout(300);
  ok((await T()).includes('¿Y si compro algo?')&&(await T()).includes('No se guarda nada'),'simulador: abre con la aclaración de que no se guarda nada');
  ok((await q.locator('[aria-label="Resultado de la simulación"]').innerText()).includes('Cargá un monto'),'simulador: sin monto pide cargarlo');
  await q.locator('input[aria-label="Monto de la compra"]').fill('2400000');await q.locator('[aria-label="Cuotas: 12"]').click();await q.waitForTimeout(250);
  {const rs=(await q.locator('[aria-label="Resultado de la simulación"]').innerText()).replace(/\s+/g,' ');
   ok(rs.includes('$200.000 por mes durante 12 meses')&&/Saldo más bajo/.test(rs)&&/Meses en rojo \d+ → \d+/.test(rs),'simulador: muestra la cuota, el saldo más bajo y los meses en rojo antes y después ('+rs.slice(0,120)+')');}
  {const vis=async n=>{const bb=await q.getByText(n,{exact:true}).last().boundingBox();return !!bb&&bb.y>=0&&bb.y+bb.height<=900};ok(await vis('Ver en Previsión')&&await vis('Cancelar'),'simulador: botones siempre a la vista');}
  await q.getByText('Ver en Previsión',{exact:true}).last().click();await q.waitForTimeout(400);
  {const tx=await T();ok(tx.includes('Simulando $2.400.000 en 12 cuotas de $200.000 desde Noviembre')&&tx.includes('no se guardó')&&tx.includes('Sin la compra'),'simulador: avisa que es una prueba y el gráfico muestra la línea sin la compra');
   ok((await q.locator('[aria-label="Resumen de Noviembre de 2026"]').innerText()).includes('Compra simulada $200.000')&&!(await q.locator('[aria-label="Resumen de Octubre de 2026"]').innerText()).includes('Compra simulada'),'simulador: la cuota aparece en los meses desde noviembre y no antes');}
  ok(before===await q.evaluate(()=>localStorage.getItem('equa-local-v1')),'simulador: no guardó nada en los datos');
  ok((await q.locator('[aria-label="Salir de la simulación"]').count())===1&&(await q.locator('[aria-label="Cambiar simulación"]').count())===0&&(await q.locator('[aria-label="Quitar simulación"]').count())===0,'simulador: el cartel tiene un solo botón, "Salir de la simulación" (sin Cambiar ni Quitar)');
  await q.locator('[aria-label="Salir de la simulación"]').click();await q.waitForTimeout(300);
  ok(!(await T()).includes('Simulando')&&!(await T()).includes('Compra simulada')&&(await q.locator('[aria-label="Simular una compra"]').count())===1&&before===await q.evaluate(()=>localStorage.getItem('equa-local-v1')),'simulador: "Salir de la simulación" vuelve a los números reales sin tocar nada');
 }
 await c7.close();}
// previsión sin meses complicados: aviso tranquilo
{const sn=JSON.parse(seed);sn.tx=[{id:'sueldo',type:'in',amt:500000,cat:'Sueldo',note:'',date:'2026-09-01',card:false,cardName:'',fixed:true,inst:1,skip:[]}];sn.sav=[];sn.pay=[];sn.paid={};
 const c8=await b.newContext({viewport:{width:360,height:900}});const q=await c8.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},JSON.stringify(sn));await q.goto(PAGE+'#/forecast');await q.waitForTimeout(500);
 const tx=(await q.innerText('body')).replace(/\s+/g,' ');
 ok(tx.includes('Ningún mes de los próximos 12 gasta más de lo que ingresa')&&tx.includes('Sin meses en rojo')&&!tx.includes('más pesado')&&!tx.includes('Ojo con'),'previsión: sin meses complicados muestra un aviso tranquilo');
 await c8.close();}
// datos creados con la versión anterior (fijo editado "solo este mes" sin vínculo): se reparan solos y ofrecen las 4 opciones
{const sn=JSON.parse(seed);const al=sn.tx.find(x=>x.cat==='Mascotas'&&x.fixed);al.skip=[...(al.skip||[]),2026*12+9];
 sn.tx.push({id:'huerfano',type:'out',amt:108000,cat:'Mascotas',note:'Alimento',date:'2026-10-05',card:false,cardName:'',fixed:false,inst:1,skip:[]});
 const c6=await b.newContext({viewport:{width:390,height:900}});const q=await c6.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{if(!localStorage.getItem('equa-local-v1'))localStorage.setItem('equa-local-v1',sd)},JSON.stringify(sn));await q.goto(PAGE+'#/forecast');await q.waitForTimeout(500);
 await q.locator('[aria-label="Mostrar detalle de Octubre de 2026"]').click();await q.waitForTimeout(250);
 await q.locator('[aria-label="Gastos · Mascotas"]').click();await q.waitForTimeout(150);
 await q.locator('[aria-label="Opciones de Alimento"]').click();await q.waitForTimeout(200);
 {const tx=await q.innerText('body');ok(['Editar solo este mes','Editar este mes y los siguientes','Borrar solo este mes','Borrar este mes y los siguientes'].every(x=>tx.includes(x)),'datos viejos: el fijo editado de octubre ($108.000) vuelve a ofrecer las 4 opciones');}
 await c6.close();}
// reportes: catálogo, período, formato, adelanto con datos reales y descarga del archivo (web)
for(const w of [320,390,1280]){
 const c9=await b.newContext({viewport:{width:w,height:900},acceptDownloads:true});const q=await c9.newPage();await q.clock.install({time:new Date('2026-10-02T12:00:00')});
 await q.addInitScript(sd=>{localStorage.setItem('equa-local-v1',sd)},seed);await q.goto(PAGE+'#/data');await q.waitForTimeout(400);
 const T=async()=>(await q.innerText('body')).replace(/\s+/g,' ');
 await q.getByText('Reportes',{exact:true}).first().click();await q.waitForTimeout(250);
 {const tx=await T();ok(['Resumen del mes','Período mes a mes','Ingresos y gastos por categoría','Tarjetas de crédito','Ahorros e inversiones','Previsión','Todos los movimientos'].every(x=>tx.includes(x))&&(await q.locator('[aria-label^="Reporte "]').count())===7,'reportes @'+w+': el catálogo muestra los 7 reportes');
  ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'reportes @'+w+': sin desplazamiento horizontal');}
 if(w===320){
  // por reporte: período por defecto, formato recomendado, hojas anunciadas
  const casos=[['Resumen del mes','Este mes','PDF',/PDF con 4 secciones: Resumen, Gastos, Ingresos, Tarjetas/],['Período mes a mes','Últimos 6 meses','PDF',/PDF con 1 sección: Mes a mes/],['Tarjetas de crédito','Últimos 6 meses','Excel',/Excel con 3 hojas: Resumen, Cuotas pendientes, Pagos\. Los totales son fórmulas/],['Previsión','Próximos 12 meses','PDF',/PDF con 2 secciones: Previsión, Meses en rojo/],['Todos los movimientos','Últimos 6 meses','Excel',/Excel con 1 hoja: Movimientos/]];
  for(const [nm,per,fm,re] of casos){
   await q.locator('[aria-label="Reporte '+nm+'"]').click();await q.waitForTimeout(250);
   const tx=await T();ok(tx.includes(nm)&&(await q.locator('[aria-label="Período: '+per+'"]').count())===1&&re.test(tx)&&(await q.locator('[aria-label="Formato '+fm+'"]').getAttribute('aria-selected'))==='true','reportes: "'+nm+'" arranca en "'+per+'", formato '+fm+' y anuncia sus hojas');
   await q.getByText('‹ Volver a Reportes',{exact:true}).last().click();await q.waitForTimeout(200);}
  // "Todos los movimientos" solo existe en Excel
  await q.locator('[aria-label="Reporte Todos los movimientos"]').click();await q.waitForTimeout(250);
  await q.locator('[aria-label="Formato PDF"]').click({force:true});await q.waitForTimeout(150);
  ok((await q.locator('[aria-label="Formato PDF"]').getAttribute('aria-selected'))!=='true'&&(await q.locator('[aria-label="Formato Excel"]').getAttribute('aria-selected'))==='true'&&(await T()).includes('Excel con 1 hoja'),'reportes: "Todos los movimientos" es solo Excel (PDF deshabilitado)');
  await q.getByText('‹ Volver a Reportes',{exact:true}).last().click();await q.waitForTimeout(200);
 }
 // resumen del mes: período, adelanto con los datos del mes y descarga del PDF
 await q.locator('[aria-label="Reporte Resumen del mes"]').click();await q.waitForTimeout(250);
 {const tx=await T();ok(/Octubre 2026/.test(tx)&&tx.includes('Ingresos')&&tx.includes('Gastos')&&tx.includes('Saldo al cierre'),'reportes @'+w+': el adelanto muestra los datos clave del mes real');}
 await q.locator('[aria-label="Período: Mes anterior"]').click();await q.waitForTimeout(200);
 ok((await q.locator('[aria-label="Período elegido"]').innerText()).includes('Septiembre 2026'),'reportes @'+w+': "Mes anterior" cambia el período a septiembre');
 await q.locator('[aria-label="Período: Elegir mes"]').click();await q.waitForTimeout(200);
 ok((await q.locator('[aria-label="Mes"]').count())===1,'reportes @'+w+': "Elegir mes" muestra el selector de mes');
 await q.locator('[aria-label="Período: Este mes"]').click();await q.waitForTimeout(200);
 {const dl=q.waitForEvent('download');await q.getByText('Exportar PDF',{exact:true}).last().click();const d=await dl;
  ok(d.suggestedFilename()==='Equa - Resumen del mes - Octubre 2026.pdf','reportes @'+w+': descarga "'+d.suggestedFilename()+'"');
  const buf=fs.readFileSync(await d.path());ok(buf.subarray(0,5).toString()==='%PDF-'&&buf.subarray(-6).toString().includes('%%EOF')&&buf.length>1500,'reportes @'+w+': el PDF descargado es un PDF completo ('+buf.length+' bytes)');
  await q.waitForTimeout(250);ok((await T()).includes('se descargó'),'reportes @'+w+': avisa que se descargó');}
 if(w!==1280){
  await q.getByText('‹ Volver a Reportes',{exact:true}).last().click();await q.waitForTimeout(200);
  await q.locator('[aria-label="Reporte Período mes a mes"]').click();await q.waitForTimeout(250);
  await q.locator('[aria-label="Período: Mes inicio – mes fin"]').click();await q.waitForTimeout(200);
  ok((await q.locator('[aria-label="Desde"]').count())===1&&(await q.locator('[aria-label="Hasta"]').count())===1,'reportes @'+w+': "Mes inicio – mes fin" muestra Desde y Hasta');
  await q.locator('[aria-label="Formato Excel"]').click();await q.waitForTimeout(150);
  {const dl=q.waitForEvent('download');await q.getByText('Exportar Excel',{exact:true}).last().click();const d=await dl;
   const buf=fs.readFileSync(await d.path());ok(/\.xlsx$/.test(d.suggestedFilename())&&buf.subarray(0,2).toString()==='PK'&&buf.includes(Buffer.from('xl/worksheets/sheet1.xml')),'reportes @'+w+': el Excel descargado es un .xlsx válido ('+d.suggestedFilename()+')');}
 }
 await c9.close();}
// 6) datos: duplicado de categoría
await p.goto(PAGE+'#/data');await p.waitForTimeout(300);
{const t0=await txt();ok(t0.includes('Reportes')&&t0.includes('Editor de categorías')&&!t0.includes('Categorías de gastos')&&t0.includes('Guardar respaldo'),'datos: menú con Reportes y Editor de categorías (las categorías ya no están sueltas)');}
await clickText('Editor de categorías',false);await p.waitForTimeout(200);
{const t1=await txt();ok(t1.includes('‹ Volver a Datos')&&t1.includes('Categorías de gastos')&&t1.includes('Categorías de ingresos')&&t1.includes('Categorías de ahorro')&&!t1.includes('Guardar respaldo'),'editor de categorías: gastos, ingresos y ahorro en una sola pantalla, con "Volver a Datos"');}
await clickText('Categorías de gastos',false);await clickText('＋ Agregar categoría');await p.waitForTimeout(150);
await p.locator('input').last().fill('  comida ');await clickText('Guardar');await p.waitForTimeout(200);
ok((await txt()).includes('Ya existe una categoría llamada "Comida"'),'avisa categoría duplicada');
// eliminar para siempre: sin movimientos
await p.keyboard.press('Escape');await p.waitForTimeout(100);
if(!(await txt()).includes('Ocio2')){await clickText('Categorías de gastos',false);}
await clickText('↺ Ocio2',false);await p.waitForTimeout(200);
ok((await txt()).includes('Restaurar')&&(await txt()).includes('Eliminar para siempre'),'categoría eliminada: ofrece Restaurar o Eliminar para siempre');
await clickText('Eliminar para siempre');await p.waitForTimeout(200);
ok((await txt()).includes('No tiene movimientos. No se puede deshacer'),'avisa antes de borrar para siempre');
await clickText('Eliminar para siempre',true);await p.waitForTimeout(300);
s=await state();ok(!s.categories.out.some(c=>c.name==='Ocio2'),'sin movimientos: se borra definitivamente');
// con movimientos: se eligen a dónde pasarlos
await p.getByText('×',{exact:true}).nth(4).click();await p.waitForTimeout(200);
await clickText('Eliminar',true);await p.waitForTimeout(300);
await clickText('↺ Ocio',false);await p.waitForTimeout(200);
await clickText('Eliminar para siempre');await p.waitForTimeout(200);
ok(/tiene 2 movimientos/.test(await txt())&&(await txt()).includes('Pasarlos a Comida'),'con movimientos: pregunta a qué categoría pasarlos');
await clickText('Pasarlos a Comida');await p.waitForTimeout(200);
ok((await txt()).includes('Se pasan 2 movimientos de "Ocio" a "Comida"'),'avisa cuántos movimientos pasan y a dónde');
await clickText('Eliminar para siempre',true);await p.waitForTimeout(300);
s=await state();ok(!s.categories.out.some(c=>c.name==='Ocio')&&s.tx.filter(x=>x.cat==='Comida').length>=3&&!s.tx.some(x=>x.cat==='Ocio'),'los movimientos pasaron a Comida y la categoría se borró');

// 7) restaurar respaldo (primero uno roto, después el de la app anterior)
await clickText('‹ Volver a Datos',false);await p.waitForTimeout(200);
ok((await txt()).includes('Guardar respaldo')&&!(await txt()).includes('Categorías de gastos'),'editor de categorías: "Volver a Datos" regresa al menú');
await clickText('Restaurar');await p.waitForTimeout(150);
await p.locator('textarea').fill('esto no es un respaldo');
await clickText('Revisar respaldo');await p.waitForTimeout(200);
ok((await txt()).includes('no se puede leer'),'respaldo roto: avisa y no cambia nada');
s=await state();ok(s.tx.length>3,'respaldo roto: los datos siguen igual');
await p.locator('textarea').fill(fs.readFileSync(path.join(root,'supabase/tests/legacy-sample.json'),'utf8'));
await clickText('Revisar respaldo');await p.waitForTimeout(200);
ok(/Respaldo de la app anterior: 6 movimientos/.test(await txt())&&(await txt()).includes('Reemplaza TODOS tus datos'),'muestra qué se va a restaurar (cantidades) y que reemplaza todo');
ok((await txt()).includes('Guardar una copia de lo actual y restaurar')&&(await txt()).includes('Restaurar sin guardar copia'),'ofrece guardar una copia o restaurar sin copia');
await clickText('Restaurar sin guardar copia');await p.waitForTimeout(400);
s=await state();ok(s.tx.length===6&&s.open===150000&&s.cards.length===2,'restaurado: 6 movimientos, saldo inicial y 2 tarjetas');
ok((await txt()).includes('Datos restaurados'),'avisa que se restauró');
console.log(fails?`\n${fails} fallas`:'\ntodo OK', 'errores de consola:',errs.slice(0,5).map(e=>e.slice(0,600)));
await b.close();process.exit(fails?1:0)})();
