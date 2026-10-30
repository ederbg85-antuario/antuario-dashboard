import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { people } from "./delivery-db-fixture";

/** A PostgREST-shaped adapter over real local Postgres. RLS/RPCs are not mocked. */
export function deliveryRouteContext(pg: PGlite) {
  const files = new Map<string, Blob>(),
    mutations: string[] = [];
  const db = {
    from(table: string) {
      const identifier = (v: string) => {
        if (!/^[a-z_][a-z_0-9]*$/.test(v))
          throw new Error("Invalid fixture identifier");
        return '"' + v + '"';
      };
      const params: unknown[] = [],
        filters: string[] = [],
        orders: string[] = [];
      let columns = "*",
        count = false,
        head = false,
        start = 0,
        end = 999,
        single = false;
      const query = {
        select: (v = "*", opts?: { count?: string; head?: boolean }) => {
          columns = v === "*" ? "*" : v.split(",").map(identifier).join(",");
          count = !!opts?.count;
          head = !!opts?.head;
          return query;
        },
        eq: (k: string, v: unknown) => {
          params.push(v);
          filters.push(`${identifier(k)}=$${params.length}`);
          return query;
        },
        lt: (k: string, v: unknown) => {
          params.push(v);
          filters.push(`${identifier(k)}<$${params.length}`);
          return query;
        },
        or: (expression: string) => {
          const match = expression.match(
            /^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/,
          );
          if (!match) throw new Error("Unsupported fixture cursor");
          params.push(match[1], match[2], match[3]);
          filters.push(
            `(created_at<$${params.length - 2} or (created_at=$${params.length - 1} and id<$${params.length}))`,
          );
          return query;
        },
        order: (k: string, opts?: { ascending?: boolean }) => {
          orders.push(
            `${identifier(k)} ${opts?.ascending === false ? "desc" : "asc"}`,
          );
          return query;
        },
        range: (a: number, b: number) => {
          start = a;
          end = b;
          return query;
        },
        limit: (n: number) => {
          end = start + n - 1;
          return query;
        },
        maybeSingle: () => {
          single = true;
          return query;
        },
        async then(resolve: (v: unknown) => unknown) {
          try {
            const base = `from public.${identifier(table)}${filters.length ? " where " + filters.join(" and ") : ""}`;
            const total = count
              ? Number(
                  (
                    await pg.query<{ n: string }>(
                      `select count(*) n ${base}`,
                      params,
                    )
                  ).rows[0].n,
                )
              : null;
            const result = head
              ? []
              : (
                  await pg.query(
                    `select ${columns} ${base}${orders.length ? " order by " + orders.join(",") : ""} limit ${Math.max(0, end - start + 1)} offset ${start}`,
                    params,
                  )
                ).rows;
            return resolve({
              data: head ? null : single ? (result[0] ?? null) : result,
              count: total,
              error: null,
            });
          } catch (error) {
            return resolve({ data: null, count: null, error });
          }
        },
      };
      return query;
    },
    async rpc(name: string, parameters: Record<string, unknown>) {
      const allowed: Record<string, string[]> = {
        submit_task_delivery: [
          "p_org",
          "p_task",
          "p_title",
          "p_summary",
          "p_artifacts",
          "p_request_key",
        ],
        respond_task_delivery: [
          "p_org",
          "p_delivery",
          "p_action",
          "p_body",
          "p_expected_status",
          "p_request_key",
        ],
      };
      if (!allowed[name]) throw new Error("Unknown fixture RPC");
      try {
        const values = allowed[name].map((k) =>
          k === "p_artifacts" ? JSON.stringify(parameters[k]) : parameters[k],
        );
        const result = await pg.query<{ id: string }>(
          `select public.${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) id`,
          values,
        );
        mutations.push(name);
        return { data: result.rows[0].id, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(
            name: string,
            bytes: Uint8Array,
            opts: { contentType: string },
          ) {
            try {
              await pg.query(
                "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3::jsonb)",
                [
                  bucket,
                  name,
                  JSON.stringify({
                    mimetype: opts.contentType,
                    size: bytes.length,
                  }),
                ],
              );
              files.set(
                bucket + "/" + name,
                new Blob([Uint8Array.from(bytes)], { type: opts.contentType }),
              );
              return { error: null };
            } catch (error) {
              return {
                error: {
                  ...(error as object),
                  statusCode:
                    (error as { code: string }).code === "23505"
                      ? "409"
                      : "403",
                },
              };
            }
          },
          async download(name: string) {
            const result = await pg.query(
              "select id from storage.objects where bucket_id=$1 and name=$2",
              [bucket, name],
            );
            return result.rows.length
              ? { data: files.get(bucket + "/" + name), error: null }
              : { data: null, error: { code: "42501" } };
          },
        };
      },
    },
  };
  return {
    context: {
      db,
      orgId: 1,
      user: { id: people.owner },
      role: "owner",
      seat: null,
      can: () => true,
    },
    files,
    mutations,
  };
}
export async function loadDeliveryRoute<T>(
  filename: string,
  getContext: () => unknown,
): Promise<T> {
  const result = await build({
    entryPoints: [path.resolve(filename)],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [
      {
        name: "isolated-delivery-workspace",
        setup(b) {
          b.onResolve(
            { filter: /^(?:@\/lib\/workspace|\.\/workspace)$/ },
            () => ({ path: "workspace", namespace: "fixture" }),
          );
          b.onResolve({ filter: /^server-only$/ }, () => ({
            path: "server-only",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            contents:
              args.path === "server-only"
                ? ""
                : "export async function workspace(){return globalThis.__deliveryContext()}",
            loader: "js",
          }));
        },
      },
    ],
  });
  const compiledModule = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    "globalThis",
    result.outputFiles[0].text,
  )(createRequire(import.meta.url), compiledModule, compiledModule.exports, {
    __deliveryContext: getContext,
  });
  return compiledModule.exports as T;
}
