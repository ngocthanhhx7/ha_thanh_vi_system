export type ViOiMascotMood = 'idle' | 'thinking' | 'speaking' | 'offline';

export function ViOiMascot({ mood = 'idle' }: { mood?: ViOiMascotMood }) {
  return (
    <img
      src={`/brand/mascot/vioi-mascot-${mood}.svg`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
