import { useState } from "react";
import type { PageBlock } from "@shared/types";
import type { FormKey } from "./forms";
import { FORM_DEFS } from "./forms";
import { api } from "@/lib/api";

export function FormBlockView({
  formKey,
  parentId,
  editable,
  onPagesChanged,
  onOpenPage,
}: {
  formKey: FormKey;
  parentId: string;
  editable: boolean;
  onPagesChanged: () => void;
  onOpenPage: (id: string) => void;
}) {
  const def = FORM_DEFS[formKey];
  const [values, setValues] = useState<Record<string, string>>({});
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const firstValue = values[def.fields[0].id]?.trim();
      const title = `[${def.label}]${firstValue ? ` ${firstValue}` : ""}`;
      const created = await api.createPage({ parentId, title });
      const blocks: PageBlock[] = def.fields.map((f) => ({
        id: crypto.randomUUID(),
        type: "paragraph",
        text: `${f.label}: ${values[f.id]?.trim() || "-"}`,
      }));
      const withContent = await api.updatePageContent(created.id, created.contentVersion, { blocks });
      const dateField = def.fields.find((f) => f.kind === "date");
      if (dateField && values[dateField.id]) {
        await api.updatePageMeta(created.id, { expectedVersion: withContent.version, dueDate: values[dateField.id] });
      }
      onPagesChanged();
      setSubmittedId(created.id);
      setValues({});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="form-block">
      <div className="form-block__title">{def.label}</div>
      <div className="form-block__fields">
        {def.fields.map((f) => (
          <label key={f.id} className="form-block__field">
            <span>{f.label}</span>
            {f.kind === "select" ? (
              <select disabled={!editable} value={values[f.id] ?? ""} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}>
                <option value="">선택</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.kind === "date" ? "date" : "text"}
                disabled={!editable}
                value={values[f.id] ?? ""}
                onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      {editable && (
        <button type="button" className="form-block__submit" onClick={submit} disabled={submitting}>
          {submitting ? "제출 중…" : "제출"}
        </button>
      )}
      {submittedId && (
        <div className="form-block__success">
          제출되었습니다.{" "}
          <button type="button" onClick={() => onOpenPage(submittedId)}>
            생성된 페이지 열기
          </button>
        </div>
      )}
    </div>
  );
}
