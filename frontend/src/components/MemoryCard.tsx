import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { gameImage, type GameState } from '../services/gameApi';

gsap.registerPlugin(useGSAP);

export function MemoryCard({
  card,
  face,
  pending,
  disabled,
  label,
  onClick,
}: {
  card: GameState['memory']['cards'][number];
  face: string | null;
  pending: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const root = useRef<HTMLButtonElement>(null);
  const turn = useRef<HTMLDivElement>(null);
  const motion = useRef<gsap.core.Timeline | null>(null);
  const revealed = !!card.cardId || card.matched;
  useGSAP(
    () => {
      gsap.set(turn.current, { rotationY: revealed ? 180 : 0 });
      gsap.set(root.current, { opacity: card.matched ? 0 : 1 });
    },
    { scope: root },
  );
  useGSAP(
    () => {
      motion.current?.kill();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const timeline = gsap.timeline({ defaults: { ease: 'power2.inOut', overwrite: 'auto' } });
      motion.current = timeline;
      if (pending && !revealed) {
        // A quick acknowledgement finishes face-down: network latency must never
        // leave the card stranded edge-on or expose an invented ingredient.
        timeline
          .to(turn.current, { rotationY: 8, duration: reduced ? 0 : 0.08 })
          .to(turn.current, { rotationY: 0, duration: reduced ? 0 : 0.12 });
      } else {
        timeline.to(turn.current, { rotationY: revealed ? 180 : 0, duration: reduced ? 0 : 0.24 });
      }
      if (card.matched) {
        timeline
          .to(root.current, { scale: 1.035, duration: reduced ? 0 : 0.12 })
          .to(root.current, { opacity: 0, scale: 0.96, duration: reduced ? 0 : 0.16 });
      }
    },
    { scope: root, dependencies: [revealed, pending, card.matched] },
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
          <img src={gameImage(face || 'card-back')} alt="" width="480" height="720" />
        </div>
      </div>
      {pending && <i className="games-memory-pending" aria-hidden="true" />}
    </button>
  );
}
