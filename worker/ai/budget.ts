import type { Env } from '../types';
import { AppError } from '../lib/errors';
export const LIMIT = 30_000_000_000;
export const MODEL = 'gemini-2.5-flash';
export interface Price { id: string; model: string; input_usd: number; output_usd: number; krw_per_usd: number; safety_factor: number; valid_until: string; enabled: number }
export const monthKey = (date = new Date()) => new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0,7);
export function cost(p: Price, input: number, output: number) {
  return Math.ceil((input * p.input_usd + output * p.output_usd) * p.krw_per_usd * p.safety_factor);
}
export async function price(db: Env['DB'], now = new Date()): Promise<Price> {
  const p = await db.prepare('SELECT * FROM ai_prices WHERE enabled=1 ORDER BY valid_until DESC LIMIT 1').first<Price>();
  if (!p || p.model !== MODEL || p.valid_until <= now.toISOString() ||
      ![p.input_usd,p.output_usd,p.krw_per_usd,p.safety_factor].every(n => Number.isFinite(n) && n > 0) ||
      p.input_usd < .3 || p.output_usd < 2.5 || p.krw_per_usd < 1600 || p.safety_factor < 1.3)
    throw new AppError(503,'ai_price_unavailable','가격·환산 설정을 확인할 수 없어 AI 호출을 보류했습니다.');
  return p;
}
export async function reserve(db: Env['DB'], p: Price, purpose: string, amount: number, now = new Date()) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > LIMIT) throw new AppError(429,'ai_budget','요청에 필요한 예산이 부족합니다.');
  const id = crypto.randomUUID();
  try {
    await db.prepare(`INSERT INTO ai_calls(id,month,purpose,price_id,reserved,charged,state,created_at)
      VALUES(?1,?2,?3,?4,?5,?5,'reserved',?6)`).bind(id,monthKey(now),purpose,p.id,amount,now.toISOString()).run();
  } catch (e) {
    if (String(e).includes('ai_budget_exhausted')) throw new AppError(429,'ai_budget','월 AI 예산이 부족하여 요청을 시작하지 않았습니다.');
    throw new AppError(503,'ai_ledger_unavailable','예산 원장을 확인할 수 없어 AI 호출을 보류했습니다.');
  }
  return id;
}
export async function settle(db: Env['DB'], id: string, p: Price, input?: number, output?: number) {
  const valid = [input,output].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0);
  const row = await db.prepare('SELECT reserved FROM ai_calls WHERE id=?1').bind(id).first<{reserved:number}>();
  if (!row) throw new AppError(503,'ai_ledger_unavailable','예산 정산을 확인할 수 없습니다.');
  // Never release an unknown charge; no automatic expiry of reservations, even across months.
  const amount = valid ? cost(p,input!,output!) : row.reserved;
  if (amount > row.reserved) {
    await db.prepare('UPDATE ai_prices SET enabled=0').run();
    throw new AppError(503,'ai_price_unavailable','예상 비용과 사용량이 달라 AI 호출을 중단했습니다.');
  }
  await db.prepare(`UPDATE ai_calls SET charged=?1,state=?2,input_tokens=?3,output_tokens=?4,settled_at=?5
     WHERE id=?6 AND state='reserved'`).bind(amount,valid?'settled':'uncertain',input??null,output??null,new Date().toISOString(),id).run();
}
export async function budgetStatus(db: Env['DB']) {
  const month=monthKey();
  const r=await db.prepare(`SELECT COALESCE(SUM(charged),0) used,
    COALESCE(SUM(CASE WHEN state!='settled' THEN charged ELSE 0 END),0) held FROM ai_calls WHERE month=?1`).bind(month).first<{used:number;held:number}>();
  return {month,limit:30000,estimated:(r?.used??0)/1e6,held:(r?.held??0)/1e6,remaining:Math.max(0,(LIMIT-(r?.used??0))/1e6)};
}

/** Conservative AI incremental compute/D1 allowance, separate from existing base hosting.
 * 1,000 KRW/month retained for bounded index storage and ledger; 5 KRW per processing/question job.
 * No free-tier discounts assumed. See docs/ai.md for limits and actual billing caveats. */
export async function reserveWork(db:Env['DB'],purpose:string) {
  const p=await price(db),now=new Date(),month=monthKey(now);
  try {
    await db.prepare(`INSERT INTO ai_calls(id,month,purpose,price_id,reserved,charged,state,created_at)
      SELECT ?1,?2,'infrastructure-storage',?3,1000000000,1000000000,'settled',?4
      WHERE NOT EXISTS (SELECT 1 FROM ai_calls WHERE id=?1)`).bind('infra:'+month,month,p.id,now.toISOString()).run();
  }catch(e){
    if(String(e).includes('ai_budget_exhausted'))throw new AppError(429,'ai_budget','월 AI 예산이 부족합니다.');
    throw new AppError(503,'ai_ledger_unavailable','예산 원장을 확인할 수 없어 처리를 보류했습니다.');
  }
  const id=await reserve(db,p,'infrastructure-'+purpose,5_000_000,now);
  // Keep the conservative fixed allowance, rather than claiming exact Cloudflare billing attribution.
  await db.prepare("UPDATE ai_calls SET state='settled',settled_at=?1 WHERE id=?2").bind(now.toISOString(),id).run();
}
