-- handle_new_user es una función de TRIGGER: Postgres la ejecuta al
-- insertarse una fila en auth.users. Nunca debe poder invocarse
-- directamente, pero por defecto quedaba expuesta en la API REST como
-- /rest/v1/rpc/handle_new_user para los roles anon y authenticated.
--
-- Lo detectó el linter de Supabase al aplicar el esquema en un proyecto
-- real. Revoqué el EXECUTE de las funciones RPC, pero se me pasó esta
-- justo por ser de trigger.
revoke all on function public.handle_new_user() from public, anon, authenticated;
