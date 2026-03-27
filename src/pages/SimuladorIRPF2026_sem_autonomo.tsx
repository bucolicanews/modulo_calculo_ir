import { useState, useCallback } from 'react'
import type { ChangeEvent } from 'react'

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════
interface FaixaProgressiva {
  id: number
  limite: number
  aliquota: number
  deducao: number
}

interface FaixaRedutora {
  id: number
  limiteRenda: number
  redutorFixo: number
  coeficiente: number
  nota: string
}

interface FaixaINSS {
  id: number
  limite: number
  aliquota: number
}

interface Params {
  deducaoDependente: number
  descontoSimplificado: number
  tetoINSS: number
}

interface ResultadoSimulacao {
  inss: number
  baseMensal: number
  irBrutoMensal: number
  redutorMensal: number
  irMensal: number
  aliqEfetiva: number
  liquido: number
  rendaAnual: number
  baseAnual: number
  irBrutoAnual: number
  redutorAnual: number
  irAnual: number
  aliqAnual: number
  isento: boolean
  temRedutor: boolean
}

interface SimularArgs {
  salario: number
  dependentes: number
  outrasDeducoes: string
  tipoDeducao: 'simplificada' | 'completa'
  progMensal: FaixaProgressiva[]
  redutorMensal: FaixaRedutora[]
  progAnual: FaixaProgressiva[]
  redutorAnual: FaixaRedutora[]
  inssTab: FaixaINSS[]
  params: Params
}

interface Coluna {
  key: string
  label: string
  ph?: string
  readOnly?: boolean
}

interface TabelaEditorProps {
  titulo: string
  descricao?: string
  colunas: Coluna[]
  linhas: Record<string, number | string>[]
  onChange: (linhas: Record<string, number | string>[]) => void
}

interface NInputProps {
  value: string | number
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  pre?: string
  placeholder?: string
}

interface SegProps {
  value: string
  onChange: (v: string) => void
  opts: { v: string; l: string }[]
}

interface TabBtnProps {
  label: string
  active: boolean
  onClick: () => void
}

interface ResRowProps {
  label: string
  valor: number
  pct?: number
  c?: string
  barra?: boolean
  bold?: boolean
}

interface DivProps {
  style?: React.CSSProperties
}

// ══════════════════════════════════════════════════════════════
// TABELAS OFICIAIS 2026 — Lei 15.270/2025 / Receita Federal
// ══════════════════════════════════════════════════════════════
const DEF_PROG_MENSAL: FaixaProgressiva[] = [
  { id: 1, limite: 2428.80,  aliquota: 0,    deducao: 0        },
  { id: 2, limite: 2826.65,  aliquota: 7.5,  deducao: 182.16   },
  { id: 3, limite: 3751.05,  aliquota: 15,   deducao: 394.16   },
  { id: 4, limite: 4664.68,  aliquota: 22.5, deducao: 675.49   },
  { id: 5, limite: 9e15,     aliquota: 27.5, deducao: 908.73   },
]

const DEF_REDUTOR_MENSAL: FaixaRedutora[] = [
  { id: 1, limiteRenda: 5000.00, redutorFixo: 312.89, coeficiente: 0,        nota: 'Isenção total (≤ R$ 5.000)'         },
  { id: 2, limiteRenda: 7350.00, redutorFixo: 978.62, coeficiente: 0.133145, nota: 'Redução parcial (R$ 5.001–R$ 7.350)' },
]

const DEF_PROG_ANUAL: FaixaProgressiva[] = [
  { id: 1, limite: 28467.20, aliquota: 0,    deducao: 0         },
  { id: 2, limite: 33919.80, aliquota: 7.5,  deducao: 2135.04   },
  { id: 3, limite: 45012.60, aliquota: 15,   deducao: 4679.03   },
  { id: 4, limite: 55976.16, aliquota: 22.5, deducao: 8054.97   },
  { id: 5, limite: 9e15,     aliquota: 27.5, deducao: 10853.78  },
]

