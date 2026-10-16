import { writeFileSync, readFileSync } from 'node:fs';
import { makePaceGhost, normalizeTrack, BUILTIN_TRACK_FILES } from '../sim-tracks.js';

for (const meta of BUILTIN_TRACK_FILES) {
  if (meta.legacyId != null) continue;
  const track = normalizeTrack(JSON.parse(readFileSync(meta.file, 'utf8')));
  const indoor = track.map !== 'city';
  const ghost = makePaceGhost(track.gates, {
    track: track.id,
    name: 'PACE BOT',
    speed: indoor ? 6 : 12,
    hz: 8,
    laps: 3,
  });
  writeFileSync('ghosts/' + track.id + '.json', JSON.stringify(ghost));
  console.log(track.id, ghost.samples.length, 'samples', ghost.lapTime, 'ms');
}
