export type FormKey = "leave_request" | "repair_request" | "purchase_request";
export type FormFieldKind = "text" | "date" | "select";

export interface FormFieldDef {
  id: string;
  label: string;
  kind: FormFieldKind;
  options?: string[];
}

export interface FormDef {
  label: string;
  description: string;
  fields: FormFieldDef[];
}

export const FORM_DEFS: Record<FormKey, FormDef> = {
  leave_request: {
    label: "휴가 신청",
    description: "성명, 기간, 사유를 입력해 하위 페이지로 제출합니다",
    fields: [
      { id: "name", label: "성명", kind: "text" },
      { id: "start", label: "시작일", kind: "date" },
      { id: "end", label: "종료일", kind: "date" },
      { id: "reason", label: "사유", kind: "text" },
    ],
  },
  repair_request: {
    label: "수리 요청",
    description: "위치, 문제 내용, 긴급도를 입력해 하위 페이지로 제출합니다",
    fields: [
      { id: "location", label: "위치/객실", kind: "text" },
      { id: "issue", label: "문제 내용", kind: "text" },
      { id: "urgency", label: "긴급도", kind: "select", options: ["낮음", "보통", "높음"] },
    ],
  },
  purchase_request: {
    label: "구매 요청",
    description: "품목, 수량, 사유를 입력해 하위 페이지로 제출합니다",
    fields: [
      { id: "item", label: "품목", kind: "text" },
      { id: "qty", label: "수량", kind: "text" },
      { id: "reason", label: "사유", kind: "text" },
    ],
  },
};

export const FORM_LIST: { key: FormKey; label: string; description: string }[] = (
  Object.entries(FORM_DEFS) as [FormKey, FormDef][]
).map(([key, def]) => ({ key, label: def.label, description: def.description }));
