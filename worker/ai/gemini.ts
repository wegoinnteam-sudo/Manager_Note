import type { Env } from '../types';
import { AppError } from '../lib/errors';
import { cost, MODEL, price, reserve, settle } from './budget';
export type Part = {text:string} | {inlineData:{mimeType:string;data:string}};
// Inspect provider diagnostics only to select fixed messages. Never return its raw body.
async function requestError(response: Response): Promise<AppError> {
  let message='';let reasons:string[]=[];
  try {
    const body:unknown=await response.json();
    if(body && typeof body==='object' && 'error' in body) {
      const error=body.error;
      if(error && typeof error==='object') {
        if('message' in error && typeof error.message==='string') message=error.message.toLowerCase();
        if('details' in error && Array.isArray(error.details)) reasons=error.details.flatMap(d=>
          d && typeof d==='object' && typeof d.reason==='string' ? [d.reason] : []);
      }
    }
  } catch { /* Non-JSON errors retain the HTTP-specific fallback. */ }
  if(reasons.includes('API_KEY_INVALID') || message.includes('api key not valid'))
    return new AppError(503,'ai_key_invalid','Google이 운영 서버의 API 키를 유효하지 않은 키로 판단했습니다. Cloudflare GEMINI_API_KEY 값을 확인해주세요.');
  if(reasons.includes('API_KEY_EXPIRED') || message.includes('api key expired'))
    return new AppError(503,'ai_key_expired','Gemini API 키가 만료되었습니다. 새 키를 발급해 Cloudflare에 등록해주세요.');
  if(message.includes('reported as leaked'))
    return new AppError(503,'ai_key_blocked','Google이 노출된 키로 판단해 차단했습니다. 새 키를 발급해 Cloudflare에 등록해주세요.');
  if(message.includes('user location is not supported'))
    return new AppError(503,'ai_location_unsupported','Google이 요청 서버의 위치에서 Gemini API 사용을 허용하지 않았습니다. 서버 실행 지역과 Google 프로젝트 정책을 확인해야 합니다.');
  if(message.includes('free tier is not available') || reasons.includes('BILLING_DISABLED'))
    return new AppError(503,'ai_billing_required','Google 프로젝트의 결제 설정을 확인해야 합니다. 무료 사용 가능 여부와 결제 활성화 상태를 확인해주세요.');
  if(reasons.includes('SERVICE_DISABLED'))
    return new AppError(503,'ai_service_disabled','Google 프로젝트에서 Gemini API가 비활성화되어 있습니다. 해당 프로젝트의 API 활성화 상태를 확인해주세요.');
  if(reasons.some(r=>['API_KEY_SERVICE_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_IP_ADDRESS_BLOCKED'].includes(r)))
    return new AppError(503,'ai_key_restricted','API 키의 서비스·웹사이트·IP 제한이 서버 요청을 차단했습니다. Google 프로젝트의 키 제한 설정을 확인해주세요.');
  if(response.status===401 || response.status===403)
    return new AppError(503,'ai_key_rejected','Gemini 키 또는 프로젝트 접근 권한을 확인해주세요.');
  if(message.includes('invalid json payload') || message.includes('unknown name'))
    return new AppError(502,'ai_request_format','Google이 서버에서 보낸 요청 형식을 거절했습니다 (400). 서버의 Gemini 요청 코드를 확인해야 합니다.');
  return new AppError(502,'ai_request_rejected','Google이 요청을 거절했습니다 (400). API 키의 유효성과 프로젝트 설정, 요청 형식을 확인해야 합니다.');
}
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
  let phase: 'transport' | 'response' | 'ledger' | 'content' = 'transport';
  try {
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
      body:serialized,signal:AbortSignal.timeout(50_000)});
    if(response.status===429) throw new AppError(503,'ai_rate_limit','Gemini 사용량 제한으로 요청이 거절되었습니다. 잠시 후 시도하거나 Google 프로젝트 한도를 확인해주세요.');
    if([400,401,403].includes(response.status)) throw await requestError(response);
    if(response.status===404) throw new AppError(502,'ai_model_unavailable','설정된 Gemini 모델을 찾을 수 없습니다 (404). 서버의 모델 설정을 확인해야 합니다.');
    if(response.status>=500) throw new AppError(502,'ai_provider_unavailable',`Google AI 서버 오류가 발생했습니다 (${response.status}). 잠시 후 다시 시도해주세요.`);
    if(!response.ok) throw new AppError(502,'ai_http_error',`Google AI 요청이 실패했습니다 (HTTP ${response.status}). 서버 설정을 확인해야 합니다.`);
    phase='response';
    const data=await response.json() as {usageMetadata?:{promptTokenCount?:number;candidatesTokenCount?:number;thoughtsTokenCount?:number};candidates?:{finishReason?:string;content?:{parts?:{text?:string}[]}}[]};
    const u=data.usageMetadata;
    phase='ledger';
    await settle(env.DB,id,p,u?.promptTokenCount,u?.candidatesTokenCount === undefined?undefined:u.candidatesTokenCount+(u.thoughtsTokenCount??0));
    settled=true;
    phase='content';
    const c=data.candidates?.[0];
    if(c?.finishReason!=='STOP') throw new AppError(502,'ai_incomplete','AI 응답이 완성되지 않았습니다. 자료를 확정하지 않았습니다.');
    return JSON.parse(c.content?.parts?.map(x=>x.text??'').join('')??'');
  } catch(e) {
    if(!settled) await settle(env.DB,id,p).catch(()=>{ /* reserved charge remains held */ });
    if(e instanceof AppError) throw e;
    // Only fixed diagnostics leave the server; upstream bodies may contain secrets or source text.
    if(e instanceof Error && (e.name==='TimeoutError' || e.name==='AbortError'))
      throw new AppError(504,'ai_timeout','Gemini 응답 대기 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    if(phase==='ledger') throw new AppError(503,'ai_usage_record_failed','AI 사용량 기록에 실패했습니다. 서버 데이터베이스 상태를 확인해야 합니다.');
    if(phase==='response' || phase==='content') throw new AppError(502,'ai_response_format','Gemini 응답 형식을 해석하지 못했습니다. 다시 질문해주세요.');
    throw new AppError(502,'ai_connection_failed','Gemini 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}
