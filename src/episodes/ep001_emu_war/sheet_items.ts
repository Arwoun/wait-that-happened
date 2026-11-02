import { Pen, bodyFront, digger, farmer, MAJOR } from "./toon";
import { emuSide, emuFront, lewisGun, pigeon, kangaroo } from "./creatures";
export const ITEMS: [string, (p: Pen) => void][] = [
  ["emu walk", (p) => emuSide(p, { pose: "walk", phase: 0.25 })], ["emu run", (p) => emuSide(p, { pose: "run", phase: 0.1, expr: "alarm" })],
  ["emu peck", (p) => emuSide(p, { pose: "peck" })], ["emu front", (p) => emuFront(p, { expr: "smug" })],
  ["gun", (p) => lewisGun(p, { fire: 0.6 })], ["pigeon", (p) => pigeon(p)], ["kangaroo", (p) => kangaroo(p)],
  ["digger", (p) => bodyFront(p, digger(0), { mode: "stand", expr: "stern" })], ["major", (p) => bodyFront(p, MAJOR, { mode: "stand", expr: "stern" })],
  ["farmer", (p) => bodyFront(p, farmer(0), { mode: "stand" })],
];
