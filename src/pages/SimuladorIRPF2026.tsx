import { useState, useCallback } from 'react'
import type { ChangeEvent } from 'react'

// ══════════════════════════════════════════════════════════════
// TYPES — IRPF / IRRF
// ══════════════════════════════════════════════════════════════
interface FaixaProgressiva  { id: number; limite: number; aliquota: number; deducao: number }
interface FaixaRedutora     { id: number; limiteRenda: number; redutorFixo: number; coeficiente: number; nota: string }
interface FaixaINSS         { id: number; limite: number; aliquota: number }
interface Params            { deducaoDependente: number; descontoSimplificado: number; tetoINSS: number }

interface ResultadoSimulacao {
  inss: number; deducaoConsiderada: number; baseMensal: number
  irBrutoMensal: number; redutorMensal: number; irMensal: number
  aliqEfetiva: number; liquido: number; rendaAnual: number
  baseAnual: number; irBrutoAnual: number; redutorAnual: number
  irAnual: number; aliqAnual: number; isento: boolean
  temRedutor: boolean; usouSimplificado: boolean
}

interface SimularArgs {
  salario: number; dependentes: number; outrasDeducoes: string
  tipoDeducao: 'simplificada' | 'completa'
  progMensal: FaixaProgressiva[]; redutorMensal: FaixaRedutora[]
  progAnual: FaixaProgressiva[];  redutorAnual: FaixaRedutora[]
  inssTab: FaixaINSS[]; params: Params
}

// ══════════════════════════════════════════════════════════════
// TYPES — CARNÊ-LEÃO AUTÔNOMO
// ══════════════════════════════════════════════════════════════
type TipoDocumento   = 'nota_fiscal' | 'recibo' | 'sem_comprovacao'
type Classificacao   = 'dedutivel' | 'nao_dedutivel' | 'parcial' | 'revisao_manual'

interface Despesa {
  id: number
  descricao: string
  valor: number
  categoria: string
  tipo_documento: TipoDocumento
  data_pagamento: string
}

interface DespesaProcessada {
  id: number
  descricao: string
  valor_original: number
  valor_dedutivel: number
  classificacao: Classificacao
  motivo: string
}

interface ResultadoCarne {
  receita_bruta: number
  inss_pago: number
  dependentes: number
  pensao: number
  livro_caixa: number
  total_deducoes: number
  base_calculo: number
  ir_bruto: number
  redutor: number
  ir_devido: number
  aliq_efetiva: number
  despesas_processadas: DespesaProcessada[]
  alertas: string[]
}

// ══════════════════════════════════════════════════════════════
// TIPOS COMPARTILHADOS — UI
// ══════════════════════════════════════════════════════════════
interface Coluna        { key: string; label: string; ph?: string; readOnly?: boolean }
interface TabelaEditorProps { titulo: string; descricao?: string; colunas: Coluna[]; linhas: Record<string, number | string>[]; onChange: (l: Record<string, number | string>[]) => void }
interface NInputProps   { value: string | number; onChange: (e: ChangeEvent<HTMLInputElement>) => void; pre?: string; placeholder?: string; small?: boolean }
interface SegProps      { value: string; onChange: (v: string) => void; opts: { v: string; l: string }[] }
interface TabBtnProps   { label: string; active: boolean; onClick: () => void }
interface ResRowProps   { label: string; valor: number; pct?: number; c?: string; barra?: boolean; bold?: boolean; sub?: string }
interface DivProps      { style?: React.CSSProperties }

// ══════════════════════════════════════════════════════════════
// TABELAS OFICIAIS 2026 — Lei 15.270/2025
// ══════════════════════════════════════════════════════════════
const DEF_PROG_MENSAL: FaixaProgressiva[] = [
  { id:1, limite:2428.80,  aliquota:0,    deducao:0       },
  { id:2, limite:2826.65,  aliquota:7.5,  deducao:182.16  },
  { id:3, limite:3751.05,  aliquota:15,   deducao:394.16  },
  { id:4, limite:4664.68,  aliquota:22.5, deducao:675.49  },
  { id:5, limite:9e15,     aliquota:27.5, deducao:908.73  },
]
const DEF_REDUTOR_MENSAL: FaixaRedutora[] = [
  { id:1, limiteRenda:5000,  redutorFixo:312.89, coeficiente:0,        nota:'Isenção total (≤ R$ 5.000)'         },
  { id:2, limiteRenda:7350,  redutorFixo:978.62, coeficiente:0.133145, nota:'Redução parcial (R$ 5.001–R$ 7.350)' },
]
const DEF_PROG_ANUAL: FaixaProgressiva[] = [
  { id:1, limite:28467.20, aliquota:0,    deducao:0        },
  { id:2, limite:33919.80, aliquota:7.5,  deducao:2135.04  },
  { id:3, limite:45012.60, aliquota:15,   deducao:4679.03  },
  { id:4, limite:55976.16, aliquota:22.5, deducao:8054.97  },
  { id:5, limite:9e15,     aliquota:27.5, deducao:10853.78 },
]
const DEF_REDUTOR_ANUAL: FaixaRedutora[] = [
  { id:1, limiteRenda:60000, redutorFixo:2694.15, coeficiente:0,        nota:'Isenção total (≤ R$ 60.000)'          },
  { id:2, limiteRenda:88200, redutorFixo:8429.73, coeficiente:0.095575, nota:'Redução parcial (R$ 60.001–R$ 88.200)' },
]
const DEF_INSS: FaixaINSS[] = [
  { id:1, limite:1518.00,  aliquota:7.5 },
  { id:2, limite:2793.88,  aliquota:9   },
  { id:3, limite:4190.83,  aliquota:12  },
  { id:4, limite:8157.41,  aliquota:14  },
]
const DEF_PARAMS: Params = { deducaoDependente:189.59, descontoSimplificado:607.20, tetoINSS:8157.41 }

// ══════════════════════════════════════════════════════════════
// CATEGORIAS — CARNÊ-LEÃO
// ══════════════════════════════════════════════════════════════
const CATS_DEDUTÍVEIS = new Set([
  'aluguel','energia','agua','internet','telefone','material_escritorio',
  'salarios','encargos','servicos_terceiros','marketing','publicidade',
  'cursos_profissionais','conselho_classe','livros_tecnicos','software','coworking',
])
const CATS_HOME_OFFICE = new Set(['aluguel','energia','agua','internet','telefone'])
const CATS_PROIBIDAS   = new Set([
  'alimentacao','transporte','combustivel','veiculo','lazer',
  'educacao_pessoal','saude','compra_equipamento','investimento','reforma_imovel_proprio',
])
const CATS_LABELS: Record<string, string> = {
  aluguel:'Aluguel', energia:'Energia elétrica', agua:'Água', internet:'Internet',
  telefone:'Telefone', material_escritorio:'Material de escritório',
  salarios:'Salários', encargos:'Encargos trabalhistas', servicos_terceiros:'Serviços de terceiros',
  marketing:'Marketing', publicidade:'Publicidade', cursos_profissionais:'Cursos profissionais',
  conselho_classe:'Conselho de classe', livros_tecnicos:'Livros técnicos',
  software:'Software/Sistemas', coworking:'Coworking',
  alimentacao:'Alimentação', transporte:'Transporte', combustivel:'Combustível',
  veiculo:'Veículo', lazer:'Lazer', educacao_pessoal:'Educação pessoal',
  saude:'Saúde', compra_equipamento:'Compra de equipamento',
  investimento:'Investimento', reforma_imovel_proprio:'Reforma imóvel próprio',
}

