import { describe, expect, it } from "vitest";
import { isBritishVariant, isDuplicateForm, parseLemmaFile, pickLemma, preferForm } from "../../corpus/lemmatize.js";

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

  it("exige más dominio a -ed que a -ing: un pasado narrativo no es un adjetivo", () => {
    const narrative = new Map([["happened", 375703], ["happen", 186041], ["scared", 107906], ["scare", 23192]]);
    expect([preferForm("happened", "happen", narrative), preferForm("scared", "scare", narrative)])
      .toEqual(["happen", "scared"]);
  });

  it("vuelve al lema cuando la forma no domina", () => {
    expect([preferForm("going", "go", counts), preferForm("used", "use", counts)]).toEqual(["go", "use"]);
  });

  it("no toca formas que no terminan en -ing/-ed", () => {
    expect(preferForm("eyes", "eye", new Map([["eyes", 9], ["eye", 1]]))).toBe("eye");
  });
});

const idx2 = parseLemmaFile(["come\tcoming", "coming\tcomings", "good\tbetter", "better\tbettered",
  "meet\tmeeting", "meeting\tmeetings", "grunt\tgrunting", "kill\tkilling", "killing\tkillings", "numb\tnumber", "number\tnumbers"].join("\n"));

describe("isDuplicateForm", () => {
  const accepted = new Set(["come", "good", "meet", "grunt", "numb"]);
  const keep = new Set(["better", "meeting"]);
  const counts = new Map([["coming", 389949], ["come", 2203919], ["grunting", 900], ["grunt", 1200],
    ["number", 180000], ["numb", 4000]]);
  const dup = (w: string) => isDuplicateForm(w, idx2, accepted, keep, counts);

  it("descarta la forma cuyo lema padre ya está en la lista", () => {
    expect([dup("coming"), dup("grunting")]).toEqual([true, true]);
  });

  it("conserva las formas curadas aunque su padre esté en la lista", () => {
    expect([dup("better"), dup("meeting")]).toEqual([false, false]);
  });

  it("no descarta una palabra más frecuente que su supuesto padre", () => {
    expect(dup("number")).toBe(false);
  });

  it("no toca palabras cuyo padre no está en la lista", () => {
    expect(dup("killing")).toBe(false);
  });
});

describe("isBritishVariant", () => {
  const candidates = new Set(["color", "realize", "honor"]);

  it("detecta -our/-ise cuando la forma americana está en la lista", () => {
    expect([isBritishVariant("colour", candidates), isBritishVariant("realise", candidates)]).toEqual([true, true]);
  });

  it("no toca palabras que solo se escriben así", () => {
    expect([isBritishVariant("four", candidates), isBritishVariant("promise", candidates), isBritishVariant("hour", candidates)])
      .toEqual([false, false, false]);
  });

  it("detecta -re, -our- interno y las formas irregulares", () => {
    const us = new Set(["center", "theater", "favorite", "gray", "mom"]);
    expect(["centre", "theatre", "favourite", "grey", "mum"].map((w) => isBritishVariant(w, us)))
      .toEqual([true, true, true, true, true]);
  });

  it("no toca here ni court aunque exista her o cort", () => {
    const tricky = new Set(["her", "cort"]);
    expect([isBritishVariant("here", tricky), isBritishVariant("court", tricky)]).toEqual([false, false]);
  });

  it("exige que la forma americana sea al menos igual de frecuente", () => {
    const counts = new Map([["colour", 11281], ["color", 32837], ["tour", 9000], ["tor", 50]]);
    expect([isBritishVariant("colour", new Set(["color"]), counts), isBritishVariant("tour", new Set(["tor"]), counts)])
      .toEqual([true, false]);
  });

  it("no confunde -re cuando la forma -er no está en la lista", () => {
    expect([isBritishVariant("fire", candidates), isBritishVariant("sure", candidates)]).toEqual([false, false]);
  });
});
