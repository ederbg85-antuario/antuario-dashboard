-- Additive only. No client commitments, assignments or public visibility are inferred.
alter table public.tasks
  add column task_areas text[] not null default '{}',
  add column task_tags text[] not null default '{}',
  add column due_date_kind text,
  add column validator_member_id uuid references public.team_members(id),
  add column client_dependency text,
  add column client_dependency_owner text,
  add column client_dependency_impact text;
alter table public.tasks add constraint tasks_classification_check check (cardinality(task_areas)<=6 and task_areas <@ array['production','marketing','sales','finance','accounting','people']::text[] and array_position(task_areas,null) is null and cardinality(task_tags)<=8 and array_position(task_tags,null) is null);
comment on column public.tasks.task_areas is 'Explicit areas. First area is primary for unique attribution. Empty means unclassified, including all historical tasks.';
comment on column public.tasks.task_tags is 'Explicit normalized tags, no historical inference.';
alter table public.tasks add constraint tasks_due_date_kind_check
  check (due_date_kind is null or (due_date is not null and due_date_kind in ('proposed','confirmed','follow_up')));
alter table public.tasks add constraint tasks_client_dependency_length_check
  check (length(client_dependency)<=2000 and length(client_dependency_owner)<=500 and length(client_dependency_impact)<=2000);
alter table public.task_checklist add column client_visible boolean not null default false;
comment on column public.tasks.due_date_kind is 'Explicit intent of due_date. NULL means unclassified; never inferred from historical notes.';
comment on column public.task_checklist.client_visible is 'Approved for a client checklist projection. Does not publish or notify. Historical checklist stays internal.';

-- Validate only a new reviewer assignment. Preserve existing reviewers on unrelated updates.
create or replace function private.validate_task_reviewer() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from unnest(new.task_tags) tag where length(tag) not between 1 and 40 or tag<>lower(btrim(tag)))
 or cardinality(new.task_tags)<>(select count(distinct tag) from unnest(new.task_tags) tag)
 or cardinality(new.task_areas)<>(select count(distinct area) from unnest(new.task_areas) area) then raise exception 'Invalid task classification' using errcode='23514'; end if;
 if new.validator_member_id is not null and
    (tg_op='INSERT' or new.validator_member_id is distinct from old.validator_member_id or new.project_id is distinct from old.project_id) then
  if not exists(
   select 1 from public.team_members m join public.projects p on p.id=new.project_id and p.organization_id=new.organization_id
   where m.id=new.validator_member_id and m.organization_id=new.organization_id
    and m.status<>'paused' and 'production'=any(m.areas)
    and (cardinality(m.client_ids)=0 or p.client_id=any(m.client_ids))
  ) then raise exception 'Reviewer outside task scope' using errcode='23514'; end if;
 end if;
 return new;
end $$;
revoke all on function private.validate_task_reviewer() from public;
create trigger validate_task_reviewer before insert or update on public.tasks for each row execute function private.validate_task_reviewer();
-- All existing task/checklist RLS, audit, update timestamp and validation triggers stay in force.
