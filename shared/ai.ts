export interface AiStatus {
 configured:boolean;pricing:boolean;
 budget:{month:string;limit:number;estimated:number;held:number;remaining:number};
 inventory:{total:number;ready:number;offset:number;sources:{id:string;title:string;kind:string;state:string;cursor:number|null;total:number|null;reason:string|null}[]};
}
export interface AiAnswer {
 message:string|null;
 claims:{text:string;kind:'fact'|'conflict'|'uncertain';citations:{id:string;quote:string}[]}[];
 missing:string[];
 calculations:{label:string;operation:string;unit:string;basis:string;result:string;scope:string;rounding:string|null;operands:{chunkId:string;title:string;location:string;label:string;value:string}[]}[];
 sources:{id:string;title:string;location:string;text:string;updatedAt:string;warnings:string[];url:string;kind:string}[];
 coverage:{totalSources:number;readySources:number;selectedChunks:number;totalChunks:number;complete:boolean;notice:string};
}