const DEF_REDUTOR_ANUAL: FaixaRedutora[] = [
  { id: 1, limiteRenda: 60000.00, redutorFixo: 2694.15, coeficiente: 0,        nota: 'Isenção total (≤ R$ 60.000)'            },
  { id: 2, limiteRenda: 88200.00, redutorFixo: 8429.73, coeficiente: 0.095575, nota: 'Redução parcial (R$ 60.001–R$ 88.200)'   },
]

const DEF_INSS: FaixaINSS[] = [
  { id: 1, limite: 1518.00,  aliquota: 7.5 },
  { id: 2, limite: 2793.88,  aliquota: 9   },
  { id: 3, limite: 4190.83,  aliquota: 12  },
  { id: 4, limite: 8157.41,  aliquota: 14  },
]

const DEF_PARAMS: Params = {
  deducaoDependente:    189.59,
  descontoSimplificado: 607.20,
  tetoINSS:            8157.41,
}

let _uid = 200
const uid = (): number => ++_uid
const clone = <T,>(arr: T[]): T[] => arr.map(r => ({ ...r }))

// ══════════════════════════════════════════════════════════════
// ENGINE DE CÁLCULO
// ══════════════════════════════════════════════════════════════
function calcINSS(s: number, faixas: FaixaINSS[], teto: number): number {
  const base = Math.min(s, teto)
  let v = 0, prev = 0
  for (const f of faixas) {
    const fatia = Math.min(f.limite, base) - prev
    if (fatia > 0) v += fatia * (f.aliquota / 100)
    prev = f.limite
    if (base <= f.limite) break
  }
  return v
}

function calcIR(base: number, faixas: FaixaProgressiva[]): number {
  for (const f of faixas) {
    if (base <= f.limite) return Math.max(0, base * (f.aliquota / 100) - f.deducao)
  }
  return 0
}

function calcRedutor(renda: number, irBruto: number, tabRedutores: FaixaRedutora[]): number {
  const [f1, f2] = tabRedutores
  if (!f1) return 0
  if (renda <= f1.limiteRenda) return Math.min(f1.redutorFixo, irBruto)
  if (f2 && renda <= f2.limiteRenda) {
    const r = f2.redutorFixo - f2.coeficiente * renda
    return Math.max(0, Math.min(r, irBruto))
  }
  return 0
}

function simular({
  salario, dependentes, outrasDeducoes, tipoDeducao,
  progMensal, redutorMensal, progAnual, redutorAnual, inssTab, params,
}: SimularArgs): ResultadoSimulacao {
  const s    = salario
  const inss = calcINSS(s, inssTab, params.tetoINSS)
  const dedDep = dependentes * params.deducaoDependente
  const outras = parseFloat(outrasDeducoes) || 0

  const baseMensal = tipoDeducao === 'simplificada'
      ? Math.max(0, s - inss - Math.min(s * 0.20, params.descontoSimplificado))
    : Math.max(0, s - inss - dedDep - outras)

  const irBrutoM  = calcIR(baseMensal, progMensal)
  const redutorM  = calcRedutor(s, irBrutoM, redutorMensal)
  const irMensal  = Math.max(0, irBrutoM - redutorM)

  const rendaAnual = s * 12
  const inssAnual  = inss * 12
  const dedAnual   = tipoDeducao === 'simplificada'
    ? Math.min(rendaAnual * 0.20, 17640)
    : (dedDep + outras) * 12
  const baseAnual  = Math.max(0, rendaAnual - inssAnual - dedAnual)
  const irBrutoA   = calcIR(baseAnual, progAnual)
  const redutorA   = calcRedutor(rendaAnual, irBrutoA, redutorAnual)
  const irAnual    = Math.max(0, irBrutoA - redutorA)

  return {
    inss:          +inss.toFixed(2),
    baseMensal:    +baseMensal.toFixed(2),
    irBrutoMensal: +irBrutoM.toFixed(2),
    redutorMensal: +redutorM.toFixed(2),
    irMensal:      +irMensal.toFixed(2),
    aliqEfetiva:   s > 0 ? +((irMensal / s) * 100).toFixed(2) : 0,
    liquido:       +(s - inss - irMensal).toFixed(2),
    rendaAnual:    +rendaAnual.toFixed(2),
    baseAnual:     +baseAnual.toFixed(2),
    irBrutoAnual:  +irBrutoA.toFixed(2),
    redutorAnual:  +redutorA.toFixed(2),
    irAnual:       +irAnual.toFixed(2),
    aliqAnual:     rendaAnual > 0 ? +((irAnual / rendaAnual) * 100).toFixed(2) : 0,
    isento:        irMensal === 0,
    temRedutor:    redutorM > 0,
  }
}

