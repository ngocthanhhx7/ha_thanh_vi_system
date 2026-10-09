import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { gameCardName, gameImage, type GameState } from '../services/gameApi';

gsap.registerPlugin(useGSAP);

export function MemoryCard({
  card,
  face,
  displayPair,
  onRevealed,
  pending,
  disabled,
  label,
  onClick,
}: {
  card: GameState['memory']['cards'][number];
  face: string | null;
  displayPair: boolean;
  onRevealed: () => void;
  pending: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const root = useRef<HTMLButtonElement>(null);
  const turn = useRef<HTMLDivElement>(null);
  const motion = useRef<gsap.core.Timeline | null>(null);
  const frontImage = useRef<HTMLImageElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const generation = useRef(0);
  const revealCallback = useRef(onRevealed);
  revealCallback.current = onRevealed;
  const revealed = !!card.cardId || card.matched;
  const { contextSafe } = useGSAP(
    () => {
      gsap.set(turn.current, { rotationY: revealed ? 180 : 0 });
      gsap.set(root.current, { opacity: card.matched ? 0 : 1 });
    },
    { scope: root },
  );
  useGSAP(
    () => {
      motion.current?.kill();
      const version = ++generation.current;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const animate = contextSafe(() => {
        if (generation.current !== version || !root.current || !turn.current) return;
        if (displayPair) gsap.set(root.current, { opacity: 1, scale: 1 });
        const timeline = gsap.timeline({ defaults: { ease: 'power2.inOut', overwrite: 'auto' } });
        motion.current = timeline;
        if (pending && !revealed) {
          // A quick acknowledgement finishes face-down: network latency must never
          // leave the card stranded edge-on or expose an invented ingredient.
          timeline
            .to(turn.current, { rotationY: 8, duration: reduced ? 0 : 0.08 })
            .to(turn.current, { rotationY: 0, duration: reduced ? 0 : 0.12 });
        } else {
          timeline.to(turn.current, {
            rotationY: revealed ? 180 : 0,
            duration: reduced ? 0 : 0.24,
            onComplete: () => {
              if (revealed) revealCallback.current();
            },
          });
        }
        if (card.matched && !displayPair) {
          timeline
            .to(root.current, { scale: 1.035, duration: reduced ? 0 : 0.12 })
            .to(root.current, { opacity: 0, scale: 0.96, duration: reduced ? 0 : 0.16 });
        }
      });
      // Do not start the viewing clock before the ingredient pixels are decoded.
      if (revealed && frontImage.current)
        void frontImage.current
          .decode()
          .catch(() => {
            if (generation.current === version && root.current) setImageFailed(true);
          })
          .then(animate);
      else animate();
    },
    { scope: root, dependencies: [revealed, pending, card.matched, displayPair, face] },
  );
  return (
    <button
      ref={root}
      className={`games-memory-card${card.matched ? ' is-matched' : ''}${revealed ? ' is-revealed' : ''}${pending ? ' is-pending' : ''}`}
      disabled={disabled}
      aria-label={label}
      aria-busy={pending}
      onClick={onClick}
    >
      <div ref={turn} className="games-memory-turn" aria-hidden="true">
        <div className="games-memory-back">
          <img src={gameImage('card-back')} alt="" width="480" height="720" />
          <span>{card.index + 1}</span>
        </div>
        <div className="games-memory-front">
          <img
            ref={frontImage}
            src={gameImage(face || 'card-back')}
            alt=""
            width="480"
            height="720"
            onLoad={() => setImageFailed(false)}
            onError={() => setImageFailed(true)}
          />
          {imageFailed && face && (
            <div className="games-memory-front-fallback">{gameCardName(face)}</div>
          )}
        </div>
      </div>
      {pending && <i className="games-memory-pending" aria-hidden="true" />}
    </button>
  );
}
