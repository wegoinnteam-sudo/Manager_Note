import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { AiAnswer, AiStatus } from '@shared/ai';
const labels:Record<string,string>={pending:'처리 대기',processing:'처리 중',ready:'검색 가능',failed:'처리 실패',budget_wait:'예산 부족으로 대기'};
const won=(n:number)=>n.toLocaleString('ko-KR',{maximumFractionDigits:1})+'원';
export function AiQuestions() {
 const [status,setStatus]=useState<AiStatus|null>(null),[question,setQuestion]=useState(''),[result,setResult]=useState<AiAnswer|null>(null);
 const [busy,setBusy]=useState(false),[processing,setProcessing]=useState(false),[error,setError]=useState(''),[offset,setOffset]=useState(0);
 const locked=useRef(false),alive=useRef(true),processLock=useRef(false);
 const refresh=useCallback(async()=>{try{const s=await api.aiStatus(offset);if(alive.current)setStatus(s);}catch(e){if(alive.current)setError(e instanceof ApiClientError?e.message:'상태를 불러오지 못했습니다.');}},[offset]);
 useEffect(()=>{alive.current=true;void refresh();const t=window.setInterval(()=>void refresh(),15000);return()=>{alive.current=false;window.clearInterval(t);};},[refresh]);
 const ask=async()=>{
  if(locked.current||!question.trim())return;locked.current=true;setBusy(true);setError('');setResult(null);
  try{const r=await api.aiAsk(question.trim());if(alive.current)setResult(r);}catch(e){if(alive.current)setError(e instanceof ApiClientError?e.message:'네트워크 연결을 확인해주세요.');}
  finally{locked.current=false;if(alive.current){setBusy(false);void refresh();}}
 };
 const process=async()=>{
  if(processLock.current)return;processLock.current=true;setProcessing(true);setError('');
  try{await api.aiProcess();await refresh();}catch(e){setError(e instanceof ApiClientError?e.message:'자료 처리 요청에 실패했습니다.');}
  finally{processLock.current=false;if(alive.current)setProcessing(false);}
 };
 return <section className="page-view ai-panel" aria-labelledby="ai-title">
  <h1 id="ai-title">전체 노트에 질문하기</h1>
  <p className="ai-muted">전체 노트와 PDF·사진·엑셀에서 답변합니다</p>
  <p className="ai-muted">저장된 자료만 사용합니다. 질문마다 독립적으로 답변하며 이전 대화는 전달하지 않습니다.</p>
  {status&&<div className="ai-budget">
   <strong>{status.budget.month} 월 예상 사용액 {won(status.budget.estimated)}</strong>
   <span>한도 30,000원 · 잔여 {won(status.budget.remaining)}</span>
   <small>전체 사용자 합산 · 한국시간 기준 · 진행 중/과금 미확인 확보액 {won(status.budget.held)} 포함. 실제 청구액과 다를 수 있습니다.</small>
  </div>}
  {status&&!status.configured&&<p role="status" className="ai-warning">API 키 미설정: Cloudflare Secret에 GEMINI_API_KEY를 등록해주세요.</p>}
  {status&&!status.pricing&&<p role="status" className="ai-warning">가격 설정이 없거나 유효기간이 지났습니다. 유료 호출이 보류됩니다.</p>}
  {status&&status.inventory.ready<status.inventory.total&&<p className="ai-warning" role="status">자료 {status.inventory.total}개 중 {status.inventory.ready}개 검색 준비 완료. 미처리 또는 실패 자료가 있어 검색·집계가 불완전할 수 있습니다.</p>}
  <form onSubmit={e=>{e.preventDefault();void ask();}}>
   <label htmlFor="ai-question">질문</label>
   <textarea id="ai-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={2000} rows={3} placeholder="예: 카드키 분실 비용이 자료마다 다르게 적혀 있나요?" disabled={busy}/>
   <button type="submit" disabled={busy||!question.trim()||!status?.configured||!status?.pricing||status.budget.remaining<=0}>{busy?'저장된 자료 확인 중…':'질문하기'}</button>
  </form>
  {error&&<p role="alert" className="ai-warning">{error}</p>}
  <div aria-live="polite" aria-busy={busy}>
   {result&&<>
    <p className="ai-muted">{result.coverage.notice} ({result.coverage.readySources}/{result.coverage.totalSources}개 자료, {result.coverage.selectedChunks}/{result.coverage.totalChunks}개 구간)</p>
    {result.message&&<p>{result.message}</p>}
    {result.claims.map((claim,i)=><article className="ai-claim" key={i}>
     {claim.kind==='conflict'&&<strong className="ai-warning-label">자료 간 불일치</strong>}
     {claim.kind==='uncertain'&&<strong className="ai-warning-label">판독·확인 필요</strong>}
     <p>{claim.text}</p>
     {claim.citations.map((citation,j)=>{const source=result.sources.find(s=>s.id===citation.id);return source&&<details key={j}>
      <summary>{source.title} · {source.location}</summary>
      <blockquote>{citation.quote}</blockquote>
      <small>저장 수정일: {source.updatedAt} (적용일과 다를 수 있음)</small><br/>
      <a href={source.url} target="_blank" rel="noreferrer">근거 원본 {source.kind==='file'?'다운로드':'보기'}</a>
      {source.warnings.map((w,k)=><p className="ai-warning" key={k}>{w}</p>)}
     </details>;})}
    </article>)}
    {result.calculations.map((calc,i)=><article className="ai-claim" key={i}>
     <strong>{calc.label}: {calc.result} {calc.unit}</strong><p>{calc.scope}</p><p>계산 기준: {calc.basis}</p>
     <p>서버 계산: {calc.operation==='sum'?'합계':calc.operation==='average'?'평균':'개수'} · {calc.operands.length}개 값 {calc.rounding}</p>
     <details><summary>계산에 사용한 값과 출처</summary><ul>{calc.operands.map((o,j)=><li key={j}>{o.title} · {o.location} · {o.label}: {o.value} <a target="_blank" rel="noreferrer" href={result.sources.find(s=>s.id===o.chunkId)?.url}>원본</a></li>)}</ul></details>
    </article>)}
    {result.missing.length>0&&<p className="ai-warning">{[...new Set(result.missing)].join(' ')}</p>}
    <small>AI의 원문 해석에는 오류가 있을 수 있습니다. 중요한 값은 연결된 원본과 함께 확인해주세요.</small>
   </>}
  </div>
  <details className="ai-inventory"><summary>자료 처리 현황 {status?`(${status.inventory.ready}/${status.inventory.total})`:''}</summary>
   <p>기존 자료와 새 자료는 정기적으로 처리됩니다. PDF는 한 페이지씩, 엑셀은 모든 시트를 나누어 이어서 처리합니다.</p>
   <button type="button" onClick={()=>void process()} disabled={processing}>{processing?'자료 처리 중…':'대기 자료 처리 이어가기'}</button>
   {status?.inventory.sources.map(s=><div className="ai-source-status" key={s.id}>
    <span>{s.title}</span><strong>{labels[s.state]??s.state}</strong>
    {s.total!=null&&<small>{s.cursor??0}/{s.total} 구간</small>}
    {s.reason&&<p>{s.reason}</p>}
    {(s.state==='failed'||s.state==='budget_wait')&&<button type="button" disabled={processing} onClick={async()=>{try{await api.aiRetry(s.id);await refresh();}catch{setError('재처리 요청에 실패했습니다.');}}}>다시 대기열에 넣기</button>}
   </div>)}
   <button type="button" disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-100))}>이전</button>
   <button type="button" disabled={!status||offset+100>=status.inventory.total} onClick={()=>setOffset(v=>v+100)}>다음</button>
  </details>
 </section>;
}
