import { describe, expect, it } from "vitest";
import { parseLemmaFile, pickLemma, preferForm } from "../../corpus/lemmatize.js";

const FILE = [
  "﻿go\tgoing", "go\twent", "eye\teyes", "lie\tlying", "use\tused",
  "do\tdoing", "doing\tdoings", "build\tbuilding", "building\tbuildings",
  "good\tbetter", "well\tbetter", "better\tbettered", "child\tchildren",
].join("\r\n");

const idx = parseLemmaFile(FILE);
const excluded = (w: string) => ["do", "be", "the"].includes(w);
const pick = (w: string) => pickLemma(w, idx, excluded);

describe("parseLemmaFile", () => {
  it("quita el BOM y los CRLF", () => {
    expect(idx.formToLemmas.get("going")).toEqual(["go"]);
    expect(idx.lemmas.has("go")).toBe(true);
  });

  it("guarda todos los lemas de una forma ambigua", () => {
    expect(idx.formToLemmas.get("better")).toEqual(["good", "well"]);
  });
});

describe("pickLemma", () => {
  it("lleva las inflexiones a su lema", () => {
    expect([pick("going"), pick("went"), pick("eyes"), pick("lying"), pick("used"), pick("children")])
      .toEqual(["go", "go", "eye", "lie", "use", "child"]);
  });

  it("deja intactas las palabras que no aparecen como inflexión", () => {
    expect([pick("need"), pick("thing"), pick("really"), pick("actually"), pick("news")])
      .toEqual(["need", "thing", "really", "actually", "news"]);
  });

  it("conserva la forma que además es lema propio", () => {
    expect([pick("building"), pick("better")]).toEqual(["building", "better"]);
  });

  it("descarta la inflexión de una palabra excluida aunque sea lema", () => {
    expect(pick("doing")).toBeNull();
  });
});

describe("preferForm", () => {
  const counts = new Map([
    ["interesting", 65082], ["interest", 39252], ["tired", 76540], ["tire", 8199],
    ["going", 1520767], ["go", 2738504], ["used", 263566], ["use", 256079],
  ]);

  it("conserva el adjetivo en -ing/-ed cuando domina sobre su verbo", () => {
    expect([preferForm("interesting", "interest", counts), preferForm("tired", "tire", counts)])
      .toEqual(["interesting", "tired"]);
  });

  it("vuelve al lema cuando la forma no domina", () => {
    expect([preferForm("going", "go", counts), preferForm("used", "use", counts)]).toEqual(["go", "use"]);
  });

  it("no toca formas que no terminan en -ing/-ed", () => {
    expect(preferForm("eyes", "eye", new Map([["eyes", 9], ["eye", 1]]))).toBe("eye");
  });
});
