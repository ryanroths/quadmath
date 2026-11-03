// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// A thread of tools/rig_daily.mjs flyCourses: flies each chain it is sent on
// a fresh core (flyCourse) and sends the flight back.
import { parentPort, workerData } from 'node:worker_threads';
import { flyCourse } from './rig_daily.mjs';

parentPort.on('message', async ({ k, ids, laps }) => {
  parentPort.postMessage({ k, f: await flyCourse(ids, workerData.links, { laps }) });
});
