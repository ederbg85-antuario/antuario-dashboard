"use client";
import Link from "next/link";
import {useRef,useState} from "react";
import TaskDialog from "@/components/operations/TaskDialog";
import type { AccountBundle } from "@/lib/client-accounts-types";
import { number, shortDate, Status, Surface } from "./AccountPrimitives";

const complete = (value: string) =>
  ["done", "completed", "delivered", "cancelled"].includes(value);
const state = (value: string) =>
  (
    ({
      todo: "pending",
      done: "delivered",
      completed: "delivered",
      doing: "in_progress",
    }) as Record<string, string>
  )[value] ?? value;

export function AccountExistingWork({
  bundle,
  compact = false,
  onChanged,
}: {
  bundle: AccountBundle;
  compact?: boolean;
  onChanged?:()=>void;
}) {
  const dirty=useRef(false);
  const [taskId,setTaskId]=useState<string|null>(null);
  const work = bundle.existing_work;
  if (!work || (!work.tasks.length && !work.work_items.length)) return null;
  const tasks = [...work.tasks].sort(
    (a, b) => Number(complete(a.status)) - Number(complete(b.status)),
  );
  const checklist = tasks.flatMap((task) => task.checklist);
  const done = checklist.filter((item) => item.done).length;
  return (
    <Surface
      title={
        compact ? "Siguientes pasos de la cuenta" : "Plan operativo existente"
      }
      description={`${number(tasks.filter((task) => !complete(task.status)).length)} tareas abiertas · ${number(done)}/${number(checklist.length)} pasos verificados`}
      source="Tareas y checklist originales de Producción. Se mantienen sus responsables, estados y evidencias; no se crean copias de trabajo."
    >
      <div className="account-existing-work">
        {(compact ? tasks.slice(0, 3) : tasks).map((task) => (
          <article key={task.id}>
            <div className="account-existing-work-heading">
              <h3><button className="op-text-button" onClick={()=>setTaskId(task.id)} aria-label={`Abrir tarea ${task.title}`}>{task.title}</button></h3>
              <Status value={state(task.status)} />
            </div>
            {!compact && (
              <details>
                <summary>
                  {task.checklist.filter((item) => item.done).length}/
                  {task.checklist.length} pasos · criterios y evidencia
                </summary>
                {(task.next_action || task.description) && <p>{task.next_action || task.description}</p>}
                {task.acceptance && <p>{task.acceptance}</p>}
                <p>Validador: {bundle.assignable_members?.find(member=>member.id===task.validator_member_id)?.name??'Por asignar'}</p>
                {task.client_dependency&&<p>Dependencia del cliente: {task.client_dependency}<br/>Responsable externo: {task.client_dependency_owner||'Por confirmar'}<br/>Impacto: {task.client_dependency_impact||'Por confirmar'}</p>}
                {[true,false].map(visible=><div key={String(visible)}><h4>{visible?'Checklist para compartir con cliente':'Checklist interno'}</h4><ul>{task.checklist.filter(item=>(item.client_visible===true)===visible).map(item=><li key={item.id}><span aria-hidden="true">{item.done?'✓':'○'}</span> {item.title}</li>)}</ul></div>)}
                {task.deliverable_url &&
                  /^https:\/\//.test(task.deliverable_url) && (
                    <a
                      href={task.deliverable_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver evidencia ↗
                    </a>
                  )}
              </details>
            )}
            <small>
              {bundle.assignable_members?.find(
                (member) => member.id === task.assignee_member_id,
              )?.name ?? "Responsable en Producción"}
              {task.due_date ? ` · ${shortDate(task.due_date)}` : " · Sin fecha"}
              {task.priority&&task.priority<=2?` · P${task.priority}`:''}
            </small>
          </article>
        ))}
        {!compact && work.work_items.length > 0 && (
          <details>
            <summary>
              Coordinación del equipo · {work.work_items.length} encargos
            </summary>
            {work.work_items.map((item) => (
              <article key={item.id}>
                <div className="account-existing-work-heading">
                  <h3>{item.title}</h3>
                  <Status value={state(item.status)} />
                </div>
                <p>{item.body}</p>
                {item.evidence && <p>{item.evidence}</p>}
              </article>
            ))}
          </details>
        )}
      </div>
      <div className="account-existing-links">
        <Link className="account-action is-soft" href="/produccion">
          Operar en Producción ↗
        </Link>
        <Link className="account-action is-soft" href="/equipo/trabajo">
          Coordinación del equipo ↗
        </Link>
      </div>
      {taskId&&bundle.data_mode==='live'&&<TaskDialog key={taskId} taskId={taskId} accountId={bundle.account.id} onSaved={()=>{dirty.current=true}} close={()=>{setTaskId(null);if(dirty.current){dirty.current=false;onChanged?.()}}}/>}
      {!!work.coverage.errors.length && (
        <p className="account-source">
          La consulta operativa está incompleta; se conserva solo la información
          disponible.
        </p>
      )}
    </Surface>
  );
}