let _uid = 300
const uid = (): number => ++_uid
const clone = <T,>(arr: T[]): T[] => arr.map(r => ({ ...r }))
const brl  = (v: number) => (+v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const pct  = (v: number) => (+v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'%'
const tr2  = (v: number) => Math.trunc(v * 100) / 100   // trunca em 2 casas (padrão Receita)

// ══════════════════════════════════════════════════════════════
// ENGINE IRRF/CLT
// ══════════════════════════════════════════════════════════════
function calcINSS(s: number, faixas: FaixaINSS[], teto: number): number {
  let v = 0, prev = 0
  const base = Math.min(s, teto)
  for (const f of faixas) {
    const fatia = Math.min(f.limite, base) - prev
    if (fatia > 0) v += fatia * (f.aliquota / 100)
    prev = f.limite
    if (base <= f.limite) break
  }
  return Math.round(v * 100) / 100
}

function calcIR(base: number, faixas: FaixaProgressiva[]): number {
  for (const f of faixas) {
    if (base <= f.limite) {
      const parcial = tr2(base * (f.aliquota / 100))
      return Math.max(0, tr2(parcial - f.deducao))
    }
  }
  return 0
}

function calcRedutor(renda: number, tab: FaixaRedutora[]): number {
  const [f1, f2] = tab
  if (!f1) return 0
  if (renda <= f1.limiteRenda) return f1.redutorFixo
  if (f2 && renda <= f2.limiteRenda) return Math.max(0, f2.redutorFixo - f2.coeficiente * renda)
  return 0
}

function simular({ salario, dependentes, outrasDeducoes, tipoDeducao,
  progMensal, redutorMensal, progAnual, redutorAnual, inssTab, params }: SimularArgs): ResultadoSimulacao {
  const s    = salario
  const inss = calcINSS(s, inssTab, params.tetoINSS)
  const simp = Math.min(s * 0.20, params.descontoSimplificado)
  const dedDep = dependentes * params.deducaoDependente
  const outras = parseFloat(outrasDeducoes) || 0
  const legais = dedDep + outras
  const usouSimplificado = tipoDeducao === 'simplificada'
  const ded = usouSimplificado ? simp : legais

  const baseMensal = Math.max(0, s - inss - ded)
  const irBrutoM   = calcIR(baseMensal, progMensal)
  const redutorM   = calcRedutor(s, redutorMensal)
  const irMensal   = Math.max(0, tr2(irBrutoM - redutorM))

  const rendaAnual = s * 12
  const inssAnual  = inss * 12
  const dedAnual   = usouSimplificado ? Math.min(rendaAnual * 0.20, 17640) : legais * 12
  const baseAnual  = Math.max(0, rendaAnual - inssAnual - dedAnual)
  const irBrutoA   = calcIR(baseAnual, progAnual)
  const redutorA   = calcRedutor(rendaAnual, redutorAnual)
  const irAnual    = Math.max(0, tr2(irBrutoA - redutorA))

  return {
    inss, deducaoConsiderada: +ded.toFixed(2), baseMensal: +baseMensal.toFixed(2),
    irBrutoMensal: +irBrutoM.toFixed(2), redutorMensal: +Math.max(0,redutorM).toFixed(2),
    irMensal, aliqEfetiva: s > 0 ? +((irMensal/s)*100).toFixed(2) : 0,
    liquido: +(s - inss - irMensal).toFixed(2), rendaAnual, baseAnual: +baseAnual.toFixed(2),
    irBrutoAnual: +irBrutoA.toFixed(2), redutorAnual: +Math.max(0,redutorA).toFixed(2),
    irAnual, aliqAnual: rendaAnual > 0 ? +((irAnual/rendaAnual)*100).toFixed(2) : 0,
    isento: irMensal === 0, temRedutor: redutorM > 0 && s <= 7350, usouSimplificado,
  }
}

// ══════════════════════════════════════════════════════════════
// ENGINE CARNÊ-LEÃO AUTÔNOMO
// Regras: RFB IN 2.060/2021 + Lei 15.270/2025
// Base = Receita − INSS − Dep − Pensão − Livro Caixa
// (sem desconto simplificado — autônomo usa Livro Caixa)
// ══════════════════════════════════════════════════════════════
function processarCarne(
  receita: number, inssPago: number, numDependentes: number,
  pensao: number, despesas: Despesa[], homeOffice: boolean,
  mesCompetencia: string, params: Params,
  progMensal: FaixaProgressiva[], redutorMensal: FaixaRedutora[]
): ResultadoCarne {
  const alertas: string[] = []
  const processadas: DespesaProcessada[] = []
  let livroCaixa = 0

  for (const d of despesas) {
    // ── Regime de Caixa: data dentro do mês ──────────────────
    if (d.data_pagamento && mesCompetencia) {
      const mesD = d.data_pagamento.substring(0, 7)
      if (mesD !== mesCompetencia) {
        processadas.push({ id: d.id, descricao: d.descricao, valor_original: d.valor,
          valor_dedutivel: 0, classificacao: 'nao_dedutivel',
          motivo: `Fora do mês de competência (${mesCompetencia}). Regime de caixa.` })
        continue
      }
    }

    const cat   = d.categoria?.toLowerCase().trim() || ''
    const temDoc = d.tipo_documento === 'nota_fiscal' || d.tipo_documento === 'recibo'

    // ── Categoria proibida ────────────────────────────────────
    if (CATS_PROIBIDAS.has(cat)) {
      alertas.push(`"${d.descricao}": categoria "${cat}" é despesa pessoal — não dedutível no Carnê-Leão.`)
      processadas.push({ id: d.id, descricao: d.descricao, valor_original: d.valor,
        valor_dedutivel: 0, classificacao: 'nao_dedutivel',
        motivo: `Categoria "${cat}" não é dedutível como Livro Caixa (despesa pessoal/não operacional).` })
      continue
    }

    // ── Categoria não reconhecida ─────────────────────────────
    if (!CATS_DEDUTÍVEIS.has(cat)) {
      alertas.push(`"${d.descricao}": categoria "${cat}" não reconhecida — aguarda revisão manual.`)
      processadas.push({ id: d.id, descricao: d.descricao, valor_original: d.valor,
        valor_dedutivel: 0, classificacao: 'revisao_manual',
        motivo: `Categoria "${cat}" não reconhecida. Revisar manualmente com contador.` })
      continue
    }

    // ── Sem comprovante ───────────────────────────────────────
    if (!temDoc) {
      alertas.push(`"${d.descricao}": sem comprovante válido (NF ou recibo) — não dedutível.`)
      processadas.push({ id: d.id, descricao: d.descricao, valor_original: d.valor,
        valor_dedutivel: 0, classificacao: 'nao_dedutivel',
        motivo: 'Sem comprovante fiscal válido (nota fiscal ou recibo identificado). Obrigatório para Livro Caixa.' })
      continue
    }

    // ── Categoria dedutível ───────────────────────────────────
    let valorDed = d.valor
    let classi: Classificacao = 'dedutivel'
    let motivo = `Despesa operacional dedutível — ${CATS_LABELS[cat] || cat}.`

    // Home Office: aplica fator 20% nas despesas mistas
    if (homeOffice && CATS_HOME_OFFICE.has(cat)) {
      valorDed = tr2(d.valor * 0.20)
      classi   = 'parcial'
      motivo   = `Home Office: 20% de ${CATS_LABELS[cat] || cat} (R$ ${d.valor.toFixed(2)}) = R$ ${valorDed.toFixed(2)}.`
      alertas.push(`"${d.descricao}": home office — dedução parcial de 20% (R$ ${valorDed.toFixed(2)}).`)
    }

    livroCaixa += valorDed
    processadas.push({ id: d.id, descricao: d.descricao, valor_original: d.valor,
      valor_dedutivel: valorDed, classificacao: classi, motivo })
  }

  // ── Limite: Livro Caixa não pode superar a receita bruta ──
  if (livroCaixa > receita) {
    alertas.push(`Livro Caixa (R$ ${livroCaixa.toFixed(2)}) supera a receita bruta (R$ ${receita.toFixed(2)}). Limitado à receita.`)
    livroCaixa = receita
  }

  // ── Deduções pessoais ─────────────────────────────────────
  const usarSimplificadoAutonomo = true

const deducao = usarSimplificadoAutonomo
  ? Math.min(receita * 0.20, params.descontoSimplificado)
  : livroCaixa
  const dedDep  = numDependentes * params.deducaoDependente
  const totalDed = inssPago + dedDep + pensao + livroCaixa

  // ── Base de cálculo ───────────────────────────────────────
  // Carnê-Leão: receita − INSS − dependentes − pensão − Livro Caixa
  //const base = Math.max(0, tr2(receita - totalDed))
/*  let base = receita
base = tr2(base - inssPago)
base = tr2(base - dedDep)
base = tr2(base - pensao)
base = tr2(base - livroCaixa)
base = Math.max(0, base)*/
  
let base = receita - inssPago - deducao

  // ── IR (tabela progressiva mensal) ────────────────────────
  const irBruto = calcIR(base, progMensal)

  // ── Redutor Lei 15.270 ────────────────────────────────────
  // No Carnê-Leão o redutor usa a RECEITA BRUTA (não a base)
  const redutor   = calcRedutor(receita, redutorMensal)
  const irDevido  = Math.max(0, tr2(irBruto - redutor))
  const aliqEfet  = receita > 0 ? tr2((irDevido / receita) * 100) : 0

  if (inssPago === 0) alertas.push('INSS não informado. Verifique se há contribuição como autônomo (INSS Avulso / GPS).')
  if (receita === 0)  alertas.push('Receita bruta zero — nenhum imposto calculado.')

  return {
    receita_bruta: receita, inss_pago: inssPago, dependentes: dedDep,
    pensao, livro_caixa: tr2(livroCaixa), total_deducoes: tr2(totalDed),
    base_calculo: base, ir_bruto: tr2(irBruto), redutor: tr2(Math.max(0,redutor)),
    ir_devido: irDevido, aliq_efetiva: aliqEfet,
    despesas_processadas: processadas, alertas,
  }
}

// ══════════════════════════════════════════════════════════════
// TEMA
// ══════════════════════════════════════════════════════════════
const T = {
  bg:'#070d1a', card:'#0f1929', card2:'#162030', border:'#1c2e48',
  text:'#e2e8f0', muted:'#4a6080', mutedL:'#7a93b0',
  blue:'#3b82f6', blueDim:'rgba(59,130,246,0.12)',
  teal:'#2dd4bf', tealDim:'rgba(45,212,191,0.12)',
  purple:'#a78bfa', purpleDim:'rgba(167,139,250,0.12)',
  green:'#4ade80', greenDim:'rgba(74,222,128,0.12)',
  red:'#f87171', redDim:'rgba(248,113,113,0.12)',
  orange:'#fb923c', yellow:'#fbbf24',
} as const

// ══════════════════════════════════════════════════════════════
// ATOMS
// ══════════════════════════════════════════════════════════════
function Div({ style }: DivProps) {
  return <div style={{ height:1, background:T.border, margin:'16px 0', ...style }} />
}

function NInput({ value, onChange, pre, placeholder='0', small }: NInputProps) {
  return (
    <div style={{ position:'relative' }}>
      {pre && <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:T.muted, fontSize:12, fontWeight:600, pointerEvents:'none' }}>{pre}</span>}
      <input type="number" value={value} onChange={onChange} placeholder={placeholder}
        style={{ width:'100%', boxSizing:'border-box', background:T.card2, border:`1.5px solid ${T.border}`, borderRadius:8, padding:`${small?'6px':'9px'} 10px ${small?'6px':'9px'} ${pre?'28px':'10px'}`, color:T.text, fontSize:small?12:13, fontFamily:'inherit', outline:'none' }}
        onFocus={e=>(e.target.style.borderColor=T.blue)} onBlur={e=>(e.target.style.borderColor=T.border)} />
    </div>
  )
}

