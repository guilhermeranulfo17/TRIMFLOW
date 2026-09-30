-- Etapa 2 · Mantém usuarios.email igual ao e-mail do Auth quando ele muda.

create or replace function public.sincronizar_email_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    update public.usuarios set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sincronizar_email_usuario() from public, anon, authenticated;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.sincronizar_email_usuario();
