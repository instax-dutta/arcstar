import { describe, expect, it } from "vitest";
import { createInMemoryRepositories } from "./inMemory.js";
import { createPostgresRepositories } from "./postgresFactories.js";
import type { SqlClient } from "./postgres.js";

const sql: SqlClient = {
  async query<T>() {
    return { rows: [] as T[] };
  },
};

describe("repository factories", () => {
  it("creates both in-memory and postgres repository sets", () => {
    expect(Object.keys(createInMemoryRepositories())).toEqual(["sources", "entities", "claims", "edges", "assessments"]);
    expect(Object.keys(createPostgresRepositories(sql))).toEqual(["sources", "entities", "claims", "edges", "assessments"]);
  });
});
