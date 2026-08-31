export * from "../model/engine";
import { legalMoves, applyMove } from "../model/engine";
export const legalActions = legalMoves;
export const applyAction = applyMove;
