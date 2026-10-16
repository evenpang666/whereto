import React, { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
export function AgentProgress({ api, active, onRecover, kind, placeId }) {
  const [task, setTask] = useState(null);
  useEffect(() => {
    let live = true;
    const update = () => api("/generation").then(data => { if (live) setTask(data); }).catch(() => {});
    update(); const timer = active ? setInterval(update, 1500) : null;
    return () => { live = false; clearInterval(timer); };
  }, [active, api]);
  const relevant = task?.kind === kind && (!placeId || task?.placeId === placeId);
  if ((!active && !task?.sessionId) || (task && !relevant)) return null;
  return <div className="privacy-note"><span>{active && <Loader2 size={13} className="spin" />} {active ? task?.message || "正在提交 DSH Agent 会话…" : "DSH 会话已保留，可查看生成过程"}
    {task?.sessionId && <small>会话：{task.sessionId} <a href={task.url || "http://127.0.0.1:3080"} target="_blank" rel="noreferrer">打开 DSH Web <ExternalLink size={10} /></a></small>}
    {active && <button className="text-link" onClick={() => api("/generation/cancel", { method: "POST", body: "{}" })}>取消本次任务</button>}
    {!active && task?.sessionId && onRecover && <button className="text-link" onClick={() => onRecover(task.sessionId)}>读取已完成的会话结果</button>}
  </span></div>;
}
