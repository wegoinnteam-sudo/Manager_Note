import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiQuestions } from './AiQuestions';
import { api } from '@/lib/api';
vi.mock('@/lib/api',()=>({api:{aiStatus:vi.fn(),aiAsk:vi.fn(),aiProcess:vi.fn(),aiRetry:vi.fn()},ApiClientError:class extends Error{}}));
const status={configured:true,pricing:true,budget:{month:'2026-09',limit:30000,estimated:1000,held:0,remaining:29000},inventory:{total:3,ready:2,offset:0,sources:[{id:'a:1',title:'흐린 사진.jpg',kind:'file',state:'failed',cursor:0,total:1,reason:'판독 어려움'}]}};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(api.aiStatus).mockResolvedValue(status);});
describe('AI question panel',()=>{
 it('shows global scope, budget and incomplete coverage',async()=>{
  render(<AiQuestions/>);expect(screen.getByText('전체 노트와 PDF·사진·엑셀에서 답변합니다')).toBeInTheDocument();
  expect(await screen.findByText(/월 예상 사용액 1,000원/)).toBeInTheDocument();expect(screen.getByText(/자료 3개 중 2개/)).toBeInTheDocument();
 });
 it('prevents repeated submissions and sends only the current question',async()=>{
  let finish:(value:any)=>void=()=>{};vi.mocked(api.aiAsk).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  render(<AiQuestions/>);await screen.findByText(/월 예상 사용액/);
  fireEvent.change(screen.getByLabelText('질문'),{target:{value:'비용은?'}});const button=screen.getByRole('button',{name:'질문하기'});
  fireEvent.click(button);fireEvent.click(button);expect(api.aiAsk).toHaveBeenCalledTimes(1);expect(api.aiAsk).toHaveBeenCalledWith('비용은?');
  finish({message:'저장된 자료에서 답변 근거를 찾지 못했습니다',claims:[],calculations:[],missing:[],sources:[],coverage:{totalSources:3,readySources:2,selectedChunks:0,totalChunks:2,complete:false,notice:'미처리 자료 있음'}});
  await screen.findByText('저장된 자료에서 답변 근거를 찾지 못했습니다');await waitFor(()=>expect(screen.getByRole('button',{name:'질문하기'})).not.toBeDisabled());
 });
 it('disables paid questions when key or budget is unavailable',async()=>{
  vi.mocked(api.aiStatus).mockResolvedValue({...status,configured:false,budget:{...status.budget,remaining:0}});
  render(<AiQuestions/>);await screen.findByText(/API 키 미설정/);fireEvent.change(screen.getByLabelText('질문'),{target:{value:'질문'}});
  expect(screen.getByRole('button',{name:'질문하기'})).toBeDisabled();
 });
});
