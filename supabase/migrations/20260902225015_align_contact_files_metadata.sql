-- Alinea la tabla con el módulo de adjuntos de Contactos.
alter table public.contact_files
  add column if not exists file_size bigint;

-- La ruta privada en Storage se conserva en file_path; file_url es legado.
alter table public.contact_files
  alter column file_url drop not null;
