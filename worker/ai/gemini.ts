import type { Env } from '../types';
import { AppError } from '../lib/errors';
import { cost, MODEL, price, reserve, settle } from './budget';
export type Part = {text:string} | {inlineData:{mimeType:string;data:string}};
/** The only generateContent transport. No SDK retries, tools, browsing, caching, or chat history. */
export async function generate(env: Env, purpose: string, system: string, parts: Part[], outputLimit=4096): Promise<unknown> {
  if (!env.GEMINI_API_KEY) throw new AppError(503,'ai_key_missing','Gemini API 키가 설정되지 않았습니다.');
  const p=await price(env.DB);
  const body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts}],generationConfig:{
    temperature:0,maxOutputTokens:outputLimit,thinkingConfig:{thinkingBudget:0},responseMimeType:'application/json',candidateCount:1}};
  const serialized=JSON.stringify(body);
  // Text: UTF-8 bytes conservatively bound tokenization, with framing margin.
  // Vision: reserve the model's entire input capacity, never estimate page/image tokens optimistically.
  const inputBound=parts.some(x=>'inlineData' in x)?1_048_576:new TextEncoder().encode(serialized).length+4096;
  if(inputBound>1_048_576 || outputLimit>8192) throw new AppError(413,'ai_capacity','요청 자료가 처리 한도를 초과했습니다.');
  const id=await reserve(env.DB,p,purpose,cost(p,inputBound,outputLimit));
  let settled=false;
  try {
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
      body:serialized,signal:AbortSignal.timeout(50_000)});
    if(response.status===429) throw new AppError(503,'ai_rate_limit','Gemini 사용량 제한으로 요청이 거절되었습니다. 잠시 후 시도하거나 Google 프로젝트 한도를 확인해주세요.');
    if(response.status===401 || response.status===403) throw new AppError(503,'ai_key_rejected','Gemini 키 또는 프로젝트 접근 권한을 확인해주세요.');
    if(!response.ok) throw new Error('upstream');
    const data=await response.json() as {usageMetadata?:{promptTokenCount?:number;candidatesTokenCount?:number;thoughtsTokenCount?:number};candidates?:{finishReason?:string;content?:{parts?:{text?:string}[]}}[]};
    const u=data.usageMetadata;
    await settle(env.DB,id,p,u?.promptTokenCount,u?.candidatesTokenCount === undefined?undefined:u.candidatesTokenCount+(u.thoughtsTokenCount??0));
    settled=true;
    const c=data.candidates?.[0];
    if(c?.finishReason!=='STOP') throw new AppError(502,'ai_incomplete','AI 응답이 완성되지 않았습니다. 자료를 확정하지 않았습니다.');
    return JSON.parse(c.content?.parts?.map(x=>x.text??'').join('')??'');
  } catch(e) {
    if(!settled) await settle(env.DB,id,p).catch(()=>{ /* reserved charge remains held */ });
    if(e instanceof AppError) throw e;
    throw new AppError(502,'ai_api_error','Gemini 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
}