// ══════════════════════════════════════════════════════════════
// FORMATAÇÃO
// ══════════════════════════════════════════════════════════════
const brl = (v: number): string =>
  (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const pct = (v: number): string =>
  (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '%'

// ══════════════════════════════════════════════════════════════
// TEMA
// ══════════════════════════════════════════════════════════════
const T = {
  bg:        '#070d1a',
  card:      '#0f1929',
  card2:     '#162030',
  border:    '#1c2e48',
  text:      '#e2e8f0',
  muted:     '#4a6080',
  mutedL:    '#7a93b0',
  blue:      '#3b82f6',
  blueDim:   'rgba(59,130,246,0.12)',
  teal:      '#2dd4bf',
  tealDim:   'rgba(45,212,191,0.12)',
  purple:    '#a78bfa',
  purpleDim: 'rgba(167,139,250,0.12)',
  green:     '#4ade80',
  greenDim:  'rgba(74,222,128,0.12)',
  red:       '#f87171',
  orange:    '#fb923c',
  yellow:    '#fbbf24',
} as const

// ══════════════════════════════════════════════════════════════
// COMPONENTES ATÔMICOS
// ══════════════════════════════════════════════════════════════
function Div({ style }: DivProps) {
  return <div style={{ height: 1, background: T.border, margin: '16px 0', ...style }} />
}

function NInput({ value, onChange, pre, placeholder = '0' }: NInputProps) {
  return (
    <div style={{ position: 'relative' }}>
      {pre && (
        <span style={{
          position: 'absolute', left: 10, top: '50%',
          transform: 'translateY(-50%)', color: T.muted,
          fontSize: 12, fontWeight: 600, pointerEvents: 'none',
        }}>{pre}</span>
      )}
      <input
        type="number"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: T.card2, border: `1.5px solid ${T.border}`,
          borderRadius: 8, padding: `9px 10px 9px ${pre ? '28px' : '10px'}`,
          color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
        }}
        onFocus={e => (e.target.style.borderColor = T.blue)}
        onBlur={e  => (e.target.style.borderColor = T.border)}
      />
    </div>
  )
}

function Seg({ value, onChange, opts }: SegProps) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {opts.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            flex: 1, padding: '9px 6px', borderRadius: 8,
            border: `1.5px solid ${value === o.v ? T.blue : T.border}`,
            background: value === o.v ? T.blueDim : T.card2,
            color: value === o.v ? T.blue : T.muted,
            fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}
        >{o.l}</button>
      ))}
    </div>
  )
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
      color: T.blue, textTransform: 'uppercase', marginBottom: 5,
    }}>{children}</div>
  )
}

function Badge({ children, c = T.blue }: { children: React.ReactNode; c?: string }) {
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 99,
      background: c + '22', color: c, fontWeight: 700, fontSize: 11,
    }}>{children}</span>
  )
}

