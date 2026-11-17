import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, Legend } from 'recharts';
import { Plus, Repeat, TrendingUp, Info } from 'lucide-react';
import { financeApi } from '../api';
import { Badge, Button, Card, Empty, ErrorBlock, Field, Money, SectionTitle, Select, Sheet, Spinner, TextArea, TextInput, fmtDate, toDateInput, toastError, toastOk, useAsync } from '../components/ui';
import { StatTile } from '../components/period';
import { formatPaise, paiseToInput, rupeesToPaise } from '../../../utils/currency';
import { StatusBadge } from './FinanceHome';
import { CommitmentForm } from './Commitments';
import type { Commitment, Holding, HoldingType, InvestmentSummary } from '../types';

export const HOLDING_LABEL: Record<HoldingType, string> = {
  mutual_fund: 'Mutual funds', stock: 'Stocks', fd: 'Fixed deposits', rd: 'Recurring deposits', ppf: 'PPF', epf: 'EPF / PF', nps: 'NPS',
  gold: 'Gold', bond: 'Bonds', real_estate: 'Property', crypto: 'Crypto', other: 'Other',
};
export const HOLDING_COLOR: Record<HoldingType, string> = {
  mutual_fund: '#2A9D8F', stock: '#264653', fd: '#E9C46A', rd: '#F4A261', ppf: '#6D597A', epf: '#8D6A9F', nps: '#577590',
  gold: '#D4A017', bond: '#B5838D', real_estate: '#C86D51', crypto: '#E76F51', other: '#A39E98',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthShort = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
const lakhs = (paise: number) => {
  const r = paise / 100;
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (Math.abs(r) >= 1e3) return `₹${Math.round(r / 1e3)}k`;
  return `₹${Math.round(r)}`;
};

/** Investments: what you hold, what it's worth, SIPs, and graphs over time. */
export default function Investments() {
  const { data, error, loading, reload } = useAsync(() => financeApi.investments(), []);
  const [editing, setEditing] = useState<Holding | 'new' | null>(null);
  const [sip, setSip] = useState<Partial<Commitment> | null>(null);

  if (loading && !data) return <Spinner label="Adding up your investments…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;
  const t = data.totals;
  const hasAny = data.holdings.length > 0 || data.sips.length > 0 || t.putInLast12Paise > 0;

  return (
    <div className="flex flex-col gap-4" id="investments-page">
      <div className="flex justify-end gap-2 flex-wrap">
        <Button size="sm" variant="secondary" onClick={() => setSip({ type: 'sip', schedule: { freq: 'monthly', nextDueDate: new Date().toISOString() } as any })}><Repeat className="w-3.5 h-3.5" /> Add SIP</Button>
        <Button size="sm" onClick={() => setEditing('new')}><Plus className="w-3.5 h-3.5" /> Add investment</Button>
      </div>

      {!hasAny ? (
        <Empty title="No investments yet"
          text="Add your mutual funds, stocks, FDs, PPF, EPF, NPS or gold with what you put in and what it's worth today. SIP payments from your bank emails are picked up on their own."
          action={<Button onClick={() => setEditing('new')}>Add investment</Button>} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" id="investment-summary">
            <StatTile label="Worth today" value={formatPaise(t.valuePaise)} sub={`${data.holdings.filter((h) => h.isActive).length} investments`} />
            <StatTile label="Put in" value={formatPaise(t.investedPaise)} sub="Total invested" />
            <StatTile label="Gain" value={`${t.gainPaise >= 0 ? '+' : '−'}${formatPaise(Math.abs(t.gainPaise))}`} tone={t.gainPaise >= 0 ? 'good' : 'bad'}
              sub={t.gainPct === null ? '—' : `${t.gainPct >= 0 ? '+' : ''}${t.gainPct}% overall`} />
            <StatTile label="SIPs a month" value={formatPaise(t.sipMonthlyPaise)} sub={`${formatPaise(t.putInThisMonthPaise)} paid this month`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <SectionTitle>Where it's invested</SectionTitle>
              <TypeBreakdown data={data} />
            </Card>
            <Card>
              <SectionTitle>Value over 12 months</SectionTitle>
              <ValueChart data={data} />
            </Card>
          </div>

          <Card>
            <SectionTitle>Money put in each month</SectionTitle>
            {t.putInLast12Paise === 0 ? <p className="text-xs text-[#736F6A] mb-1">No investment payments found in your bank emails yet. SIP debits categorised as Investments show up here month by month.</p> : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.timeline.map((m) => ({ name: monthShort(m.month), value: m.putInPaise / 100 }))}>
                  <CartesianGrid vertical={false} stroke="#F2EFEA" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <Tooltip formatter={(v: any) => formatPaise(Math.round(Number(v) * 100))} />
                  <Bar dataKey="value" name="Invested" fill="#2A9D8F" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
            <p className="text-[10px] text-[#A39E98]">From bank payments in the Investments category (SIPs, stock purchases). {formatPaise(t.putInLast12Paise)} in the last 12 months.</p>
          </Card>

          <Card>
            <SectionTitle><span className="inline-flex items-center gap-1"><Repeat className="w-3.5 h-3.5" /> SIPs</span></SectionTitle>
            {data.sips.length === 0 ? <span className="text-xs text-[#736F6A]">No SIPs yet. SIP confirmation emails add them, or use "Add SIP".</span> : (
              <div className="flex flex-col divide-y divide-[#F2EFEA]">
                {data.sips.map((c) => (
                  <button key={c.id} type="button" onClick={() => setSip(c)} className="flex items-center gap-2 py-2 text-xs text-left cursor-pointer hover:bg-[#FAF8F5] -mx-1 px-1 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{c.name}</div>
                      <div className="text-[11px] text-[#736F6A]">{c.schedule.freq.replace('_', ' ')} · next {fmtDate(c.schedule.nextDueDate)}{c.lastPaidAt ? ` · last paid ${fmtDate(c.lastPaidAt)}` : ''}</div>
                    </div>
                    <StatusBadge status={c.status} />
                    <Money paise={c.amountPaise} currency={c.currency} />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Holdings data={data} onOpen={setEditing} />
          <p className="text-[10px] text-[#A39E98] flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" />Values are what you enter: update them whenever you check your app or statement (tap an investment). Coming later: import the free monthly CAMS/KFintech statement to fill mutual funds automatically.</p>
        </>
      )}

      {editing && <HoldingForm holding={editing === 'new' ? null : editing} sips={data.sips} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {sip && <CommitmentForm initial={sip} onClose={() => setSip(null)} onSaved={() => { setSip(null); reload(); }} />}
    </div>
  );
}

function TypeBreakdown({ data }: { data: InvestmentSummary }) {
  const slices = data.byType.filter((t) => t.valuePaise > 0);
  if (!slices.length) return <span className="text-xs text-[#736F6A]">Add an investment with its current value to see the mix.</span>;
  const total = slices.reduce((s, t) => s + t.valuePaise, 0);
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-center">
      <div className="w-40 h-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices.map((s) => ({ name: HOLDING_LABEL[s.type], value: s.valuePaise, type: s.type }))} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2} isAnimationActive={false}>
              {slices.map((s) => <Cell key={s.type} fill={HOLDING_COLOR[s.type]} />)}
            </Pie>
            <Tooltip formatter={(v: any) => formatPaise(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 w-full flex flex-col gap-1.5">
        {data.byType.map((s) => {
          const gain = s.valuePaise - s.investedPaise;
          return (
            <div key={s.type} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: HOLDING_COLOR[s.type] }} />
              <span className="flex-1 truncate">{HOLDING_LABEL[s.type]} <span className="text-[#A39E98]">· {Math.round((s.valuePaise / Math.max(1, total)) * 100)}%</span></span>
              <span className={`text-[10px] tabular-nums ${gain >= 0 ? 'text-[#2D6A4F]' : 'text-[#C86D51]'}`}>{gain >= 0 ? '+' : '−'}{lakhs(Math.abs(gain))}</span>
              <b className="tabular-nums">{formatPaise(s.valuePaise)}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ValueChart({ data }: { data: InvestmentSummary }) {
  const points = data.timeline.filter((m) => m.valuePaise || m.investedPaise);
  if (points.length < 2) return <span className="text-xs text-[#736F6A]">The graph fills in as you update values over the months. Each update is saved as a point.</span>;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.timeline.map((m) => ({ name: monthShort(m.month), value: m.valuePaise / 100, invested: m.investedPaise / 100 }))}>
          <CartesianGrid vertical={false} stroke="#F2EFEA" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => lakhs(Number(v) * 100)} />
          <Tooltip formatter={(v: any) => formatPaise(Math.round(Number(v) * 100))} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Area type="monotone" dataKey="value" name="Worth" stroke="#2A9D8F" fill="#2A9D8F" fillOpacity={0.15} isAnimationActive={false} />
          <Area type="monotone" dataKey="invested" name="Put in" stroke="#736F6A" fill="transparent" strokeDasharray="4 3" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Holdings({ data, onOpen }: { data: InvestmentSummary; onOpen: (h: Holding) => void }) {
  const groups = useMemo(() => {
    const m = new Map<HoldingType, Holding[]>();
    for (const h of data.holdings) m.set(h.type, [...(m.get(h.type) || []), h]);
    return Array.from(m.entries()).sort((a, b) => b[1].reduce((s, h) => s + h.currentValuePaise, 0) - a[1].reduce((s, h) => s + h.currentValuePaise, 0));
  }, [data.holdings]);
  if (!groups.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {groups.map(([type, list]) => (
        <div key={type} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-extrabold inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: HOLDING_COLOR[type] }} />{HOLDING_LABEL[type]}</span>
            <span className="text-[11px] text-[#736F6A]">{formatPaise(list.filter((h) => h.isActive).reduce((s, h) => s + h.currentValuePaise, 0))}</span>
          </div>
          <Card className="!p-0 divide-y divide-[#F2EFEA] overflow-hidden">
            {list.map((h) => {
              const gain = h.currentValuePaise - h.investedPaise;
              const pct = h.investedPaise ? Math.round((gain / h.investedPaise) * 1000) / 10 : null;
              const stale = Date.now() - new Date(h.valueAsOf).getTime() > 45 * 86_400_000;
              return (
                <button key={h.id} type="button" onClick={() => onOpen(h)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#FAF8F5] cursor-pointer ${h.isActive ? '' : 'opacity-50'}`}>
                  <TrendingUp className="w-4 h-4 text-[#736F6A] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{h.name}</div>
                    <div className="text-[11px] text-[#736F6A] truncate">
                      {[h.provider, h.reference ? `••${h.reference.slice(-4)}` : '', `value as of ${fmtDate(h.valueAsOf)}`].filter(Boolean).join(' · ')}
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      {!h.isActive && <Badge>Closed</Badge>}
                      {h.isActive && stale && <Badge tone="amber">Update value</Badge>}
                      {h.maturityDate && <Badge tone="blue">Matures {fmtDate(h.maturityDate)}</Badge>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Money paise={h.currentValuePaise} className="text-xs" />
                    <div className={`text-[10px] tabular-nums ${gain >= 0 ? 'text-[#2D6A4F]' : 'text-[#C86D51]'}`}>{gain >= 0 ? '+' : '−'}{formatPaise(Math.abs(gain))}{pct !== null ? ` (${pct}%)` : ''}</div>
                  </div>
                </button>
              );
            })}
          </Card>
        </div>
      ))}
    </div>
  );
}

function HoldingForm({ holding, sips, onClose, onSaved }: { holding: Holding | null; sips: Commitment[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: holding?.name || '', type: (holding?.type || 'mutual_fund') as HoldingType, provider: holding?.provider || '', reference: holding?.reference || '',
    invested: holding ? paiseToInput(holding.investedPaise) : '', value: holding ? paiseToInput(holding.currentValuePaise) : '',
    asOf: toDateInput(new Date().toISOString()), start: toDateInput(holding?.startDate || null), maturity: toDateInput(holding?.maturityDate || null),
    rate: holding?.interestRatePct != null ? String(holding.interestRatePct) : '', commitmentId: holding?.commitmentId || '', notes: holding?.notes || '',
    isActive: holding?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const fixedIncome = ['fd', 'rd', 'ppf', 'epf', 'nps', 'bond'].includes(f.type);

  const save = async () => {
    const investedPaise = f.invested.trim() ? rupeesToPaise(f.invested) : 0;
    const valuePaise = f.value.trim() ? rupeesToPaise(f.value) : investedPaise;
    if (!f.name.trim()) { toastError(new Error('Give it a name, e.g. "Parag Parikh Flexi Cap"')); return; }
    if (investedPaise === null || valuePaise === null) { toastError(new Error('Enter amounts like 150000')); return; }
    const body: Record<string, unknown> = {
      name: f.name.trim(), type: f.type, provider: f.provider, reference: f.reference, notes: f.notes, isActive: f.isActive,
      investedPaise, currentValuePaise: valuePaise, valueAsOf: `${f.asOf}T12:00:00+05:30`,
      startDate: f.start ? `${f.start}T00:00:00+05:30` : null, maturityDate: f.maturity ? `${f.maturity}T00:00:00+05:30` : null,
      interestRatePct: f.rate.trim() ? Number(f.rate) : null, commitmentId: f.commitmentId || null,
    };
    if (holding && investedPaise === holding.investedPaise && valuePaise === holding.currentValuePaise) delete body.valueAsOf;
    setBusy(true);
    try {
      if (holding) await financeApi.updateHolding(holding.id, body);
      else await financeApi.createHolding(body);
      toastOk('Saved');
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={holding ? holding.name : 'Add investment'} onClose={onClose} footer={<>
      {holding && <Button variant="danger" onClick={async () => { if (window.confirm(`Delete ${holding.name}? Its value history goes too.`)) { try { await financeApi.deleteHolding(holding.id); onSaved(); } catch (e) { toastError(e); } } }}>Delete</Button>}
      <Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button>
    </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><Select value={f.type} onChange={(v) => setF({ ...f, type: v as HoldingType })}>{Object.entries(HOLDING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Status"><Select value={f.isActive ? 'active' : 'closed'} onChange={(v) => setF({ ...f, isActive: v === 'active' })}><option value="active">Active</option><option value="closed">Closed / redeemed</option></Select></Field>
      </div>
      <Field label="Name"><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={f.type === 'fd' ? 'SBI FD 2026' : f.type === 'stock' ? 'Zerodha portfolio' : 'Parag Parikh Flexi Cap'} autoFocus={!holding} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Put in so far (₹)"><TextInput inputMode="decimal" value={f.invested} onChange={(e) => setF({ ...f, invested: e.target.value })} placeholder="150000" /></Field>
        <Field label="Worth today (₹)" hint="Leave empty if the same"><TextInput inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="172500" /></Field>
      </div>
      <Field label="Value as of" hint="Each change of amount is saved as a point on the graph"><TextInput type="date" value={f.asOf} onChange={(e) => setF({ ...f, asOf: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={f.type === 'stock' ? 'Broker' : f.type === 'mutual_fund' ? 'Fund house / app' : 'Bank / provider'}><TextInput value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} placeholder={f.type === 'stock' ? 'Zerodha' : 'Groww'} /></Field>
        <Field label="Folio / account no." hint="Only the last 4 are shown"><TextInput value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
      {fixedIncome && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Started"><TextInput type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Matures"><TextInput type="date" value={f.maturity} onChange={(e) => setF({ ...f, maturity: e.target.value })} /></Field>
          <Field label="Rate %"><TextInput inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="7.1" /></Field>
        </div>
      )}
      {sips.length > 0 && (
        <Field label="Fed by SIP"><Select value={f.commitmentId} onChange={(v) => setF({ ...f, commitmentId: v })}><option value="">None</option>{sips.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      )}
      <Field label="Notes"><TextArea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="!min-h-16" /></Field>
      {holding && holding.history.length > 1 && (
        <div className="text-[11px] text-[#736F6A]">
          <div className="font-bold text-[#2C2B29] mb-1">Value history</div>
          {[...holding.history].reverse().slice(0, 6).map((p) => <div key={p.date} className="flex justify-between"><span>{fmtDate(p.date)}</span><span className="tabular-nums">{formatPaise(p.valuePaise)} <span className="text-[#A39E98]">(put in {formatPaise(p.investedPaise)})</span></span></div>)}
        </div>
      )}
    </Sheet>
  );
}
