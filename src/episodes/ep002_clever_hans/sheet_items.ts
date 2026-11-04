import { Pen, bodyFront, bodySide, OSTEN, PFUNGST, expert, berliner, SCIENTIST, HANDLER, FRIEND_A, FRIEND_B } from "./toon";
import { horseSide, horseFront, blackboard, dogSide, suitcases, computer } from "./creatures";
export const ITEMS: [string, (p: Pen) => void][] = [
  ["hans", (p) => horseSide(p, {})], ["hans tap", (p) => horseSide(p, { tap: 1, expr: "focus" })], ["hans blind", (p) => horseSide(p, { blinders: true, expr: "dazed" })],
  ["hans front", (p) => horseFront(p, { expr: "proud" })], ["hans wink", (p) => horseFront(p, { expr: "wink" })], ["hans walk", (p) => horseSide(p, { walk: 0.3, headDown: 0.3 })],
  ["osten", (p) => bodyFront(p, OSTEN, { mode: "stand", expr: "stern", prop: "pointer" })], ["osten crossed", (p) => bodyFront(p, OSTEN, { mode: "stand", expr: "stern", prop: "crossed" })],
  ["osten side", (p) => bodySide(p, OSTEN, { mode: "stand", expr: "neutral" })], ["pfungst", (p) => bodyFront(p, PFUNGST, { mode: "stand", expr: "nervous", prop: "notebook" })],
  ["pfungst side", (p) => bodySide(p, PFUNGST, { mode: "stand", expr: "neutral" })], ["paper", (p) => bodyFront(p, expert(9), { mode: "stand", expr: "smile", prop: "paper" })],
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`exp${i}`, (p: Pen) => bodyFront(p, expert(i), { mode: "stand", expr: i % 2 ? "grin" : "stern", prop: i === 2 ? "clipboard" : null })] as [string, (p: Pen) => void]),
  ["crowd1", (p) => bodyFront(p, berliner(1), { mode: "stand", expr: "grin" })], ["crowd4", (p) => bodyFront(p, berliner(4), { mode: "stand", expr: "shock" })],
  ["coin", (p) => bodyFront(p, berliner(0), { mode: "stand", expr: "smile", prop: "coin" })],
  ["board sum", (p) => blackboard(p, "sum", 3)], ["board frac", (p) => blackboard(p, "frac")], ["board clock", (p) => blackboard(p, "clock")], ["board name", (p) => blackboard(p, "name")],
  ["dog", (p) => dogSide(p, { sniff: 0.8 })], ["suitcases", (p) => suitcases(p)], ["computer", (p) => computer(p, { look: 0.5 })],
  ["scientist", (p) => bodyFront(p, SCIENTIST, { mode: "stand", expr: "neutral", prop: "clipboard" })], ["handler", (p) => bodyFront(p, HANDLER, { mode: "stand", expr: "nervous" })],
  ["friend A", (p) => bodyFront(p, FRIEND_A, { mode: "stand", expr: "grin", prop: "cards" })], ["friend B", (p) => bodyFront(p, FRIEND_B, { mode: "stand", expr: "shock" })],
];
