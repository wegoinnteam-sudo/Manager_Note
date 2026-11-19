import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { HANDOVER_ALL_ACK_NAMES, type TeamMemberDTO } from "@shared/types";
import type { Project, ProjectDetail, ProjectInput, ProjectTask, ProjectTaskInput, ProjectTaskUpdate } from "@shared/projects";
import { api, ApiClientError } from "@/lib/api";
import { compressImageForUpload } from "@/lib/imageCompression";
import "../handover/handover.css";
import "./projects.css";

const projectStatuses = { planned: "예정", active: "진행 중", paused: "보류", finished: "종료" };
const taskStatuses = { todo: "미완료", doing: "진행 중", done: "완료" };
const priorities = { urgent: "긴급", high: "높음", normal: "보통", low: "낮음" };
const projectNotes = {
  goal: "목표 및 목표치", expected: "예상 결과", handover: "인수인계 사항",
  verification: "확인할 항목", outcome: "최종 성과",
} as const;
const defaultProject: ProjectInput = {
  title: "", owner: "", dueDate: "", goal: "", expected: "", handover: "", verification: "", outcome: "", status: "active",
};
const defaultTask: ProjectTaskInput = {
  title: "", assignee: "", dueDate: "", priority: "normal", status: "todo", handover: "", verification: "", subtasks: [],
};
const seoulDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short" });
const seoulTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
type Save = (action: () => Promise<void>, onSaved?: () => void) => Promise<void>;
type TaskFilter = "all" | "open" | "done";

function Options({ labels }: { labels: Record<string, string> }) {
  return <>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>;
}

function PersonField({ name, label, value }: { name: string; label: string; value: string }) {
  return <label>{label}<input name={name} list="project-staff" defaultValue={value} maxLength={60} placeholder="미배정" /></label>;
}

function ProjectForm({ project, busy, save, cancel }: {
  project?: Project; busy: boolean; save: (input: ProjectInput, version: number) => void; cancel: () => void;
}) {
  const [initial] = useState(() => project ?? { ...defaultProject, version: 0 });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save(Object.fromEntries(new FormData(event.currentTarget)) as ProjectInput, initial.version);
  };
  return (
    <form className="pj-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label className="pj-wide">프로젝트명<input name="title" required maxLength={200} defaultValue={initial.title} /></label>
        <PersonField name="owner" label="프로젝트 담당자" value={initial.owner} />
        <label>마감일<input name="dueDate" type="date" defaultValue={initial.dueDate} /></label>
        <label>프로젝트 상태<select name="status" defaultValue={initial.status}><Options labels={projectStatuses} /></select></label>
        {Object.entries(projectNotes).map(([key, label]) => (
          <label key={key} className="pj-wide">{label}<textarea name={key} maxLength={4000} rows={2} defaultValue={initial[key as keyof typeof projectNotes]} /></label>
        ))}
        <div className="pj-actions pj-wide">
          <button className="hb-primary-button" type="submit">프로젝트 저장</button>
          <button className="hb-secondary-button" type="button" onClick={cancel}>취소</button>
        </div>
      </fieldset>
    </form>
  );
}