function TabBtn({ label, active, onClick }: TabBtnProps) {
  return (
    <button onClick={onClick} style={{
      padding: '11px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      border: 'none', background: 'none',
      color: active ? T.blue : T.muted,
      borderBottom: `2px solid ${active ? T.blue : 'transparent'}`,
      fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>{label}</button>
  )
}

function ResRow({ label, valor, pct: pctBarra = 0, c, barra = false, bold = false }: ResRowProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: barra ? 3 : 0 }}>
        <span style={{ fontSize: 12, color: T.mutedL }}>{label}</span>
        <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 800 : 600, color: c ?? T.text }}>
          {brl(valor)}
        </span>
      </div>
      {barra && (
        <div style={{ height: 3, borderRadius: 99, background: T.card2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.min(pctBarra, 100)}%`,
            background: c, borderRadius: 99,
            transition: 'width 0.5s cubic-bezier(.4,0,.2,1)',
          }} />
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// EDITOR DE TABELA
// ══════════════════════════════════════════════════════════════
function TabelaEditor({ titulo, descricao, colunas, linhas, onChange }: TabelaEditorProps) {
  const addRow = () => {
    const r: Record<string, number | string> = { id: uid() }
    colunas.forEach(c => { if (!c.readOnly) r[c.key] = 0 })
    onChange([...linhas, r])
  }

  const del = (i: number) => onChange(linhas.filter((_, idx) => idx !== i))

  const upd = (i: number, key: string, val: number | string) =>
    onChange(linhas.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{titulo}</div>
          {descricao && <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{descricao}</div>}
        </div>
        <button onClick={addRow} style={{
          background: T.card2, border: `1px solid ${T.border}`, color: T.blue,
          borderRadius: 7, padding: '5px 12px', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
        }}>+ Faixa</button>
      </div>

      <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: T.card2 }}>
              {colunas.map(c => (
                <th key={c.key} style={{
                  textAlign: 'left', padding: '7px 12px',
                  color: T.muted, fontWeight: 600, fontSize: 10,
                  borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
                }}>{c.label}</th>
              ))}
              <th style={{ width: 36, borderBottom: `1px solid ${T.border}` }} />
            </tr>
          </thead>
          <tbody>
            {linhas.map((row, i) => (
              <tr key={String(row.id ?? i)} style={{ borderBottom: i < linhas.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                {colunas.map(c => (
                  <td key={c.key} style={{ padding: '3px 6px' }}>
                    {c.readOnly
                      ? <span style={{ padding: '6px 8px', display: 'block', color: T.mutedL, fontSize: 11, fontStyle: 'italic' }}>{String(row[c.key])}</span>
                      : (
                        <input
                          type="number"
                          value={Number(row[c.key]) >= 9e14 ? '' : String(row[c.key])}
                          placeholder={Number(row[c.key]) >= 9e14 ? '∞' : (c.ph ?? '0')}
                          onChange={e => {
                            const v = e.target.value
                            upd(i, c.key, v === '' ? 9e15 : parseFloat(v) || 0)
                          }}
                          style={{
                            width: '100%', background: 'transparent',
                            border: '1px solid transparent', borderRadius: 6,
                            padding: '7px 8px', color: T.text,
                            fontSize: 12, fontFamily: 'inherit', outline: 'none',
                            transition: 'all 0.15s', boxSizing: 'border-box',
                          }}
                          onFocus={e => { e.target.style.background = T.card2; e.target.style.borderColor = T.blue }}
                          onBlur={e  => { e.target.style.background = 'transparent'; e.target.style.borderColor = 'transparent' }}
                        />
                      )
                    }
                  </td>
                ))}
                <td style={{ textAlign: 'center', padding: '3px 0' }}>
                  <button onClick={() => del(i)} style={{
                    background: 'none', border: 'none',
                    color: T.red + '88', cursor: 'pointer', fontSize: 16, padding: '4px 10px',
                  }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function SimuladorIRPF() {
  const [tab, setTab]           = useState<string>('simulador')
  const [salario, setSalario]   = useState<string>('')
  const [dep, setDep]           = useState<number>(0)
  const [outras, setOutras]     = useState<string>('')
  const [tipoDecl, setTipoDecl] = useState<'simplificada' | 'completa'>('simplificada')
  const [res, setRes]           = useState<ResultadoSimulacao | null>(null)

  const [progMensal,    setProgMensal]    = useState<FaixaProgressiva[]>(clone(DEF_PROG_MENSAL))
  const [redutorMensal, setRedutorMensal] = useState<FaixaRedutora[]>(clone(DEF_REDUTOR_MENSAL))
  const [progAnual,     setProgAnual]     = useState<FaixaProgressiva[]>(clone(DEF_PROG_ANUAL))
  const [redutorAnual,  setRedutorAnual]  = useState<FaixaRedutora[]>(clone(DEF_REDUTOR_ANUAL))
  const [inssTab,       setInssTab]       = useState<FaixaINSS[]>(clone(DEF_INSS))
  const [params,        setParams]        = useState<Params>({ ...DEF_PARAMS })
  const [editado,       setEditado]       = useState<boolean>(false)

  const salNum = parseFloat(salario.replace(',', '.')) || 0

  // Wrapper que marca as tabelas como editadas
  const mark = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
    (val: T) => { setter(val); setEditado(true) }

  const calcular = useCallback(() => {
    if (!salNum) return
    setRes(simular({
      salario: salNum, dependentes: dep, outrasDeducoes: outras, tipoDeducao: tipoDecl,
      progMensal, redutorMensal, progAnual, redutorAnual, inssTab, params,
    }))
  }, [salNum, dep, outras, tipoDecl, progMensal, redutorMensal, progAnual, redutorAnual, inssTab, params])

  const resetar = () => {
    setProgMensal(clone(DEF_PROG_MENSAL))
    setRedutorMensal(clone(DEF_REDUTOR_MENSAL))
    setProgAnual(clone(DEF_PROG_ANUAL))
    setRedutorAnual(clone(DEF_REDUTOR_ANUAL))
    setInssTab(clone(DEF_INSS))
    setParams({ ...DEF_PARAMS })
    setEditado(false)
  }

  const aliqMarg = progMensal.find(f => (res?.baseMensal ?? 0) <= f.limite)?.aliquota ?? 0

  // Cast helpers para o TabelaEditor (Record genérico)
  const toRec = <T extends object>(arr: T[]): Record<string, number | string>[] =>
    arr as unknown as Record<string, number | string>[]

  const fromRec = <T,>(arr: Record<string, number | string>[]): T[] =>
    arr as unknown as T[]

  const BtnReset = () => editado ? (
    <button onClick={resetar} style={{
      background: T.card2, border: `1px solid ${T.border}`, color: T.mutedL,
      borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>↺ Restaurar padrão</button>
  ) : null

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: T.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-thumb { background: #1c2e48; border-radius: 99px; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: `linear-gradient(135deg,${T.blue},${T.purple})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: '#fff',
              }}>IR</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>Simulador IRPF 2026</div>
                <div style={{ fontSize: 10, color: T.muted }}>Lei 15.270/2025 · vigência jan/2026</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {editado && (
                <span style={{ fontSize: 10, color: T.orange, fontWeight: 700, padding: '3px 10px', background: T.orange + '18', borderRadius: 99, border: `1px solid ${T.orange}44` }}>
                  ✏️ tabelas editadas
                </span>
              )}
              <span style={{ fontSize: 10, fontWeight: 700, color: T.teal, padding: '3px 10px', background: T.tealDim, borderRadius: 99 }}>
                JOTA MODULE v2.0
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', overflowX: 'auto' }}>
            {[
              ['simulador', '🧮 Simulador'],
              ['mensal',    '📋 Tabela Mensal'],
              ['anual',     '📅 Tabela Anual'],
              ['inss',      '🏛️ INSS'],
              ['params',    '⚙️ Parâmetros'],
            ].map(([id, label]) => (
              <TabBtn key={id} label={label} active={tab === id} onClick={() => setTab(id)} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '22px 20px 60px' }}>

        {/* ══════ SIMULADOR ══════ */}
        {tab === 'simulador' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Inputs */}
            <div>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Dados do Contribuinte</div>

                <div style={{ marginBottom: 13 }}>
                  <Lbl>Salário Bruto Mensal</Lbl>
                  <NInput pre="R$" value={salario} onChange={e => setSalario(e.target.value)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 13 }}>
                  <div>
                    <Lbl>Dependentes</Lbl>
                    <NInput value={dep} onChange={e => setDep(parseInt(e.target.value) || 0)} placeholder="0" />
                  </div>
                  <div>
                    <Lbl>Outras Deduções</Lbl>
                    <NInput pre="R$" value={outras} onChange={e => setOutras(e.target.value)} />
                  </div>
                </div>

                <div>
                  <Lbl>Tipo de Declaração</Lbl>
                  <Seg
                    value={tipoDecl}
                    onChange={v => setTipoDecl(v as 'simplificada' | 'completa')}
                    opts={[{ v: 'simplificada', l: 'Simplificada' }, { v: 'completa', l: 'Completa' }]}
                  />
                </div>
              </div>

              <button onClick={calcular} style={{
                width: '100%', padding: 14, borderRadius: 12,
                background: `linear-gradient(135deg,${T.blue},${T.purple})`,
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: `0 4px 20px ${T.blue}40`,
              }}>Calcular Imposto →</button>

              {res?.isento && (
                <div style={{ marginTop: 12, padding: '12px 16px', background: T.greenDim, border: `1px solid ${T.green}40`, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>🎉</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.green }}>Isento de IR!</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Renda ≤ R$ 5.000 — redutor zera o imposto</div>
                </div>
              )}
            </div>

            {/* Resultado */}
            <div>
              {res ? (
                <>
                  {/* Hero */}
                  <div style={{
                    background: 'linear-gradient(135deg,#0d1f4e,#1a0d3e)',
                    border: `1px solid ${T.border}`, borderRadius: 14, padding: 22, marginBottom: 14, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>
                      IR Retido na Fonte · Mensal
                    </div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}>
                      {brl(res.irMensal)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>ALÍQ. EFETIVA</div>
                        <Badge c={T.blue}>{pct(res.aliqEfetiva)}</Badge>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>ALÍQ. MARGINAL</div>
                        <Badge c={aliqMarg === 0 ? T.green : aliqMarg <= 15 ? T.yellow : T.orange}>
                          {aliqMarg === 0 ? 'Isento' : `${aliqMarg}%`}
                        </Badge>
                      </div>
                      {res.temRedutor && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>REDUTOR LEI 15.270</div>
                          <Badge c={T.teal}>−{brl(res.redutorMensal)}</Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Composição */}
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 13 }}>
                      Composição Mensal
                    </div>
                    <ResRow label="Salário Bruto"          valor={salNum}            pct={100}                             c={T.mutedL}  barra />
                    <ResRow label="(−) INSS"               valor={res.inss}          pct={(res.inss / salNum) * 100}       c={T.purple}  barra />
                    <ResRow label="Base de Cálculo IR"     valor={res.baseMensal}    pct={(res.baseMensal / salNum) * 100} c={T.blue}    barra />
                    <ResRow label="IR tabela progressiva"  valor={res.irBrutoMensal} pct={(res.irBrutoMensal/salNum)*100}  c={T.orange}  barra />
                    {res.temRedutor && (
                      <ResRow label="(−) Redutor Lei 15.270" valor={res.redutorMensal} pct={(res.redutorMensal/salNum)*100} c={T.teal} barra />
                    )}
                    <ResRow label="IR Final (IRRF)"        valor={res.irMensal}      pct={(res.irMensal / salNum) * 100}   c={T.red}     barra />
                    <Div />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: T.greenDim, border: `1px solid ${T.green}30`, borderRadius: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.green }}>💰 Salário Líquido</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: T.green }}>{brl(res.liquido)}</span>
                    </div>
                  </div>

                  {/* Projeção anual */}
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 13 }}>
                      Projeção Anual (12×)
                    </div>
                    <ResRow label="Renda Bruta Anual"  valor={res.rendaAnual}   c={T.mutedL} />
                    <ResRow label="Base de Cálculo"    valor={res.baseAnual}    c={T.blue}   />
                    <ResRow label="IR Bruto Anual"     valor={res.irBrutoAnual} c={T.orange} />
                    {res.redutorAnual > 0 && (
                      <ResRow label="(−) Redutor Anual" valor={res.redutorAnual} c={T.teal} />
                    )}
                    <Div />
                    <ResRow label="IR Anual Estimado" valor={res.irAnual} c={T.red} bold />
                    <div style={{ marginTop: 8, fontSize: 10, color: T.muted }}>
                      Alíq. efetiva anual: <strong style={{ color: T.text }}>{pct(res.aliqAnual)}</strong> · Estimativa sujeita a ajuste na DIRPF 2027
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 48, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 44, marginBottom: 14 }}>🧮</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.mutedL }}>Preencha os dados e calcule</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 8, lineHeight: 1.7 }}>
                    Tabelas 100% editáveis<br />nas abas acima
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════ TABELA MENSAL ══════ */}
        {tab === 'mensal' && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Tabelas Mensais — IRPF 2026</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Clique em qualquer célula para editar</div>
              </div>
              <BtnReset />
            </div>
            <Div />
            <TabelaEditor titulo="Tabela Progressiva Mensal" descricao="Base de cálculo (após deduções) × alíquota − parcela de dedução"
              linhas={toRec(progMensal)} onChange={v => mark(setProgMensal)(fromRec<FaixaProgressiva>(v))}
              colunas={[
                { key: 'limite',   label: 'Limite Superior (R$)', ph: 'vazio = sem limite' },
                { key: 'aliquota', label: 'Alíquota (%)' },
                { key: 'deducao',  label: 'Parcela de Dedução (R$)' },
              ]}
            />
            <TabelaEditor titulo="Redutores Mensais — Lei 15.270/2025" descricao="Aplicado sobre o IR calculado, baseado na renda bruta mensal"
              linhas={toRec(redutorMensal)} onChange={v => mark(setRedutorMensal)(fromRec<FaixaRedutora>(v))}
              colunas={[
                { key: 'limiteRenda',  label: 'Até renda mensal (R$)' },
                { key: 'redutorFixo',  label: 'Redutor Fixo (R$)' },
                { key: 'coeficiente',  label: 'Coeficiente (× renda)' },
                { key: 'nota',         label: 'Descrição', readOnly: true },
              ]}
            />
            <div style={{ padding: '12px 14px', background: T.blueDim, border: `1px solid ${T.blue}30`, borderRadius: 10, fontSize: 11, color: T.mutedL }}>
              <strong style={{ color: T.blue }}>Fórmula:</strong> Para renda entre R$5.000 e R$7.350 → redutor = <code style={{ color: T.teal }}>R$ 978,62 − (0,133145 × renda)</code>, limitado ao IR calculado.
              Para renda ≤ R$ 5.000 → redutor fixo de R$ 312,89 (zera o IR).
            </div>
          </div>
        )}

        {/* ══════ TABELA ANUAL ══════ */}
        {tab === 'anual' && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Tabelas Anuais — IRPF 2026</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>DIRPF 2027 · ano-calendário 2026</div>
              </div>
              <BtnReset />
            </div>
            <Div />
            <TabelaEditor titulo="Tabela Progressiva Anual"
              linhas={toRec(progAnual)} onChange={v => mark(setProgAnual)(fromRec<FaixaProgressiva>(v))}
              colunas={[
                { key: 'limite',   label: 'Limite Superior (R$)' },
                { key: 'aliquota', label: 'Alíquota (%)' },
                { key: 'deducao',  label: 'Parcela de Dedução (R$)' },
              ]}
            />
            <TabelaEditor titulo="Redutores Anuais — Lei 15.270/2025" descricao="Isenção e redução sobre IR anual"
              linhas={toRec(redutorAnual)} onChange={v => mark(setRedutorAnual)(fromRec<FaixaRedutora>(v))}
              colunas={[
                { key: 'limiteRenda',  label: 'Até renda anual (R$)' },
                { key: 'redutorFixo',  label: 'Redutor Fixo (R$)' },
                { key: 'coeficiente',  label: 'Coeficiente (× renda)' },
                { key: 'nota',         label: 'Descrição', readOnly: true },
              ]}
            />
            <div style={{ padding: '12px 14px', background: T.tealDim, border: `1px solid ${T.teal}30`, borderRadius: 10, fontSize: 11, color: T.mutedL }}>
              <strong style={{ color: T.teal }}>Redutor anual:</strong> Para renda ≤ R$ 60.000 → zera o IR.
              Entre R$ 60.001 e R$ 88.200 → <code style={{ color: T.blue }}>R$ 8.429,73 − (0,095575 × renda anual)</code>.
            </div>
          </div>
        )}

        {/* ══════ INSS ══════ */}
        {tab === 'inss' && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Tabela INSS 2026</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Contribuição progressiva do empregado</div>
              </div>
              <BtnReset />
            </div>
            <Div />
            <TabelaEditor titulo="Faixas de Contribuição INSS" descricao="Cada faixa incide apenas sobre a parcela do salário dentro do intervalo"
              linhas={toRec(inssTab)} onChange={v => mark(setInssTab)(fromRec<FaixaINSS>(v))}
              colunas={[
                { key: 'limite',   label: 'Limite Superior (R$)', ph: 'vazio = teto máximo' },
                { key: 'aliquota', label: 'Alíquota (%)' },
              ]}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
              {([
                ['Teto INSS 2026',      'R$ 8.157,41', 'Salário máximo para cálculo'],
                ['Contribuição Máxima', 'R$ 908,85',   '14% sobre R$ 8.157,41'],
              ] as [string, string, string][]).map(([t, v, s]) => (
                <div key={t} style={{ padding: '14px 16px', background: T.purpleDim, border: `1px solid ${T.purple}30`, borderRadius: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.purple, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{t}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{v}</div>
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════ PARÂMETROS ══════ */}
        {tab === 'params' && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Parâmetros Gerais</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Valores auxiliares usados nos cálculos</div>
              </div>
              <BtnReset />
            </div>
            <Div />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              {([
                { k: 'deducaoDependente'    as keyof Params, l: 'Dedução por Dependente', s: 'por mês (R$)'           },
                { k: 'descontoSimplificado' as keyof Params, l: 'Desconto Simplificado',  s: 'por mês — R$ 17.640/ano' },
                { k: 'tetoINSS'             as keyof Params, l: 'Teto do INSS',           s: 'salário máximo (R$)'    },
              ]).map(p => (
                <div key={p.k} style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{p.l}</div>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 10 }}>{p.s}</div>
                  <NInput
                    pre="R$"
                    value={params[p.k]}
                    onChange={e => {
                      setParams(prev => ({ ...prev, [p.k]: parseFloat(e.target.value) || 0 }))
                      setEditado(true)
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, padding: '12px 14px', background: T.yellow + '12', border: `1px solid ${T.yellow}30`, borderRadius: 10, fontSize: 11, color: T.mutedL }}>
              <strong style={{ color: T.yellow }}>Deduções anuais (ref.):</strong> Educação: até R$ 3.561,50/pessoa/ano · Simplificado anual: R$ 17.640
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 10, color: T.muted }}>
          Lei 15.270/2025 · Receita Federal do Brasil · Módulo JOTA v2.0 · Apenas estimativas — consulte um contador
        </div>
      </div>
    </div>
  )
}
