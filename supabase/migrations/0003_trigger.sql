-- 0003_trigger.sql
-- Auto-provision a tenants row when a new auth.users row is inserted.
-- security definer is required so this trigger can write to public.tenants
-- regardless of the calling session's RLS context (the new user has none
-- at the moment auth.users is inserted).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenants (id, name, agent_persona, agent_system_prompt)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'My Coach'),
    'A knowledgeable assistant.',
    'You are a helpful coach. Answer using only the provided context. ' ||
    'Cite sources by document title in brackets like [Doc Title]. ' ||
    'If the context does not contain what is needed, say so explicitly ' ||
    'and suggest a related topic from the knowledge base. Do not invent facts.'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
