import React, { useState } from "react";
import { Check, Loader2, ExternalLink } from "lucide-react";

export function DshSettings({ settings, onSaved, onError, canManage = true }) {
  const [form, setForm] = useState({ sourceSessionId: settings.sourceSessionId || "", agentPreset: settings.agentPreset || "" });
  const [busy, setBusy] = useState(false);
  const save = async e => {
    e.preventDefault(); setBusy(true);
    try {
      const response = await fetch(import.meta.env.BASE_URL + "api/settings", { method: "PUT", headers: { "Content-Type": "application/json", "X-Whereto-Client": "local" }, body: JSON.stringify(form) });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      onSaved(data);
    } catch (error) { onError(error); } finally { setBusy(false); }
  };
  return <>
    <div className="modal-heading"><span className="eyebrow">POWERED BY YOUR DSH AGENT</span><h2>让 DSH 陪你出发。</h2>
      <p>地图负责探索，生成交给 DSH Web 中的 Agent 会话。</p></div>
    <div className="privacy-note"><span>{settings.connected ? `已连接 DSH · ${settings.model || "宿主默认模型"}` : "当前未运行在 DSH Web 插件中"}
      <small>模型、密钥、工具和 skills 由 DSH Web 管理，漫游不再保存独立 API 配置。</small></span></div>
    <a className="text-link" href={settings.webUrl || "/"} target="_blank" rel="noreferrer">打开 DSH Web 管理模型与工具 <ExternalLink size={12} /></a>
    <form className="settings-form" onSubmit={save}><fieldset className="settings-fields" disabled={!canManage || busy}>
      <label>沿用 DSH 会话的配置（可选）<input value={form.sourceSessionId} maxLength={160}
        onChange={e => setForm(f => ({ ...f, sourceSessionId: e.target.value.trim() }))} placeholder="session-…；留空沿用宿主默认模型" /></label>
      <p className="fine-print">每次生成创建一个独立旅行会话。填写已有会话 ID，可沿用其模型和 Agent 预设；不向原会话发送消息。</p>
      {settings.sourceError && <p className="fine-print" role="alert">{settings.sourceError}</p>}
      <label>Agent 预设<select value={form.agentPreset} onChange={e => setForm(f => ({ ...f, agentPreset: e.target.value }))}>
        <option value="">沿用参考会话或 DSH 默认预设</option>
        {(settings.presets || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <p className="fine-print">工具权限、skills、上下文管理及生成轮次沿用 DSH 预设。费用取决于 DSH 实际模型与工具调用；本页记录已报告的 tokens，不预设单次金额。</p>
      <button className="button primary" disabled={busy} type="submit">{busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />} 保存会话设置</button>
    </fieldset></form>
  </>;
}