function TxtInput({ value, onChange, placeholder }: { value:string; onChange:(e:ChangeEvent<HTMLInputElement>)=>void; placeholder?:string }) {
  return (
    <input type="text" value={value} onChange={onChange} placeholder={placeholder}
      style={{ width:'100%', boxSizing:'border-box', background:T.card2, border:`1.5px solid ${T.border}`, borderRadius:8, padding:'9px 10px', color:T.text, fontSize:13, fontFamily:'inherit', outline:'none' }}
      onFocus={e=>(e.target.style.borderColor=T.blue)} onBlur={e=>(e.target.style.borderColor=T.border)} />
  )
}

function Select({ value, onChange, opts }: { value:string; onChange:(v:string)=>void; opts:{v:string;l:string}[] }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{ width:'100%', boxSizing:'border-box', background:T.card2, border:`1.5px solid ${T.border}`, borderRadius:8, padding:'9px 10px', color:T.text, fontSize:12, fontFamily:'inherit', outline:'none', cursor:'pointer' }}>
      {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

function Seg({ value, onChange, opts }: SegProps) {
  return (
    <div style={{ display:'flex', gap:8 }}>
      {opts.map(o=>(
        <button key={o.v} onClick={()=>onChange(o.v)} style={{ flex:1, padding:'9px 6px', borderRadius:8, border:`1.5px solid ${value===o.v?T.blue:T.border}`, background:value===o.v?T.blueDim:T.card2, color:value===o.v?T.blue:T.muted, fontFamily:'inherit', fontWeight:600, fontSize:12, cursor:'pointer' }}>{o.l}</button>
      ))}
    </div>
  )
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', color:T.blue, textTransform:'uppercase', marginBottom:5 }}>{children}</div>
}

function Badge({ children, c=T.blue }: { children:React.ReactNode; c?:string }) {
  return <span style={{ padding:'2px 10px', borderRadius:99, background:c+'22', color:c, fontWeight:700, fontSize:11 }}>{children}</span>
}

function TabBtn({ label, active, onClick }: TabBtnProps) {
  return <button onClick={onClick} style={{ padding:'11px 14px', fontSize:12, fontWeight:600, cursor:'pointer', border:'none', background:'none', color:active?T.blue:T.muted, borderBottom:`2px solid ${active?T.blue:'transparent'}`, fontFamily:'inherit', transition:'all 0.15s', whiteSpace:'nowrap' }}>{label}</button>
}

function ResRow({ label, valor, pct:pctBarra=0, c, barra=false, bold=false, sub }: ResRowProps) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:barra?3:0 }}>
        <span style={{ fontSize:12, color:T.mutedL }}>{label}{sub&&<span style={{ fontSize:10, color:T.muted, marginLeft:6, fontStyle:'italic' }}>{sub}</span>}</span>
        <span style={{ fontSize:bold?15:13, fontWeight:bold?800:600, color:c??T.text }}>{brl(valor)}</span>
      </div>
      {barra&&<div style={{ height:3, borderRadius:99, background:T.card2, overflow:'hidden' }}><div style={{ height:'100%', width:`${Math.min(pctBarra,100)}%`, background:c, borderRadius:99, transition:'width 0.5s cubic-bezier(.4,0,.2,1)' }}/></div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// EDITOR DE TABELA (aba configuração)
// ══════════════════════════════════════════════════════════════
function TabelaEditor({ titulo, descricao, colunas, linhas, onChange }: TabelaEditorProps) {
  const addRow = () => {
    const r: Record<string,number|string> = { id:uid() }
    colunas.forEach(c=>{ if(!c.readOnly) r[c.key]=0 })
    onChange([...linhas, r])
  }
  const del = (i:number) => onChange(linhas.filter((_,idx)=>idx!==i))
  const upd = (i:number, key:string, val:number|string) => onChange(linhas.map((r,idx)=>idx===i?{...r,[key]:val}:r))
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:T.blue, textTransform:'uppercase', letterSpacing:'0.08em' }}>{titulo}</div>
          {descricao&&<div style={{ fontSize:11, color:T.muted, marginTop:3 }}>{descricao}</div>}
        </div>
        <button onClick={addRow} style={{ background:T.card2, border:`1px solid ${T.border}`, color:T.blue, borderRadius:7, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>+ Faixa</button>
      </div>
      <div style={{ overflowX:'auto', border:`1px solid ${T.border}`, borderRadius:10 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:T.card2 }}>
              {colunas.map(c=><th key={c.key} style={{ textAlign:'left', padding:'7px 12px', color:T.muted, fontWeight:600, fontSize:10, borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' }}>{c.label}</th>)}
              <th style={{ width:36, borderBottom:`1px solid ${T.border}` }}/>
            </tr>
          </thead>
          <tbody>
            {linhas.map((row,i)=>(
              <tr key={String(row.id??i)} style={{ borderBottom:i<linhas.length-1?`1px solid ${T.border}`:'none' }}>
                {colunas.map(c=>(
                  <td key={c.key} style={{ padding:'3px 6px' }}>
                    {c.readOnly
                      ? <span style={{ padding:'6px 8px', display:'block', color:T.mutedL, fontSize:11, fontStyle:'italic' }}>{String(row[c.key])}</span>
                      : <input type="number" value={Number(row[c.key])>=9e14?'':String(row[c.key])} placeholder={Number(row[c.key])>=9e14?'∞':(c.ph??'0')}
                          onChange={e=>{ const v=e.target.value; upd(i,c.key,v===''?9e15:parseFloat(v)||0) }}
                          style={{ width:'100%', background:'transparent', border:'1px solid transparent', borderRadius:6, padding:'7px 8px', color:T.text, fontSize:12, fontFamily:'inherit', outline:'none', transition:'all 0.15s', boxSizing:'border-box' }}
                          onFocus={e=>{e.target.style.background=T.card2;e.target.style.borderColor=T.blue}}
                          onBlur={e=>{e.target.style.background='transparent';e.target.style.borderColor='transparent'}}/>
                    }
                  </td>
                ))}
                <td style={{ textAlign:'center', padding:'3px 0' }}>
                  <button onClick={()=>del(i)} style={{ background:'none', border:'none', color:T.red+'88', cursor:'pointer', fontSize:16, padding:'4px 10px' }}>×</button>
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
// APP
// ══════════════════════════════════════════════════════════════
const CATS_OPTS = [
  ...Array.from(CATS_DEDUTÍVEIS).map(v=>({ v, l:`✔ ${CATS_LABELS[v]||v}` })),
  ...Array.from(CATS_PROIBIDAS).map(v=>({ v, l:`✘ ${CATS_LABELS[v]||v}` })),
  { v:'outros', l:'⚠ Outros (revisão manual)' },
]
const DOC_OPTS = [
  { v:'nota_fiscal',       l:'Nota Fiscal' },
  { v:'recibo',            l:'Recibo Identificado' },
  { v:'sem_comprovacao',   l:'Sem Comprovante' },
]

export default function SimuladorIRPF() {
  // Tabs
  const [tab, setTab] = useState<string>('simulador')

  // ── Estado Simulador CLT/IRRF ────────────────────────────
  const [salario, setSalario]   = useState<string>('')
  const [dep, setDep]           = useState<number>(0)
  const [outras, setOutras]     = useState<string>('')
  const [tipoDecl, setTipoDecl] = useState<'simplificada'|'completa'>('simplificada')
  const [res, setRes]           = useState<ResultadoSimulacao|null>(null)

  // ── Estado tabelas editáveis ─────────────────────────────
  const [progMensal,    setProgMensal]    = useState<FaixaProgressiva[]>(clone(DEF_PROG_MENSAL))
  const [redutorMensal, setRedutorMensal] = useState<FaixaRedutora[]>(clone(DEF_REDUTOR_MENSAL))
  const [progAnual,     setProgAnual]     = useState<FaixaProgressiva[]>(clone(DEF_PROG_ANUAL))
  const [redutorAnual,  setRedutorAnual]  = useState<FaixaRedutora[]>(clone(DEF_REDUTOR_ANUAL))
  const [inssTab,       setInssTab]       = useState<FaixaINSS[]>(clone(DEF_INSS))
  const [params,        setParams]        = useState<Params>({...DEF_PARAMS})
  const [editado,       setEditado]       = useState<boolean>(false)

  // ── Estado Carnê-Leão Autônomo ───────────────────────────
  const [cReceita,    setCReceita]    = useState<string>('')
  const [cInss,       setCInss]       = useState<string>('')
  const [cDep,        setCDep]        = useState<number>(0)
  const [cPensao,     setCPensao]     = useState<string>('')
  const [cMes,        setCMes]        = useState<string>(new Date().toISOString().substring(0,7))
  const [cHomeOffice, setCHomeOffice] = useState<boolean>(false)
  const [cDespesas,   setCDespesas]   = useState<Despesa[]>([])
  const [cRes,        setCRes]        = useState<ResultadoCarne|null>(null)
  // Nova despesa
  const [novaDesc,    setNovaDesc]    = useState<string>('')
  const [novaValor,   setNovaValor]   = useState<string>('')
  const [novaCat,     setNovaCat]     = useState<string>('aluguel')
  const [novaDoc,     setNovaDoc]     = useState<TipoDocumento>('nota_fiscal')
  const [novaData,    setNovaData]    = useState<string>(new Date().toISOString().substring(0,10))

  const salNum = parseFloat(salario.replace(',','.')) || 0
  const mark = <T,>(s: React.Dispatch<React.SetStateAction<T>>) => (v:T) => { s(v); setEditado(true) }

  const calcular = useCallback(() => {
    if (!salNum) return
    setRes(simular({ salario:salNum, dependentes:dep, outrasDeducoes:outras, tipoDeducao:tipoDecl,
      progMensal, redutorMensal, progAnual, redutorAnual, inssTab, params }))
  }, [salNum, dep, outras, tipoDecl, progMensal, redutorMensal, progAnual, redutorAnual, inssTab, params])

  const calcularCarne = useCallback(() => {
    const r = processarCarne(
      parseFloat(cReceita)||0, parseFloat(cInss)||0, cDep,
      parseFloat(cPensao)||0, cDespesas, cHomeOffice, cMes, params, progMensal, redutorMensal
    )
    setCRes(r)
  }, [cReceita, cInss, cDep, cPensao, cDespesas, cHomeOffice, cMes, params, progMensal, redutorMensal])

  const adicionarDespesa = () => {
    if (!novaDesc || !novaValor) return
    setCDespesas(prev => [...prev, {
      id: uid(), descricao: novaDesc, valor: parseFloat(novaValor)||0,
      categoria: novaCat, tipo_documento: novaDoc, data_pagamento: novaData,
    }])
    setNovaDesc(''); setNovaValor('')
  }

  const removerDespesa = (id: number) => setCDespesas(prev => prev.filter(d => d.id !== id))

  const resetar = () => {
    setProgMensal(clone(DEF_PROG_MENSAL)); setRedutorMensal(clone(DEF_REDUTOR_MENSAL))
    setProgAnual(clone(DEF_PROG_ANUAL));   setRedutorAnual(clone(DEF_REDUTOR_ANUAL))
    setInssTab(clone(DEF_INSS));           setParams({...DEF_PARAMS}); setEditado(false)
  }

  const aliqMarg = progMensal.find(f=>(res?.baseMensal??0)<=f.limite)?.aliquota??0
  const toRec = <T extends object>(a:T[]): Record<string,number|string>[] => a as unknown as Record<string,number|string>[]
  const fromRec = <T,>(a:Record<string,number|string>[]): T[] => a as unknown as T[]
  const BtnReset = () => editado ? <button onClick={resetar} style={{ background:T.card2, border:`1px solid ${T.border}`, color:T.mutedL, borderRadius:8, padding:'6px 14px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>↺ Restaurar padrão</button> : null

  const corClasif = (c: Classificacao) =>
    c==='dedutivel'?T.green : c==='parcial'?T.yellow : c==='revisao_manual'?T.orange : T.red

  return (
    <div style={{ minHeight:'100vh', background:T.bg, fontFamily:"'DM Sans','Segoe UI',sans-serif", color:T.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        input[type=number]{-moz-appearance:textfield;}
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        select option{background:#162030;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-thumb{background:#1c2e48;border-radius:99px;}
      `}</style>

      {/* HEADER */}
      <div style={{ background:T.card, borderBottom:`1px solid ${T.border}`, position:'sticky', top:0, zIndex:100 }}>
        <div style={{ maxWidth:920, margin:'0 auto', padding:'0 20px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:56 }}>
            <div style={{ display:'flex', alignItems:'center', gap:11 }}>
              <div style={{ width:34, height:34, borderRadius:9, background:`linear-gradient(135deg,${T.blue},${T.purple})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>IR</div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, letterSpacing:'-0.02em' }}>Simulador IRPF 2026</div>
                <div style={{ fontSize:10, color:T.muted }}>Lei 15.270/2025 · IRRF + Carnê-Leão Autônomo</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {editado&&<span style={{ fontSize:10, color:T.orange, fontWeight:700, padding:'3px 10px', background:T.orange+'18', borderRadius:99, border:`1px solid ${T.orange}44` }}>✏️ tabelas editadas</span>}
              <span style={{ fontSize:10, fontWeight:700, color:T.teal, padding:'3px 10px', background:T.tealDim, borderRadius:99 }}>JOTA MODULE v2.2</span>
            </div>
          </div>
          <div style={{ display:'flex', overflowX:'auto' }}>
            {[
              ['simulador','🧮 Simulador IRRF'],
              ['carne',    '📒 Carnê-Leão Autônomo'],
              ['mensal',   '📋 Tabela Mensal'],
              ['anual',    '📅 Tabela Anual'],
              ['inss',     '🏛️ INSS'],
              ['params',   '⚙️ Parâmetros'],
            ].map(([id,l])=><TabBtn key={id} label={l} active={tab===id} onClick={()=>setTab(id)} />)}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:920, margin:'0 auto', padding:'22px 20px 60px' }}>

        {/* ══ SIMULADOR IRRF/CLT ══ */}
        {tab==='simulador' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div>
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:20, marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:16 }}>Dados do Contribuinte — Empregado CLT</div>
                <div style={{ marginBottom:13 }}><Lbl>Salário Bruto Mensal</Lbl><NInput pre="R$" value={salario} onChange={e=>setSalario(e.target.value)}/></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:11, marginBottom:13 }}>
                  <div><Lbl>Dependentes</Lbl><NInput value={dep} onChange={e=>setDep(parseInt(e.target.value)||0)} placeholder="0"/></div>
                  <div><Lbl>Outras Deduções</Lbl><NInput pre="R$" value={outras} onChange={e=>setOutras(e.target.value)}/></div>
                </div>
                <div><Lbl>Tipo de Declaração</Lbl>
                  <Seg value={tipoDecl} onChange={v=>setTipoDecl(v as 'simplificada'|'completa')}
                    opts={[{v:'simplificada',l:'Simplificada (20%)'},{v:'completa',l:'Completa'}]}/>
                </div>
                <div style={{ marginTop:10, padding:'8px 12px', background:T.blueDim, borderRadius:8, fontSize:10, color:T.mutedL }}>
                  <strong style={{ color:T.blue }}>IRRF:</strong> INSS descontado da base · Empregado com vínculo empregatício
                </div>
              </div>
              <button onClick={calcular} style={{ width:'100%', padding:14, borderRadius:12, background:`linear-gradient(135deg,${T.blue},${T.purple})`, border:'none', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit', boxShadow:`0 4px 20px ${T.blue}40` }}>Calcular IRRF →</button>
              {res?.isento&&<div style={{ marginTop:12, padding:'12px 16px', background:T.greenDim, border:`1px solid ${T.green}40`, borderRadius:10, textAlign:'center' }}><div style={{ fontSize:20, marginBottom:4 }}>🎉</div><div style={{ fontSize:13, fontWeight:700, color:T.green }}>Isento de IR!</div><div style={{ fontSize:11, color:T.muted, marginTop:2 }}>Redutor Lei 15.270 zerou o imposto</div></div>}
            </div>
            <div>
              {res ? (
                <>
                  <div style={{ background:'linear-gradient(135deg,#0d1f4e,#1a0d3e)', border:`1px solid ${T.border}`, borderRadius:14, padding:22, marginBottom:14, textAlign:'center' }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.12em', color:'rgba(255,255,255,0.4)', textTransform:'uppercase', marginBottom:6 }}>IRRF Mensal</div>
                    <div style={{ fontSize:40, fontWeight:800, color:'#fff', letterSpacing:'-0.04em', lineHeight:1 }}>{brl(res.irMensal)}</div>
                    <div style={{ display:'flex', justifyContent:'center', gap:12, marginTop:12, flexWrap:'wrap' }}>
                      <div style={{ textAlign:'center' }}><div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', marginBottom:3 }}>ALÍQ. EFETIVA</div><Badge c={T.blue}>{pct(res.aliqEfetiva)}</Badge></div>
                      <div style={{ textAlign:'center' }}><div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', marginBottom:3 }}>ALÍQ. MARGINAL</div><Badge c={aliqMarg===0?T.green:aliqMarg<=15?T.yellow:T.orange}>{aliqMarg===0?'Isento':`${aliqMarg}%`}</Badge></div>
                      {res.temRedutor&&<div style={{ textAlign:'center' }}><div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', marginBottom:3 }}>REDUTOR 15.270</div><Badge c={T.teal}>−{brl(res.redutorMensal)}</Badge></div>}
                    </div>
                  </div>
                  <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18, marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:13 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>Composição Mensal</div>
                      <Badge c={res.usouSimplificado?T.teal:T.purple}>{res.usouSimplificado?'📐 Simplificada':'📋 Completa'}</Badge>
                    </div>
                    <ResRow label="(+) Salário Bruto"      valor={salNum}                 pct={100}                              c={T.mutedL} barra/>
                    <ResRow label="(−) INSS"               valor={res.inss}               pct={(res.inss/salNum)*100}            c={T.purple} barra/>
                    <ResRow label="(−) Dedução"            valor={res.deducaoConsiderada} pct={(res.deducaoConsiderada/salNum)*100} c={T.blue} barra sub={res.usouSimplificado?'20% s/ bruto, lim. R$ 607,20':'dep. + outras'}/>
                    <Div style={{ margin:'8px 0' }}/>
                    <ResRow label="= Base de Cálculo"      valor={res.baseMensal}         pct={(res.baseMensal/salNum)*100}      c={T.blue}   barra/>
                    <ResRow label="IR tabela progressiva"  valor={res.irBrutoMensal}      pct={(res.irBrutoMensal/salNum)*100}   c={T.orange} barra/>
                    {res.temRedutor&&<ResRow label="(−) Redutor Lei 15.270" valor={res.redutorMensal} pct={(res.redutorMensal/salNum)*100} c={T.teal} barra/>}
                    <ResRow label="= IR Devido (IRRF)"     valor={res.irMensal}           pct={(res.irMensal/salNum)*100}        c={T.red}    barra/>
                    <Div/>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:T.greenDim, border:`1px solid ${T.green}30`, borderRadius:10 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:T.green }}>💰 Salário Líquido</span>
                      <span style={{ fontSize:18, fontWeight:800, color:T.green }}>{brl(res.liquido)}</span>
                    </div>
                  </div>
                  <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:13 }}>Projeção Anual (12×)</div>
                    <ResRow label="Renda Bruta"    valor={res.rendaAnual}   c={T.mutedL}/>
                    <ResRow label="Base de Cálculo" valor={res.baseAnual}   c={T.blue}/>
                    <ResRow label="IR Bruto Anual" valor={res.irBrutoAnual} c={T.orange}/>
                    {res.redutorAnual>0&&<ResRow label="(−) Redutor Anual" valor={res.redutorAnual} c={T.teal}/>}
                    <Div/>
                    <ResRow label="IR Anual Estimado" valor={res.irAnual} c={T.red} bold/>
                    <div style={{ marginTop:8, fontSize:10, color:T.muted }}>Alíq. anual: <strong style={{ color:T.text }}>{pct(res.aliqAnual)}</strong> · Estimativa — DIRPF 2027</div>
                  </div>
                </>
              ) : (
                <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:48, textAlign:'center', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ fontSize:44, marginBottom:14 }}>🧮</div>
                  <div style={{ fontSize:14, fontWeight:600, color:T.mutedL }}>Simulador IRRF · Empregado CLT</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:8, lineHeight:1.7 }}>Para autônomo/profissional liberal<br/>use a aba <strong style={{ color:T.blue }}>📒 Carnê-Leão</strong></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ CARNÊ-LEÃO AUTÔNOMO ══ */}
        {tab==='carne' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {/* Coluna esquerda: inputs */}
            <div>
              {/* Dados gerais */}
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:20, marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:16 }}>📒 Carnê-Leão — Autônomo / Profissional Liberal</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:11, marginBottom:13 }}>
                  <div>
                    <Lbl>Mês de Competência</Lbl>
                    <input type="month" value={cMes} onChange={e=>setCMes(e.target.value)}
                      style={{ width:'100%', boxSizing:'border-box', background:T.card2, border:`1.5px solid ${T.border}`, borderRadius:8, padding:'9px 10px', color:T.text, fontSize:13, fontFamily:'inherit', outline:'none' }}
                      onFocus={e=>(e.target.style.borderColor=T.blue)} onBlur={e=>(e.target.style.borderColor=T.border)}/>
                  </div>
                  <div><Lbl>Receita Bruta do Mês</Lbl><NInput pre="R$" value={cReceita} onChange={e=>setCReceita(e.target.value)}/></div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:11, marginBottom:13 }}>
                  <div><Lbl>INSS Pago (GPS)</Lbl><NInput pre="R$" value={cInss} onChange={e=>setCInss(e.target.value)}/></div>
                  <div><Lbl>Dependentes</Lbl><NInput value={cDep} onChange={e=>setCDep(parseInt(e.target.value)||0)} placeholder="0"/></div>
                  <div><Lbl>Pensão Alimentícia</Lbl><NInput pre="R$" value={cPensao} onChange={e=>setCPensao(e.target.value)}/></div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="checkbox" id="homeoffice" checked={cHomeOffice} onChange={e=>setCHomeOffice(e.target.checked)}
                    style={{ width:16, height:16, cursor:'pointer', accentColor:T.blue }}/>
                  <label htmlFor="homeoffice" style={{ fontSize:12, color:T.mutedL, cursor:'pointer' }}>
                    Usa <strong>Home Office</strong> — aplicar 20% nas despesas de aluguel, energia, água, internet e telefone
                  </label>
                </div>
              </div>

              {/* Adicionar despesa (Livro Caixa) */}
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:20, marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.blue, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
                  📂 Livro Caixa — Adicionar Despesa
                </div>
                <div style={{ marginBottom:10 }}>
                  <Lbl>Descrição</Lbl>
                  <TxtInput value={novaDesc} onChange={e=>setNovaDesc(e.target.value)} placeholder="Ex: Aluguel sala comercial"/>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:11, marginBottom:10 }}>
                  <div><Lbl>Valor (R$)</Lbl><NInput pre="R$" value={novaValor} onChange={e=>setNovaValor(e.target.value)}/></div>
                  <div>
                    <Lbl>Data Pagamento</Lbl>
                    <input type="date" value={novaData} onChange={e=>setNovaData(e.target.value)}
                      style={{ width:'100%', boxSizing:'border-box', background:T.card2, border:`1.5px solid ${T.border}`, borderRadius:8, padding:'9px 10px', color:T.text, fontSize:13, fontFamily:'inherit', outline:'none' }}
                      onFocus={e=>(e.target.style.borderColor=T.blue)} onBlur={e=>(e.target.style.borderColor=T.border)}/>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:11, marginBottom:14 }}>
                  <div><Lbl>Categoria</Lbl><Select value={novaCat} onChange={setNovaCat} opts={CATS_OPTS}/></div>
                  <div><Lbl>Comprovante</Lbl><Select value={novaDoc} onChange={v=>setNovaDoc(v as TipoDocumento)} opts={DOC_OPTS}/></div>
                </div>
                <button onClick={adicionarDespesa} style={{ width:'100%', padding:'10px', borderRadius:10, background:T.card2, border:`1.5px solid ${T.blue}`, color:T.blue, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                  + Adicionar ao Livro Caixa
                </button>
              </div>

              {/* Lista de despesas */}
              {cDespesas.length > 0 && (
                <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:20, marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:T.mutedL, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
                    Despesas ({cDespesas.length})
                  </div>
                  {cDespesas.map(d=>(
                    <div key={d.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', background:T.card2, borderRadius:8, marginBottom:6 }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{d.descricao}</div>
                        <div style={{ fontSize:10, color:T.muted }}>
                          {CATS_LABELS[d.categoria]||d.categoria} · {d.tipo_documento.replace('_',' ')} · {d.data_pagamento}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{brl(d.valor)}</span>
                        <button onClick={()=>removerDespesa(d.id)} style={{ background:'none', border:'none', color:T.red+'88', cursor:'pointer', fontSize:16 }}>×</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:10, padding:'8px 10px', background:T.blueDim, borderRadius:8 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:T.blue }}>Total bruto informado</span>
                    <span style={{ fontSize:13, fontWeight:800, color:T.blue }}>{brl(cDespesas.reduce((a,d)=>a+d.valor,0))}</span>
                  </div>
                </div>
              )}

              <button onClick={calcularCarne} style={{ width:'100%', padding:14, borderRadius:12, background:`linear-gradient(135deg,${T.teal},${T.blue})`, border:'none', color:'#0f1929', fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit', boxShadow:`0 4px 20px ${T.teal}40` }}>
                Calcular Carnê-Leão →
              </button>
            </div>

            {/* Coluna direita: resultado */}
            <div>
              {cRes ? (
                <>
                  {/* Hero */}
                  <div style={{ background:'linear-gradient(135deg,#0a2a1e,#0d1f4e)', border:`1px solid ${T.border}`, borderRadius:14, padding:22, marginBottom:14, textAlign:'center' }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.12em', color:'rgba(255,255,255,0.4)', textTransform:'uppercase', marginBottom:6 }}>Carnê-Leão · IR Devido Mensal</div>
                    <div style={{ fontSize:40, fontWeight:800, color:'#fff', letterSpacing:'-0.04em', lineHeight:1 }}>{brl(cRes.ir_devido)}</div>
                    <div style={{ display:'flex', justifyContent:'center', gap:12, marginTop:12, flexWrap:'wrap' }}>
                      <div style={{ textAlign:'center' }}><div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', marginBottom:3 }}>ALÍQ. EFETIVA</div><Badge c={T.teal}>{pct(cRes.aliq_efetiva)}</Badge></div>
                      <div style={{ textAlign:'center' }}><div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', marginBottom:3 }}>LIVRO CAIXA</div><Badge c={T.blue}>{brl(cRes.livro_caixa)}</Badge></div>
                      {cRes.redutor>0&&<div style={{ textAlign:'center' }}><div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', marginBottom:3 }}>REDUTOR 15.270</div><Badge c={T.teal}>−{brl(cRes.redutor)}</Badge></div>}
                    </div>
                  </div>

                  {/* Resumo deduções */}
                  <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18, marginBottom:14 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:13 }}>Composição Carnê-Leão</div>
                    <ResRow label="(+) Receita Bruta"         valor={cRes.receita_bruta}    pct={100}                                     c={T.mutedL} barra/>
                    <ResRow label="(−) INSS Pago (GPS)"       valor={cRes.inss_pago}        pct={(cRes.inss_pago/cRes.receita_bruta)*100}  c={T.purple} barra/>
                    <ResRow label="(−) Dependentes"           valor={cRes.dependentes}      pct={(cRes.dependentes/cRes.receita_bruta)*100} c={T.blue}   barra sub={`${cDep}× R$ ${params.deducaoDependente}`}/>
                    {cRes.pensao>0&&<ResRow label="(−) Pensão Alimentícia"   valor={cRes.pensao}          pct={(cRes.pensao/cRes.receita_bruta)*100}     c={T.blue}   barra/>}
                    <ResRow label="(−) Livro Caixa"           valor={cRes.livro_caixa}      pct={(cRes.livro_caixa/cRes.receita_bruta)*100} c={T.blue}   barra/>
                    <Div style={{ margin:'8px 0' }}/>
                    <ResRow label="= Base de Cálculo"         valor={cRes.base_calculo}     pct={(cRes.base_calculo/cRes.receita_bruta)*100} c={T.blue}  barra/>
                    <ResRow label="IR tabela progressiva"     valor={cRes.ir_bruto}         pct={(cRes.ir_bruto/cRes.receita_bruta)*100}    c={T.orange} barra/>
                    {cRes.redutor>0&&<ResRow label="(−) Redutor Lei 15.270" valor={cRes.redutor}          pct={(cRes.redutor/cRes.receita_bruta)*100}     c={T.teal}   barra/>}
                    <Div/>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:cRes.ir_devido===0?T.greenDim:T.redDim, border:`1px solid ${cRes.ir_devido===0?T.green:T.red}30`, borderRadius:10 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:cRes.ir_devido===0?T.green:T.red }}>
                        {cRes.ir_devido===0?'🎉 Isento':'💸 IR a Recolher (DARF)'}
                      </span>
                      <span style={{ fontSize:18, fontWeight:800, color:cRes.ir_devido===0?T.green:T.red }}>{brl(cRes.ir_devido)}</span>
                    </div>
                    <div style={{ marginTop:8, fontSize:10, color:T.muted }}>
                      Total de deduções: <strong style={{ color:T.text }}>{brl(cRes.total_deducoes)}</strong>
                    </div>
                  </div>

                  {/* Despesas processadas */}
                  {cRes.despesas_processadas.length > 0 && (
                    <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18, marginBottom:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Classificação — Livro Caixa</div>
                      {cRes.despesas_processadas.map(d=>(
                        <div key={d.id} style={{ padding:'8px 10px', background:T.card2, borderRadius:8, marginBottom:6 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                            <span style={{ fontSize:12, fontWeight:600, color:T.text }}>{d.descricao}</span>
                            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                              <Badge c={corClasif(d.classificacao)}>
                                {d.classificacao==='dedutivel'?'✔ Dedutível':d.classificacao==='parcial'?'⬡ Parcial':d.classificacao==='revisao_manual'?'⚠ Revisão':'✘ Não dedut.'}
                              </Badge>
                              {d.valor_dedutivel>0&&<span style={{ fontSize:12, fontWeight:700, color:T.green }}>{brl(d.valor_dedutivel)}</span>}
                              {d.valor_dedutivel===0&&<span style={{ fontSize:12, fontWeight:700, color:T.red+'88' }}>{brl(d.valor_original)}</span>}
                            </div>
                          </div>
                          <div style={{ fontSize:10, color:T.muted }}>{d.motivo}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Alertas */}
                  {cRes.alertas.length > 0 && (
                    <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:T.orange, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>⚠️ Alertas Fiscais</div>
                      {cRes.alertas.map((a,i)=>(
                        <div key={i} style={{ padding:'7px 10px', background:T.orange+'12', border:`1px solid ${T.orange}30`, borderRadius:7, marginBottom:6, fontSize:11, color:T.mutedL }}>
                          {a}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:48, textAlign:'center', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ fontSize:44, marginBottom:14 }}>📒</div>
                  <div style={{ fontSize:14, fontWeight:600, color:T.mutedL }}>Carnê-Leão · Autônomo</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:8, lineHeight:1.8 }}>
                    Informe a receita, INSS pago<br/>e adicione suas despesas<br/>do <strong style={{ color:T.blue }}>Livro Caixa</strong>
                  </div>
                  <div style={{ marginTop:16, padding:'10px 16px', background:T.tealDim, borderRadius:10, fontSize:11, color:T.teal, textAlign:'left' }}>
                    ✔ Regime de Caixa<br/>✔ Classifica cada despesa<br/>✔ Valida comprovantes<br/>✔ Home Office (20%)<br/>✔ Aplica redutor Lei 15.270
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ TABELA MENSAL ══ */}
        {tab==='mensal'&&(
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div><div style={{ fontSize:14, fontWeight:700 }}>Tabelas Mensais — IRPF 2026</div><div style={{ fontSize:11, color:T.muted, marginTop:3 }}>Clique em qualquer célula para editar</div></div>
              <BtnReset/>
            </div>
            <Div/>
            <TabelaEditor titulo="Tabela Progressiva Mensal" descricao="Base de cálculo × alíquota − dedução"
              linhas={toRec(progMensal)} onChange={v=>mark(setProgMensal)(fromRec<FaixaProgressiva>(v))}
              colunas={[{key:'limite',label:'Limite Superior (R$)',ph:'vazio = sem limite'},{key:'aliquota',label:'Alíquota (%)'},{key:'deducao',label:'Parcela de Dedução (R$)'}]}/>
            <TabelaEditor titulo="Redutores Mensais — Lei 15.270/2025" descricao="Aplicado sobre o IR calculado, baseado na renda bruta mensal"
              linhas={toRec(redutorMensal)} onChange={v=>mark(setRedutorMensal)(fromRec<FaixaRedutora>(v))}
              colunas={[{key:'limiteRenda',label:'Até renda (R$)'},{key:'redutorFixo',label:'Redutor Fixo (R$)'},{key:'coeficiente',label:'Coeficiente (×renda)'},{key:'nota',label:'Descrição',readOnly:true}]}/>
            <div style={{ padding:'12px 14px', background:T.blueDim, border:`1px solid ${T.blue}30`, borderRadius:10, fontSize:11, color:T.mutedL }}>
              <strong style={{ color:T.blue }}>Fórmula:</strong> ≤ R$ 5.000 → fixa R$ 312,89 · R$ 5.001–R$ 7.350 → <code style={{ color:T.teal }}>R$ 978,62 − (0,133145 × renda)</code>
            </div>
          </div>
        )}

        {/* ══ TABELA ANUAL ══ */}
        {tab==='anual'&&(
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div><div style={{ fontSize:14, fontWeight:700 }}>Tabelas Anuais — IRPF 2026</div><div style={{ fontSize:11, color:T.muted, marginTop:3 }}>DIRPF 2027 · ano-calendário 2026</div></div>
              <BtnReset/>
            </div>
            <Div/>
            <TabelaEditor titulo="Tabela Progressiva Anual"
              linhas={toRec(progAnual)} onChange={v=>mark(setProgAnual)(fromRec<FaixaProgressiva>(v))}
              colunas={[{key:'limite',label:'Limite Superior (R$)'},{key:'aliquota',label:'Alíquota (%)'},{key:'deducao',label:'Parcela de Dedução (R$)'}]}/>
            <TabelaEditor titulo="Redutores Anuais — Lei 15.270/2025" descricao="Isenção e redução sobre IR anual"
              linhas={toRec(redutorAnual)} onChange={v=>mark(setRedutorAnual)(fromRec<FaixaRedutora>(v))}
              colunas={[{key:'limiteRenda',label:'Até renda anual (R$)'},{key:'redutorFixo',label:'Redutor Fixo (R$)'},{key:'coeficiente',label:'Coeficiente (×renda)'},{key:'nota',label:'Descrição',readOnly:true}]}/>
            <div style={{ padding:'12px 14px', background:T.tealDim, border:`1px solid ${T.teal}30`, borderRadius:10, fontSize:11, color:T.mutedL }}>
              <strong style={{ color:T.teal }}>Redutor anual:</strong> ≤ R$ 60.000 → R$ 2.694,15 · R$ 60.001–R$ 88.200 → <code style={{ color:T.blue }}>R$ 8.429,73 − (0,095575 × renda)</code>
            </div>
          </div>
        )}

        {/* ══ INSS ══ */}
        {tab==='inss'&&(
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div><div style={{ fontSize:14, fontWeight:700 }}>Tabela INSS 2026</div><div style={{ fontSize:11, color:T.muted, marginTop:3 }}>Contribuição progressiva do empregado</div></div>
              <BtnReset/>
            </div>
            <Div/>
            <TabelaEditor titulo="Faixas de Contribuição INSS"
              linhas={toRec(inssTab)} onChange={v=>mark(setInssTab)(fromRec<FaixaINSS>(v))}
              colunas={[{key:'limite',label:'Limite Superior (R$)',ph:'vazio = teto máximo'},{key:'aliquota',label:'Alíquota (%)'}]}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:4 }}>
              {([['Teto INSS 2026','R$ 8.157,41','Salário máximo para cálculo'],['Contribuição Máxima','R$ 908,85','14% sobre R$ 8.157,41']] as [string,string,string][]).map(([t,v,s])=>(
                <div key={t} style={{ padding:'14px 16px', background:T.purpleDim, border:`1px solid ${T.purple}30`, borderRadius:10 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:T.purple, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{t}</div>
                  <div style={{ fontSize:18, fontWeight:800, color:T.text }}>{v}</div>
                  <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ PARÂMETROS ══ */}
        {tab==='params'&&(
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div><div style={{ fontSize:14, fontWeight:700 }}>Parâmetros Gerais</div><div style={{ fontSize:11, color:T.muted, marginTop:3 }}>Válidos para IRRF e Carnê-Leão</div></div>
              <BtnReset/>
            </div>
            <Div/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
              {([
                {k:'deducaoDependente'    as keyof Params, l:'Dedução por Dependente',  s:'por mês (R$)'},
                {k:'descontoSimplificado' as keyof Params, l:'Desc. Simplificado',       s:'teto mensal — R$ 17.640/ano'},
                {k:'tetoINSS'             as keyof Params, l:'Teto do INSS',            s:'salário máximo (R$)'},
              ]).map(p=>(
                <div key={p.k} style={{ background:T.card2, border:`1px solid ${T.border}`, borderRadius:10, padding:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:T.blue, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{p.l}</div>
                  <div style={{ fontSize:10, color:T.muted, marginBottom:10 }}>{p.s}</div>
                  <NInput pre="R$" value={params[p.k]} onChange={e=>{ setParams(prev=>({...prev,[p.k]:parseFloat(e.target.value)||0})); setEditado(true) }}/>
                </div>
              ))}
            </div>
            <div style={{ marginTop:18, padding:'12px 14px', background:T.yellow+'12', border:`1px solid ${T.yellow}30`, borderRadius:10, fontSize:11, color:T.mutedL }}>
              <strong style={{ color:T.yellow }}>Referências 2026:</strong> Educação: até R$ 3.561,50/pessoa/ano · Simplificado anual: R$ 17.640 · Desconto simplificado mensal (Carnê-Leão): R$ 607,20
            </div>
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:20, fontSize:10, color:T.muted }}>
          Lei 15.270/2025 · IN RFB 2.060/2021 · Receita Federal do Brasil · JOTA v2.2 · Apenas estimativas — consulte um contador
        </div>
      </div>
    </div>
  )
}
