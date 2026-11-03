// node tools/diff-vs-legacy.cjs
// Compara el motor TypeScript (src/domain) con la app HTML original (legacy/mis-finanzas.html) ejecutada en Chromium
// con fecha simulada 2026-10-02, sobre varios escenarios (tarjetas, adelantos, fijos, ahorro, atrasados).
// Requiere: typescript y playwright (TS_PATH / PLAYWRIGHT_PATH si no están instalados localmente).
const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..');
const req = require('./ts-run.cjs')(['src/domain']);
const {createEngine} = req('src/domain/engine.js'), {fromLegacy} = req('src/domain/legacy.js');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const LEGACY = 'file://' + path.join(root, 'legacy/mis-finanzas.html');
const TODAY={y:2026,m:9,d:2};
const base=JSON.parse(fs.readFileSync(path.join(root,'supabase/tests/legacy-sample.json'),'utf8'));
// escenarios
const sc={};
sc.sample=base;
sc.cards=JSON.parse(JSON.stringify({tx:[
 {id:1,type:'in',amt:500000,cat:'Sueldo',note:'',date:'2026-08-01',card:false,cardName:'',fixed:true,inst:1},
 {id:2,type:'out',amt:120000,cat:'Compras',note:'',date:'2026-09-26',card:true,cardName:'Visa',fixed:false,inst:6},
 {id:3,type:'out',amt:30000,cat:'Ocio',note:'',date:'2026-10-01',card:true,cardName:'Visa',fixed:false,inst:1},
 {id:4,type:'out',amt:8000,cat:'Casa',note:'Netflix etc',date:'2026-08-10',card:true,cardName:'Visa',fixed:true,inst:1},
 {id:5,type:'out',amt:70000,cat:'Casa',note:'Alquiler',date:'2026-08-05',card:false,cardName:'',fixed:true,inst:1,end:24322},
 {id:6,type:'out',amt:15000,cat:'Comida',note:'',date:'2026-07-15',card:false,cardName:'',fixed:false,inst:1},
 {id:7,type:'in',amt:20000,cat:'Extra',note:'',date:'2026-07-20',card:false,cardName:'',fixed:false,inst:1},
 {id:8,type:'out',amt:50000,cat:'Compras',note:'',date:'2026-10-20',card:true,cardName:'Master',fixed:false,inst:3}],
 cards:['Visa','Master'],cardInfo:{Visa:{close:25,months:{24320:20}},Master:{close:10}},
 pay:[{id:1,card:'Visa',i:24321,amt:40000,date:'2026-10-01'},{id:2,card:'Visa',i:24322,amt:30000,date:'2026-10-02'},{id:3,card:'Master',i:24322,amt:5000,date:'2026-09-15'}],payVer:2,
 paid:{'1:24316':true,'1:24317':true,'1:24318':true,'1:24319':true,'1:24320':true,'5:24317':true,'6:24318':true,'7:24318':true},
 open:80000,cats:{in:[],out:[],sav:[]},hid:{in:[],out:[],sav:[]},
 sav:[{id:9,cat:'USD',amt:50000,date:'2026-09-02',note:''},{id:10,cat:'USD',amt:-10000,date:'2026-10-02',note:''},{id:11,tid:11,cat:'USD',amt:-5000,date:'2026-09-20',note:''},{id:12,tid:11,cat:'Bonos',amt:5000,date:'2026-09-20',note:''}],usd:0}));
sc.cards.paid['2:24321']=true;
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 let bad=0,checks=0;
 for(const [name,raw] of Object.entries(sc)){
  const p=await b.newPage();
  await p.clock.install({time:new Date('2026-10-02T12:00:00')});
  await p.addInitScript(r=>localStorage.setItem('fin-v1',JSON.stringify(r)),raw);
  await p.goto(LEGACY);
  const L=await p.evaluate(()=>{
   const now=idxOf(new Date()),o={months:{},occ:all().map(x=>[String(x.t.id),x.i,x.k,x.n,Math.round(x.a*100)/100,P(x)]),cards:cardNames()};
   for(let i=now-4;i<=now+10;i++){
     const m={avail:availFor(i),advNet:advNet(i),advCum:advCum(i),svNet:svNet(i),svBefore:svBefore(i),svTo:svTo(i),
       sums:[sum(all().filter(x=>x.i===i),'in'),sum(all().filter(x=>x.i===i),'out')],st:{}};
     cardNames().forEach(n=>{m.st[n]={s:stmt(n,i),d:stmtD(n,i),n:stmtN(n,i),open:stmtOpen(n,i),cd:stmtCloseDate(n,i).getDate()}});
     o.months[i]=m}
   cur=now;o.od={in:overdue('in').map(x=>[String(x.t.id),x.i]),out:overdue('out').map(x=>[String(x.t.id),x.i])};
   return o});
  const e=createEngine(fromLegacy(raw),TODAY);
  const R=x=>Math.round(x*100)/100;
  const cmp=(a,b,l)=>{checks++;if(JSON.stringify(a)!==JSON.stringify(b)){bad++;console.log('DIFF',name,l,JSON.stringify(a),JSON.stringify(b))}};
  cmp(L.occ,e.all().map(x=>[x.t.id,x.i,x.k,x.n,R(x.a),e.P(x)]),'occ');
  cmp(L.cards,e.cardNames(),'cards');
  const rs=s=>({items:R(s.items),carry:R(s.carry),due:R(s.due),paid:R(s.paid),rem:R(s.rem)});
  for(const [i,m] of Object.entries(L.months)){const k=+i;
    cmp(R(m.avail),R(e.availFor(k)),'avail '+i);cmp(R(m.advNet),R(e.advNet(k)),'advNet '+i);cmp(R(m.advCum),R(e.advCum(k)),'advCum '+i);
    cmp([R(m.svNet),R(m.svBefore),R(m.svTo)],[R(e.svNet(k)),R(e.svBefore(k)),R(e.svTo(k))],'sv '+i);
    cmp(m.sums.map(R),[R(e.sum(e.all().filter(x=>x.i===k),'in')),R(e.sum(e.all().filter(x=>x.i===k),'out'))],'sums '+i);
    for(const n of L.cards){const s=m.st[n];
      cmp(rs(s.s),rs(e.stmt(n,k)),'stmt '+n+i);cmp(rs(s.d),rs(e.stmtD(n,k)),'stmtD '+n+i);
      const q=e.stmtN(n,k);cmp({...rs(s.n),adv:R(s.n.adv)},{...rs(q),adv:R(q.adv)},'stmtN '+n+i);
      cmp(((raw.cardInfo||{})[n]||{}).close?[s.open,s.cd]:[s.open],((raw.cardInfo||{})[n]||{}).close?[e.stmtOpen(n,k),e.stmtCloseDate(n,k).d]:[e.stmtOpen(n,k)],'close '+n+i)}
  }
  cmp(L.od.in,e.overdue(e.now,'in').map(x=>[x.t.id,x.i]),'overdue in');cmp(L.od.out,e.overdue(e.now,'out').map(x=>[x.t.id,x.i]),'overdue out');
  console.log(name,'listo; ocurrencias',L.occ.length);
  await p.close();
 }
 console.log(bad?`❌ ${bad} diferencias de ${checks}`:`✅ ${checks} comparaciones idénticas`);
 await b.close();process.exit(bad?1:0)})();
