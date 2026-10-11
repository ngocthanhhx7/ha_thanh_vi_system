# Story video implementation plan

**Goal:** Make the user's illustrated film the focal point of `/cau-chuyen`, with a lightweight, responsive viewing experience.

**Architecture:** Keep the existing CMS story text and the three story chapters. Replace the opening illustration with a full-width film presentation, using a small poster and an explicit play button. A focused `StoryFilm` component owns playback, buffering and retry; browser controls own seeking, sound and fullscreen.

**Tech stack:** React, TypeScript, scoped CSS, native HTML video, FFmpeg, Playwright.

The user explicitly requested both planning and implementation. Execute in this session on `feat/story-video`, then use the standing authorization to commit, push and update the VPS after validation.

- [x] Inspect the source film, codec, dimensions and representative frames.
- [x] Create `frontend/public/brand/video/story-film-v1.mp4`: H.264, AAC, 1280 px wide, fast-start MP4. Preserve the source MOV locally and exclude it from Git and Docker context. Extract `story-poster-v1.webp` from the family tea scene at 55 seconds.
- [x] Add `frontend/src/components/StoryFilm.tsx` and `story-film.css`: stable original aspect ratio, poster-first state, no video request before activation, direct user-triggered playback with sound, native controls/fullscreen/inline playback, loading notice and retry after a failed media request. Pause on leaving the viewport, hiding the tab and unmounting; never resume automatically.
- [x] Update only the Story opening in `frontend/src/pages/Editorial.tsx`, with title and CMS description above the film, a link to the chapters, restrained gold/red ornament and concise viewing metadata. Keep About, the existing chapters, quotation and product CTA.
- [x] Add a scoped story opening stylesheet: wide desktop composition, single column on phones, touch targets at least 44 px, no content cropping, keyboard focus, reduced-motion support.
- [x] Verify actual playback with the optimized file, poster-only network behavior, pause/retry, native controls and navigation; check widths 320, 390, 768, 1440 and 1920 plus About regression. Run typecheck, lint, format and production build.
- [ ] Review the diff, commit and push to main. Wait for GitHub CI, build and activate web only on the authorized VPS with rollback image; verify HTTP 200/206, video MIME/range support and the deployed browser experience.

**Design decision:** An inline film under the opening is preferred over a small side player or a background video. It preserves the complete 1912:1080 artwork, lets visitors choose when to hear the soundtrack, and does not consume video bandwidth during the initial page load. No autoplay, looping, new media generation, database migration or CMS schema changes are needed.

**Acceptance:** The film can be played, paused, sought and viewed fullscreen through browser controls. The source MOV is not published. A failed load offers retry inside the same reserved frame. The heading and poster are readable at narrow widths; the page has no horizontal overflow. Story text and About continue to render with existing content.
