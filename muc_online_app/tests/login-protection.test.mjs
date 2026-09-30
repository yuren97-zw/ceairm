import assert from "node:assert/strict";
import test from "node:test";
import { createLoginProtection, loginAddress } from "../login-protection.mjs";
import { postgresConnectionOptions } from "../postgres-connection.mjs";

test("login attempts are limited by account and address, then recover", () => {
  let time = 0;
  const guard = createLoginProtection({ clock: () => time });
  for (let index = 0; index < 5; index++) assert.equal(guard.failure("Test", "192.0.2.1").allowed, true);
  assert.equal(guard.failure("test", "192.0.2.2").allowed, false);
  assert.equal(guard.check("TEST", "192.0.2.3").retryAfter, 300);
  assert.equal(guard.check("different", "192.0.2.3").allowed, true);
  time += 300001;
  assert.equal(guard.check("test", "192.0.2.3").allowed, true);
  guard.success("test");
  assert.equal(guard.check("test", "192.0.2.3").allowed, true);
});

test("a trusted local proxy may supply the client address, but direct clients cannot", () => {
  const req = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": "192.0.2.4" } };
  assert.equal(loginAddress(req), "127.0.0.1");
  assert.equal(loginAddress(req, { trustLocalProxy: true }), "192.0.2.4");
  req.socket.remoteAddress = "192.0.2.5";
  assert.equal(loginAddress(req, { trustLocalProxy: true }), "192.0.2.5");
});

test("PostgreSQL permits plaintext only on loopback and verifies remote TLS", () => {
  assert.equal(postgresConnectionOptions("postgresql://user:pass@127.0.0.1:5432/db", { PGSSLMODE: "disable" }).ssl, false);
  assert.throws(() => postgresConnectionOptions("postgresql://user:pass@db.example:5432/db", { PGSSLMODE: "disable" }), /远程 PostgreSQL/);
  assert.deepEqual(postgresConnectionOptions("postgresql://user:pass@db.example:5432/db", {}).ssl,
    { rejectUnauthorized: true, servername: "db.example" });
  assert.throws(() => postgresConnectionOptions("postgresql://user:pass@db.example:5432/db?sslmode=require", {}), /不要在 DATABASE_URL/);
  assert.throws(() => postgresConnectionOptions("postgresql://user:pass@db.example:5432/db", { PGSSLMODE: "require" }), /仅支持/);
});
