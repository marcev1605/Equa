import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { monthLabel } from '../domain/dates';
import { buildReport, fileName, periodLabel, REPORTS, reportDef, type Format, type Period, type ReportId } from '../domain/reports';
import { showCell } from '../export/model';
import { toPdf } from '../export/pdf';
import { toXlsx } from '../export/xlsx';
import { saveFile } from '../services/saveFile';
import { useStore } from '../state/store';
import { useDialogs } from './dialogs';
import { BackLink, Button, Card, Chips, Select, T } from './kit';
import { radius, useTheme } from './theme';

const PRESETS = {
  month: ['Este mes', 'Mes anterior', 'Elegir mes'],
  range: ['Últimos 3 meses', 'Últimos 6 meses', 'Últimos 12 meses', 'Este año', 'Mes inicio – mes fin'],
  future: ['Próximos 6 meses', 'Próximos 12 meses'],
} as const;
const DEFAULT_PRESET = { month: 'Este mes', range: 'Últimos 6 meses', future: 'Próximos 12 meses' } as const;
const MIME: Record<Format, string> = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

const Sec = ({ children }: { children: React.ReactNode }) => <T tone="mute" size={15} weight="semi" style={{ marginTop: 18, marginBottom: 8 }}>{children}</T>;

/** Reportes dentro de Datos: se elige un reporte, el período y el formato (PDF o Excel); se ve un adelanto con los datos reales y se exporta. */
export function ReportsView({ onBack }: { onBack: () => void }) {
  const { eng } = useStore(), t = useTheme(), dlg = useDialogs(), now = eng.now;
  const [rid, setRid] = useState<ReportId | null>(null);
  const [preset, setPreset] = useState<string>(DEFAULT_PRESET.range), [fmt, setFmt] = useState<Format>('pdf');
  const [pick, setPick] = useState(now), [from, setFrom] = useState(now - 5), [to, setTo] = useState(now), [busy, setBusy] = useState(false);

  const open = (id: ReportId) => { const d = reportDef(id); setRid(id); setPreset(DEFAULT_PRESET[d.per]); setFmt(d.best); setPick(now); setFrom(now - 5); setTo(now); };

  if (!rid) {
    return (
      <>
        <BackLink label="‹ Volver a Datos" onPress={onBack} />
        <T size={26} weight="bold" style={{ letterSpacing: -0.5 }}>Reportes</T>
        <T tone="mute" size={14} style={{ marginTop: 4, marginBottom: 6 }}>Elegí un reporte, el período y el formato. Se arma en el momento con tus datos y no cambia nada de tu cuenta.</T>
        {REPORTS.map(r => (
          <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={'Reporte ' + r.title} onPress={() => open(r.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: radius.md, padding: 14, marginTop: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: t.bg, borderColor: t.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }}>
              <T size={11} weight="bold" tone="mute">{r.ic}</T>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={15} weight="bold">{r.title}</T>
              <T size={13} tone="mute">{r.desc}</T>
            </View>
            <T size={20} tone="mute">›</T>
          </Pressable>
        ))}
      </>
    );
  }

  const d = reportDef(rid), months = Array.from({ length: 49 }, (_, k) => now + 12 - k);
  const monthOpts = months.map(i => ({ value: String(i), label: monthLabel(i) }));
  const year0 = Math.floor(now / 12) * 12;
  const period: Period = d.per === 'month'
    ? preset === 'Mes anterior' ? { from: now - 1, to: now - 1 } : preset === 'Elegir mes' ? { from: pick, to: pick } : { from: now, to: now }
    : d.per === 'future'
      ? { from: now + 1, to: now + (preset === 'Próximos 6 meses' ? 6 : 12) }
      : preset === 'Últimos 3 meses' ? { from: now - 2, to: now } : preset === 'Últimos 6 meses' ? { from: now - 5, to: now } : preset === 'Últimos 12 meses' ? { from: now - 11, to: now } : preset === 'Este año' ? { from: year0, to: now } : { from, to };
  const rep = buildReport(eng, rid, period), format: Format = d.formats.includes(fmt) ? fmt : d.best;
  const sheet = rep.sheets.find(s => s.rows.length) ?? rep.sheets[0], shown = sheet.cols.slice(0, 4);

  async function exportNow() {
    if (busy) return;
    setBusy(true);
    try {
      const name = fileName(rid as ReportId, period, format), bytes = format === 'pdf' ? toPdf(rep) : toXlsx(rep);
      const how = await saveFile(name, bytes, MIME[format]);
      dlg.toast(how === 'downloaded' ? `Listo: se descargó "${name}"` : 'Listo: elegí dónde guardar o compartir el archivo');
    } catch (e: any) { dlg.toast(e?.message || 'No se pudo generar el archivo'); }
    setBusy(false);
  }
  const fmtBtn = (f: Format, title: string, sub: string) => {
    const on = format === f, off = !d.formats.includes(f);
    return (
      <Pressable key={f} accessibilityRole="button" accessibilityLabel={'Formato ' + title} accessibilityState={{ selected: on, disabled: off }} disabled={off} onPress={() => setFmt(f)}
        style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 8, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', opacity: off ? 0.4 : 1, backgroundColor: on ? t.ink : t.bg, borderColor: on ? t.ink : t.line }}>
        <T size={14} weight="bold" style={on ? { color: t.card } : undefined}>{title}</T>
        <T size={11.5} tone="mute" style={on ? { color: t.card, opacity: 0.8 } : undefined}>{sub}</T>
      </Pressable>
    );
  };
  return (
    <>
      <BackLink label="‹ Volver a Reportes" onPress={() => setRid(null)} />
      <T size={26} weight="bold" style={{ letterSpacing: -0.5 }}>{d.title}</T>
      <T tone="mute" size={14} style={{ marginTop: 4 }}>{d.desc}</T>

      <Sec>Período</Sec>
      <Chips labelPrefix="Período: " value={preset} options={[...PRESETS[d.per]]} onChange={setPreset} />
      {preset === 'Elegir mes' ? <Select label="Mes" value={String(pick)} options={monthOpts} onChange={v => setPick(+v)} /> : null}
      {preset === 'Mes inicio – mes fin' ? (
        <>
          <Select label="Desde" value={String(from)} options={monthOpts} onChange={v => { setFrom(+v); if (+v > to) setTo(+v); }} />
          <Select label="Hasta" value={String(to)} options={monthOpts} onChange={v => { setTo(+v); if (+v < from) setFrom(+v); }} />
        </>
      ) : null}
      <View accessibilityLabel="Período elegido"><T size={13} tone="mute">{periodLabel(period)}</T></View>

      <Sec>Formato</Sec>
      <View style={{ flexDirection: 'row', gap: 8 }}>{fmtBtn('pdf', 'PDF', 'Para leer y compartir')}{fmtBtn('xlsx', 'Excel', 'Para trabajar los datos')}</View>

      <Sec>Así se verá</Sec>
      <Card style={{ marginTop: 0 }}>
        <View accessibilityLabel="Datos clave" style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 8 }}>
          {rep.kpis.map(k => (
            <View key={k.label} style={{ width: '48%', minWidth: 120, flexGrow: 1 }}>
              <T size={12} tone="mute">{k.label}</T>
              <T size={16} weight="bold" style={k.tone ? { color: k.tone === 'bad' ? t.out : t.inc } : undefined}>{k.value}</T>
            </View>
          ))}
        </View>
        <View accessibilityLabel="Adelanto del reporte" style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 8 }}>
          <T size={12} weight="semi" tone="mute" style={{ marginBottom: 4 }}>{sheet.title || sheet.name}</T>
          <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4 }}>
            {shown.map((c, i) => <T key={i} size={11} weight="bold" tone="mute" style={{ flex: i === 0 ? 1.4 : 1, textAlign: c.type === 'text' || c.type === 'date' ? 'left' : 'right' }} numberOfLines={1}>{c.label}</T>)}
          </View>
          {sheet.rows.length === 0 ? <T size={13} tone="mute">Sin datos en este período.</T> : sheet.rows.slice(0, 4).map((r, k) => (
            <View key={k} style={{ flexDirection: 'row', gap: 6, paddingVertical: 3, borderTopWidth: 1, borderTopColor: t.line }}>
              {shown.map((c, i) => <T key={i} size={12} style={{ flex: i === 0 ? 1.4 : 1, textAlign: c.type === 'text' || c.type === 'date' ? 'left' : 'right' }} numberOfLines={1}>{showCell(r[i] ?? null, c.type)}</T>)}
            </View>
          ))}
          {sheet.rows.length > 4 ? <T size={12} tone="mute" style={{ marginTop: 4 }}>… y {sheet.rows.length - 4} más</T> : null}
        </View>
        <View accessibilityLabel="Contenido del archivo">
          <T size={12} tone="mute" style={{ marginTop: 10 }}>
          {format === 'pdf' ? `PDF con ${rep.sheets.length} ${rep.sheets.length === 1 ? 'sección' : 'secciones'}: ` : `Excel con ${rep.sheets.length} ${rep.sheets.length === 1 ? 'hoja' : 'hojas'}: `}{rep.sheets.map(s => s.name).join(', ')}{format === 'xlsx' ? '. Los totales son fórmulas.' : '.'}
        </T>
        </View>
      </Card>
      <Button label={busy ? 'Generando…' : format === 'pdf' ? 'Exportar PDF' : 'Exportar Excel'} onPress={exportNow} disabled={busy} />
    </>
  );
}
