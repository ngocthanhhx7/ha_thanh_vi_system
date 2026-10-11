# Story film

The user supplied `frontend/public/brand/video/1010(3).mov` (119,956,006 bytes, 82.0361 seconds, H.264/AAC, 1912×1080, 30 fps). The original remains at that local path, excluded from Git and Docker context. Do not delete or publish it as part of deployment.

The Story page uses `story-film-v1.mp4` (11,564,438 bytes, H.264/AAC, 1280×724, 82.036 seconds) and `story-poster-v1.webp` (78,504 bytes). The poster is a frame of the family tea scene at 55 seconds. These are derivatives of the user's film, not newly generated artwork. The web video is approximately 90% smaller than the original.

Reproduce with FFmpeg from the project root (use a new versioned filename when replacing published media):

```powershell
ffmpeg -i 'frontend/public/brand/video/1010(3).mov' -map 0:v:0 -map 0:a:0 -vf 'scale=1280:-2' -c:v libx264 -preset medium -crf 24 -maxrate 2200k -bufsize 4400k -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart frontend/public/brand/video/story-film-v1.mp4
ffmpeg -ss 55 -i 'frontend/public/brand/video/1010(3).mov' -frames:v 1 -vf 'scale=1280:-1' -c:v libwebp -quality 82 frontend/public/brand/video/story-poster-v1.webp
```

`StoryFilm` reserves the original aspect ratio and initially has no media source. Activating its button starts playback inside the user gesture, enabling sound on mobile without autoplay. Native controls provide play/pause, seeking, sound and fullscreen; `playsInline` keeps the initial viewing experience in-page on phones. The download menu is suppressed where the browser supports `controlsList`, without promising download prevention.

Failed media requests keep the frame in place and offer retry. Playback pauses when the film leaves the viewport, the tab becomes hidden or the route unmounts. Returning to the film does not restart it automatically. Floating game/chat launchers are hidden while the film is visible; an already-open chat stays accessible.

No API, CMS schema or database changes are required. Caddy's existing static file handler supports `video/mp4`, byte ranges and seven-day caching under `/brand/`; versioned filenames avoid stale replacement media. Browser regression coverage is in `tests/e2e/story-video.spec.ts`.

The repository and Docker build publish only the optimized assets. A local Vite build also copies ignored files from the developer's public directory; never deploy that local `dist` directly while the original MOV is present. Deployment builds from the clean Git checkout on the VPS.
