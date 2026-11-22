import { runOptimizer } from "./optimizer.js";

self.onmessage = e => self.postMessage(runOptimizer(e.data));
