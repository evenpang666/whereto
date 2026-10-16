import React, { useEffect, useRef, useState } from "react";
import { CheckCheck, Loader2, Sparkles, ArrowUpRight, MapPin } from "lucide-react";
import { AgentProgress } from "./AgentProgress.jsx";

const money = n => `$${Number(n || 0).toFixed(4)}`;
export function VisitedPanel({ catalog, state, settings, api, matching, onBusy, onState, onVisited, onPlace, onError, onResult, onSettings }) {
  const [text, setText] = useState(""), [quote, setQuote] = useState(null), [result, setResult] = useState(null), [quoting, setQuoting] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    const id = ++sequence.current;
    setQuote(null);
    if (!text.trim()) { setQuoting(false); return; }
    setQuoting(true);
    const timer = setTimeout(() => {
      api("/visited/estimate", { method: "POST", body: JSON.stringify({ text }) })
        .then(q => { if (sequence.current === id) setQuote(q); })
        .catch(e => { if (sequence.current === id) onError(e); })
        .finally(() => { if (sequence.current === id) setQuoting(false); });
    }, 450);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [text]);
  const match = async () => {
    if (matching || !quote || !text.trim()) return;
    onBusy(true);
    setResult(null);
    try {
      const r = await api("/visited/match", { method: "POST", body: JSON.stringify({ text }) });
      onState(r.state); setResult(r); onResult(r);
    } catch (e) { onError(e); }
    finally { onBusy(false); }
  };
  const visited = state.visited.map(id => catalog.places.find(p => p.id === id)).filter(Boolean);
  const matched = result ? result.ids.map(id => catalog.places.find(p => p.id === id)).filter(Boolean) : null;
  const list = matched || visited;
  return <>
    <div className="modal-heading">
      <span className="eyebrow">PLACES YOU HAVE BEEN</span>
      <h2>走过的风景，留个记号。</h2>
      <p>已去过 {visited.length} 处 · 随时可以撤销，收藏仍然保留。</p>
    </div>
    <div className="visited-import">
      <label htmlFor="visited-record">写下去过的景点</label>
      <textarea id="visited-record" value={text} maxLength={12000} disabled={matching}
        onChange={e => { setText(e.target.value); setQuote(null); }}
        placeholder="例如：去过杭州西湖、北京故宫和黄山。也可以粘贴一长段旅行记录；同名景点请带上城市。" rows={4} />
      <p className="fine-print">DSH Agent 会把文字对应到库内景点并自动标记。想去、没去过及不能确定的名称不会标记；使用 DSH Web 配置的模型。</p>
      <button className="button primary" onClick={!settings.hasKey && !quote?.cached ? onSettings : match}
        disabled={matching || (!settings.hasKey && !quote?.cached ? false : !quote || quoting)}>
        {matching ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
        {matching ? "DSH 正在匹配并标记…" : !settings.hasKey && !quote?.cached ? "连接 DSH Agent" : quote?.cached ? "使用缓存并标记" : "匹配并标记去过"}
      </button>
      <p className="fine-print cost-label" aria-live="polite">
        {quote ? quote.cached ? "已命中本地匹配缓存，本次费用 $0。" : "使用 DSH Agent 会话匹配，费用由 DSH 模型与工具配置决定；匹配成功后缓存。"
          : quoting ? "正在检查本地缓存，不调用模型…" : "手动标记与浏览免费 · 自动匹配使用 DSH Agent"}
      </p>
      <AgentProgress api={api} active={matching} kind="visited-match" />
    </div>
    {result && <div className="match-report" role="status">
      <strong>对应 {result.ids.length} 处，新增 {result.added.length} 个标记</strong>
      <p className="fine-print">{result.cached ? "本次使用缓存 $0" : result.usage?.managedBy === "dsh" ? "用量已记录于 DSH 会话" : `历史费用估算 ${money(result.usage?.cost)}`} · 下方卡片可逐一撤销。</p>
      {!!result.unmatched.length && <p>库中未对应：{result.unmatched.join("、")}</p>}
      {!!result.ambiguous.length && <p>请补充城市或完整名称：{result.ambiguous.join("、")}</p>}
      <button className="text-link" onClick={() => setResult(null)}>查看全部去过记录 <ArrowUpRight size={14} /></button>
    </div>}
    <h3 className="visited-list-title">{matched ? "本次对应的景点卡片" : "已经走过的地方"} <small>{list.length}</small></h3>
    <div className="visited-list">
      {list.map(p => <article key={p.id} className={state.visited.includes(p.id) ? "is-visited" : ""}>
        <button className="visited-card-open" onClick={() => onPlace(p)}>
          <img src={p.image} alt={p.name} loading="lazy" />
          <span><small><MapPin size={11} /> {p.city}</small><strong>{p.name}</strong><small>{p.category}{p.imageKind === "ai-illustration" ? " · AI 印象图 · $0" : " · 参考配图"}</small></span>
        </button>
        <button className="visited-toggle" aria-label={`${state.visited.includes(p.id) ? "撤销去过" : "标记去过"}${p.name}`}
          onClick={() => onVisited(p.id)}><CheckCheck size={17} />{state.visited.includes(p.id) ? "已去过 · 撤销" : "标记去过"}</button>
      </article>)}
      {!list.length && <p className="visited-empty">还没有记下的风景。在景点卡片手动标记，或在上方一次整理旅行记录。</p>}
    </div>
  </>;
}