function TaskForm({ task, busy, save, cancel }: {
  task?: ProjectTask; busy: boolean; save: (input: ProjectTaskInput, version: number) => void; cancel: () => void;
}) {
  const [initial] = useState(() => task ?? { ...defaultTask, version: 0 });
  const [subtasks, setSubtasks] = useState(initial.subtasks);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget)) as Omit<ProjectTaskInput, "subtasks">;
    save({ ...fields, status: fields.status ?? "todo", subtasks }, initial.version);
  };
  return (
    <form className="pj-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label className="pj-wide">업무 내용<input name="title" required maxLength={200} defaultValue={initial.title} /></label>
        <PersonField name="assignee" label="업무 담당자" value={initial.assignee} />
        <label>마감일<input name="dueDate" type="date" defaultValue={initial.dueDate} /></label>
        <label>우선순위<select name="priority" defaultValue={initial.priority}><Options labels={priorities} /></select></label>
        <label>진행 상태
          <select name="status" defaultValue={initial.status}>
            <option value="todo">미완료</option><option value="doing">진행 중</option>
            <option value="done" disabled={subtasks.some((item) => !item.done)}>완료</option>
          </select>
        </label>
        <label className="pj-wide">다음 담당자에게 인계할 내용<textarea name="handover" rows={2} maxLength={4000} defaultValue={initial.handover} /></label>
        <label className="pj-wide">확인 기준 및 점검 항목<textarea name="verification" rows={2} maxLength={4000} defaultValue={initial.verification} /></label>
        <div className="pj-wide pj-subtasks">
          {subtasks.map((item, index) => (
            <div className="pj-subtask-edit" key={item.id}>
              <input aria-label={`하위 업무 ${index + 1}`} required maxLength={200} value={item.title}
                onChange={(event) => setSubtasks(subtasks.map((part) => part.id === item.id ? { ...part, title: event.target.value } : part))} />
              <button type="button" onClick={() => setSubtasks(subtasks.filter((part) => part.id !== item.id))}>삭제</button>
            </div>
          ))}
          <button type="button" disabled={subtasks.length >= 50} onClick={() =>
            setSubtasks([...subtasks, { id: crypto.randomUUID(), title: "", done: false }])}>+ 하위 업무</button>
        </div>
        <div className="pj-actions pj-wide">
          <button className="hb-primary-button" type="submit">업무 저장</button>
          <button className="hb-secondary-button" type="button" onClick={cancel}>취소</button>
        </div>
      </fieldset>
    </form>
  );
}

function TaskCard({ task, projectId, updates, canEdit, busy, author, save, move, editing, setEditing, drag }: {
  task: ProjectTask; projectId: string; updates: ProjectTaskUpdate[]; canEdit: boolean; busy: boolean; author: string;
  save: Save; move: (offset: number) => void; editing: boolean; setEditing: (value: boolean) => void;
  drag: { start: () => void; end: () => void; drop: () => void } | null;
}) {
  const [comment, setComment] = useState("");
  const done = task.status === "done";
  const overdue = !done && task.dueDate && task.dueDate < seoulDate.format(new Date());
  const update = (input: ProjectTaskInput, version = task.version, onSaved?: () => void) =>
    save(() => api.updateProjectTask(projectId, task.id, { ...input, version, author }), onSaved);
  return (
    <article className="pj-task" data-done={done}
      onDragOver={drag ? (event) => event.preventDefault() : undefined}
      onDrop={drag ? (event) => { event.preventDefault(); drag.drop(); } : undefined}>
      <div className="pj-task-head">
        <input type="checkbox" aria-label={`${task.title} 완료`} checked={done}
          title={task.subtasks.length ? "하위 업무를 모두 체크하면 완료됩니다." : undefined}
          disabled={!canEdit || busy || editing || !!task.subtasks.length}
          onChange={() => void update({ ...task, status: done ? "todo" : "done" })} />
        <div className="pj-task-title">
          <h3>{task.title}</h3>
          <div className="pj-task-meta">
            <span>{task.assignee || "미배정"}</span><span>{task.dueDate || "마감일 없음"}</span>
            <span className={overdue ? "pj-alert" : ""}>{taskStatuses[task.status]}{overdue && " · 마감 초과"}</span>
            <span className={task.priority === "urgent" ? "pj-alert" : ""}>{priorities[task.priority]}</span>
          </div>
        </div>
        {canEdit && (
          <div className="pj-actions">
            {drag && <span className="pj-grip" draggable title="드래그하여 순서 변경"
              onDragStart={(event) => { event.dataTransfer.setData("text/plain", task.id); drag.start(); }}
              onDragEnd={drag.end}>⠿</span>}
            {drag && <><button type="button" aria-label="업무 위로" onClick={() => move(-1)}>↑</button>
              <button type="button" aria-label="업무 아래로" onClick={() => move(1)}>↓</button></>}
            <button type="button" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "수정 닫기" : "수정"}</button>
          </div>
        )}
      </div>
      {editing ? (
        <TaskForm task={task} busy={busy} cancel={() => setEditing(false)} save={(input, version) => void update(input, version, () => setEditing(false))} />
      ) : (
        <>
          {!!task.subtasks.length && (
            <ul className="pj-subtasks">
              {task.subtasks.map((item) => (
                <li key={item.id}><label>
                  <input type="checkbox" checked={item.done} disabled={!canEdit || busy}
                    onChange={() => void update({ ...task, subtasks: task.subtasks.map((part) =>
                      part.id === item.id ? { ...part, done: !part.done } : part) })} />
                  {item.title}
                </label></li>
              ))}
            </ul>
          )}
          {(task.handover || task.verification) && (
            <dl className="pj-notes">
              {task.handover && <div><dt>인수인계</dt><dd>{task.handover}</dd></div>}
              {task.verification && <div><dt>확인할 항목</dt><dd>{task.verification}</dd></div>}
            </dl>
          )}
          {task.completedAt && <p className="pj-muted">완료 기록 · {task.completedBy} · {seoulTime.format(new Date(task.completedAt))}</p>}
          <details className="pj-updates">
            <summary>진행 기록 및 사진 ({updates.length})</summary>
            <ul>
              {updates.map((entry) => (
                <li key={entry.id}>
                  <small>{entry.author} · {seoulTime.format(new Date(entry.createdAt))}</small>
                  {entry.photoName ? (
                    <a href={`/api/projects/${projectId}/photos/${entry.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/projects/${projectId}/photos/${entry.id}`} alt={entry.photoName} loading="lazy" />
                    </a>
                  ) : <p>{entry.kind === "completion" ? "업무 완료" : entry.body}</p>}
                </li>
              ))}
            </ul>
            {canEdit && (
              <form onSubmit={(event) => {
                event.preventDefault();
                if (comment.trim()) void save(() => api.commentOnProjectTask(projectId, task.id, author, comment), () => setComment(""));
              }}>
                <label>진행 메모<textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} maxLength={4000} /></label>
                <div className="pj-actions">
                  <button type="submit" disabled={busy || !comment.trim()}>메모 저장</button>
                  <label className="pj-attach">사진 첨부
                    <input type="file" aria-label="사진 첨부" disabled={busy} accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void save(async () => api.uploadProjectPhoto(projectId, task.id, author, await compressImageForUpload(file, 15 * 1024 * 1024)));
                      }} />
                  </label>
                </div>
              </form>
            )}
          </details>
        </>
      )}
      {canEdit && editing && <button className="pj-alert" type="button" disabled={busy} onClick={() => {
        if (window.confirm(`“${task.title}” 업무를 삭제할까요?`)) void save(() => api.deleteProjectTask(projectId, task.id), () => setEditing(false));
      }}>업무 삭제</button>}
    </article>
  );
}

