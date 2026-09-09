import { Hono } from 'hono';
import { z } from 'zod';
import type { AppBindings } from '../types';
import { requireAuth } from '../middleware/rbac';
import { AppError, Errors } from '../lib/errors';
import { answer, safeAiError } from '../ai/answer';
import { budgetStatus, price } from '../ai/budget';
import { indexTick, inventoryStatus, noteUnits, type Inventory } from '../ai/indexer';
import { getFileMediaStream } from '../drive/client';
export const aiRoute=new Hono<AppBindings>();
aiRoute.use('*',requireAuth);
aiRoute.get('/status',async c=>{
  try {
    let pricing=true;try{await price(c.env.DB);}catch{pricing=false;}
    return c.json({budget:await budgetStatus(c.env.DB),inventory:await inventoryStatus(c.env.DB,Math.max(0,Number(c.req.query('offset'))||0)),configured:!!c.env.GEMINI_API_KEY,pricing});
  }catch{throw new AppError(503,'ai_ledger_unavailable','AI 데이터베이스가 준비되지 않았습니다. 마이그레이션 적용 여부를 확인해주세요.');}
});
aiRoute.post('/ask',async c=>{
  const {question}=z.object({question:z.string().trim().min(1).max(2000)}).strict().parse(await c.req.json());
  if(!c.env.GEMINI_API_KEY)throw new AppError(503,'ai_key_missing','Gemini API 키가 설정되지 않았습니다.');
  try{return c.json(await answer(c.env,question));}catch(e){throw safeAiError(e);}
});
aiRoute.post('/process',async c=>{try{return c.json({worked:await indexTick(c.env)});}catch{throw new AppError(503,'ai_processing_unavailable','자료 처리를 시작하지 못했습니다. 설정과 연결 상태를 확인해주세요.');}});
aiRoute.post('/sources/:id/retry',async c=>{
  await c.env.DB.prepare(`UPDATE ai_sources SET state='pending',attempts=0,reason=NULL WHERE id=?1 AND state IN ('failed','budget_wait')`).bind(c.req.param('id')).run();
  return c.json({ok:true});
});
// Explicit global read-only evidence endpoint. Existing page/file mutation permissions are unchanged.
aiRoute.get('/sources/:id/original',async c=>{
  const row=await c.env.DB.prepare('SELECT * FROM ai_inventory WHERE id=?1').bind(c.req.param('id')).first<Inventory>();
  if(!row)throw Errors.notFound('자료가 삭제되었거나 존재하지 않습니다.');
  if(row.kind==='note'){
    const content=await c.env.DB.prepare('SELECT content_json FROM page_contents WHERE page_id=?1').bind(row.page_id).first<{content_json:string}>();
    return c.text(`${row.title}\n저장 수정일: ${row.updated_at}\n\n${noteUnits(row.title,content?.content_json??'{"blocks":[]}').map(u=>`[${u.location}]\n${u.text}`).join('\n\n')}`,200,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  }
  if(!row.drive_file_id)throw Errors.notFound('원본이 준비되지 않았습니다.');
  const res=await getFileMediaStream(c.env,row.drive_file_id);
  // Download arbitrary originals: do not execute uploaded HTML/SVG in the app origin.
  return new Response(res.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.title)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
});
