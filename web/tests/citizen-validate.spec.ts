import { expect, test } from "@playwright/test";
import { validate } from "../src/lib/citizen";

const file = (type: string, size = 1000) => ({ type, size }) as File;
const ok = { file: file("image/jpeg"), takenOn: "2026-05-01", caption: "Foam at the weir", consent: true, website: "" };
const today = new Date("2026-11-23T00:00:00Z");

test("a complete draft has no errors", () => expect(validate(ok, today)).toEqual({}));
test("each rule rejects bad input", () => {
  expect(validate({ ...ok, file: null }, today).file).toBeTruthy();
  expect(validate({ ...ok, file: file("image/gif") }, today).file).toBeTruthy();
  expect(validate({ ...ok, takenOn: "2027-01-01" }, today).takenOn).toBeTruthy();
  expect(validate({ ...ok, takenOn: "2015-12-31" }, today).takenOn).toBeTruthy();
  expect(validate({ ...ok, takenOn: "2026-02-31" }, today).takenOn).toBeTruthy();
  expect(validate({ ...ok, caption: "hi" }, today).caption).toBeTruthy();
  expect(validate({ ...ok, caption: "x".repeat(281) }, today).caption).toBeTruthy();
  expect(validate({ ...ok, consent: false }, today).consent).toBeTruthy();
});