function initialSelection() {
  const value = new URLSearchParams(window.location.search).get("id");
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

export function ProjectBoard({ canEdit, author, members }: { canEdit: boolean; author: string; members: TeamMemberDTO[] }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState(initialSelection);
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [roster, setRoster] = useState<readonly string[]>(HANDOVER_ALL_ACK_NAMES);
  const [projectForm, setProjectForm] = useState<"new" | "edit" | null>(null);
  const [taskForm, setTaskForm] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const requestSequence = useRef(0);
  const dragged = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const select = useCallback((id: string, historyMode: "push" | "replace" | "pop" = "push") => {
    requestSequence.current++;
    setProjectId(id);
    setDetail(null);
    setProjectForm(null);
    setTaskForm(null);
    setFilter("all");
    setAssignee("");
    setError("");
    setFeedback("");
    const url = id ? `/project?id=${encodeURIComponent(id)}` : "/project";
    if (historyMode === "push") window.history.pushState({ projectFromList: true }, "", url);
    if (historyMode === "replace") window.history.replaceState({}, "", url);
  }, []);

  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname === "/project") select(initialSelection(), "pop");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [select]);

  const refresh = useCallback(async (id: string) => {
    const sequence = ++requestSequence.current;
    const [list, current] = await Promise.all([api.listProjects(), id ? api.getProject(id).catch((cause: unknown) => {
      if (cause instanceof ApiClientError && cause.status === 404) return null;
      throw cause;
    }) : null]);
    if (!mounted.current || sequence !== requestSequence.current) return;
    setProjects(list);
    setDetail(current);
    if (id && !current) select("", "replace");
  }, [select]);

  useEffect(() => {
    const load = () => {
      if (saving.current || document.visibilityState === "hidden") return;
      void refresh(projectId).catch((cause: Error) => setError(cause.message));
    };
    void refresh(projectId).catch((cause: Error) => setError(cause.message));
    const timer = window.setInterval(load, 15_000);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [projectId, refresh]);

  useEffect(() => {
    void api.listHandoverAckRoster().then(({ names }) => setRoster(names)).catch(() => {});
  }, []);

  const save: Save = async (action, onSaved) => {
    if (saving.current) return;
    requestSequence.current++;
    saving.current = true;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await action();
      if (!mounted.current || initialSelection() !== projectId) return;
      try {
        await refresh(projectId);
      } catch {
        setError("변경사항은 저장됐습니다. 최신 내용을 보려면 새로고침해 주세요.");
      }
      onSaved?.();
      setFeedback("저장되었습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장에 실패했습니다.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const project = detail?.project;
  const visibleProjects = projects?.filter((item) => showAll || item.status === "active");
  const tasks = detail?.tasks ?? [];
  const done = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const names = [...new Set([...roster, ...members.map((member) => member.name), author].filter(Boolean))];
  const visible = tasks.filter((task) => (filter === "all" || (task.status === "done") === (filter === "done")) &&
    (!assignee || task.assignee === assignee));
  const canReorder = canEdit && !busy && !taskForm && filter === "all" && !assignee;

  const reorder = (taskId: string, index: number) => {
    if (!project || index < 0 || index >= tasks.length || !canReorder) return;
    const before = tasks.map((task) => task.id);
    const from = before.indexOf(taskId);
    if (from < 0 || from === index) return;
    const after = [...before];
    after.splice(from, 1);
    after.splice(index, 0, taskId);
    void save(() => api.reorderProjectTasks(project.id, before, after));
  };

  return (
    <div className="hb-page pj-page">
      <main className="hb-main">
        <header className="hb-page-heading">
          <h1>프로젝트</h1>
          {canEdit && !projectId && <button type="button" className="hb-primary-button" disabled={busy}
            onClick={() => setProjectForm(projectForm === "new" ? null : "new")}>+ 프로젝트 만들기</button>}
        </header>
        <datalist id="project-staff">{names.map((name) => <option key={name} value={name} />)}</datalist>
        {error && <p className="pj-error" role="alert">{error} <button type="button" disabled={busy}
          onClick={() => { setError(""); void refresh(projectId).catch((cause: Error) => setError(cause.message)); }}>새로고침</button></p>}
        <span className="pj-status" role="status">{busy ? "저장 중…" : feedback}</span>
        {projectId && (
          <nav className="pj-project-nav" aria-label="프로젝트 탐색">
            <button type="button" disabled={busy} onClick={() => {
              if (window.history.state?.projectFromList) window.history.back();
              else select("", "replace");
            }}>← 프로젝트 목록</button>
            {project && <button type="button" onClick={() => {
              void navigator.clipboard.writeText(window.location.href).then(() => setFeedback("공유 링크를 복사했습니다."))
                .catch(() => setError("링크를 복사하지 못했습니다. 주소 표시줄에서 복사해 주세요."));
            }}>공유 링크 복사</button>}
          </nav>
        )}
        {projectForm === "new" && (
          <section className="pj-panel">
            <h2>새 프로젝트</h2>
            <ProjectForm busy={busy} cancel={() => setProjectForm(null)} save={(input) => {
              let createdId = "";
              void save(async () => { createdId = (await api.createProject(input)).id; }, () => select(createdId));
            }} />
          </section>
        )}
        {!projectId && visibleProjects && (
          <section aria-labelledby="project-list-heading">
            <div className="pj-list-heading">
              <h2 id="project-list-heading">{showAll ? "전체 프로젝트" : "진행 중인 프로젝트"}</h2>
              {projects?.some((item) => item.status !== "active") && (
                <button type="button" aria-pressed={showAll} onClick={() => setShowAll(!showAll)}>
                  {showAll ? "진행 중만 보기" : "전체 프로젝트 보기"}
                </button>
              )}
            </div>
            {visibleProjects.length ? (
              <ul className="pj-project-grid">
                {visibleProjects.map((item) => (
                  <li key={item.id}>
                    <a className="pj-project-card" href={`/project?id=${item.id}`} onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      if (!saving.current) select(item.id);
                    }}>
                      <span className="pj-chip">{projectStatuses[item.status]}</span>
                      <h3>{item.title}</h3>
                      <div className="pj-task-meta">
                        <span>총괄 · {item.owner || "미배정"}</span>
                        {item.dueDate && <span>마감 · {item.dueDate}</span>}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="pj-muted">{showAll ? "등록된 프로젝트가 없습니다." : "진행 중인 프로젝트가 없습니다."}</p>}
          </section>
        )}
        {project && (
          <>
            <section className="pj-panel">
              <div className="pj-section-head">
                <div>
                  <span className="pj-chip">{projectStatuses[project.status]}</span>
                  <h2>{project.title}</h2>
                  <div className="pj-task-meta"><span>총괄 · {project.owner || "미배정"}</span>
                    {project.dueDate && <span>마감 · {project.dueDate}</span>}</div>
                </div>
                {canEdit && <button type="button" disabled={busy} onClick={() =>
                  setProjectForm(projectForm === "edit" ? null : "edit")}>프로젝트 수정</button>}
              </div>
              {projectForm === "edit" ? (
                <>
                  <ProjectForm project={project} busy={busy} cancel={() => setProjectForm(null)} save={(input, version) =>
                    void save(() => api.updateProject(project.id, { ...input, version }), () => setProjectForm(null))} />
                  <button className="pj-alert" type="button" disabled={busy} onClick={() => {
                    if (window.confirm(`“${project.title}” 프로젝트와 모든 업무를 삭제할까요?`)) {
                      void save(() => api.deleteProject(project.id));
                    }
                  }}>프로젝트 삭제</button>
                </>
              ) : (
                <dl className="pj-notes pj-project-notes">
                  {Object.entries(projectNotes).map(([key, label]) => (
                    <div key={key}><dt>{label}</dt><dd>{project[key as keyof typeof projectNotes] || "—"}</dd></div>
                  ))}
                </dl>
              )}
              <div className="pj-progress">
                <div><strong>업무 진행률</strong><strong>{progress}%</strong></div>
                <progress max={100} value={progress} aria-label="업무 진행률" />
                <p>전체 {tasks.length} · 완료 {done} · 미완료 {tasks.length - done}</p>
              </div>
            </section>
            <section className="pj-panel pj-checklist">
              <div className="pj-section-head">
                <h2>업무 체크리스트</h2>
                {canEdit && <button type="button" className="hb-primary-button" disabled={busy} onClick={() =>
                  setTaskForm(taskForm === "new" ? null : "new")}>+ 업무 추가</button>}
              </div>
              {taskForm === "new" && (
                <TaskForm busy={busy} cancel={() => setTaskForm(null)} save={(input) =>
                  void save(() => api.createProjectTask(project.id, { ...input, author }), () => { setTaskForm(null); setFilter("all"); setAssignee(""); })} />
              )}
              <div className="pj-filters">
                <div className="pj-actions" aria-label="업무 상태 필터">
                  {([["all", "전체"], ["open", "미완료"], ["done", "완료"]] as const).map(([key, label]) => (
                    <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
                  ))}
                </div>
                <label>담당자
                  <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                    <option value="">모두</option>
                    {[...new Set(tasks.map((task) => task.assignee).filter(Boolean))].sort().map((name) => <option key={name}>{name}</option>)}
                  </select>
                </label>
              </div>
              {visible.length === 0 && <p className="pj-muted">{tasks.length ? "조건에 맞는 업무가 없습니다." : "등록된 업무가 없습니다."}</p>}
              {visible.map((task, index) => (
                <TaskCard key={task.id} task={task} projectId={project.id}
                  updates={detail.updates.filter((entry) => entry.taskId === task.id)}
                  author={author} canEdit={canEdit} busy={busy} save={save}
                  editing={taskForm === task.id} setEditing={(open) => setTaskForm(open ? task.id : null)}
                  move={(offset) => reorder(task.id, index + offset)}
                  drag={canReorder ? {
                    start: () => { dragged.current = task.id; },
                    end: () => { dragged.current = null; },
                    drop: () => { if (dragged.current) reorder(dragged.current, index); dragged.current = null; },
                  } : null} />
              ))}
            </section>
          </>
        )}
        {!error && !project && (projectId || !projects) && (
          <p className="pj-muted">프로젝트를 불러오는 중…</p>
        )}
      </main>
    </div>
  );
}
