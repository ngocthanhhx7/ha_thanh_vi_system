import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

const slides = [
  { id: 'traditional', name: 'Vị truyền thống' },
  { id: 'matcha', name: 'Vị matcha' },
  { id: 'chocolate', name: 'Vị socola' },
  { id: 'mix', name: 'Hộp bánh mix vị' },
];

export function HomeProductCarousel() {
  const root = useRef<HTMLDivElement>(null);
  const images = useRef<(HTMLImageElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [failed, setFailed] = useState<number[]>([]);
  const [requested, setRequested] = useState<number | null>(null);
  const running = !hovered && visible && pageVisible && !reduced;

  useEffect(() => {
    if (failed.includes(active)) {
      const next = slides.findIndex((_, index) => !failed.includes(index));
      if (next >= 0) setRequested(next);
    }
  }, [failed, active]);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches);
    const visibility = () => setPageVisible(!document.hidden);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (root.current) observer.observe(root.current);
    media.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    if (!running || failed.length >= slides.length - 1) return;
    const timer = window.setTimeout(() => {
      const next = slides
        .map((_, i) => (active + i + 1) % slides.length)
        .find((i) => !failed.includes(i) && i !== active);
      if (next !== undefined) setRequested(next);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [running, active, failed]);

  useEffect(() => {
    if (requested === null) return;
    let cancelled = false;
    const image = images.current[requested];
    if (image) {
      void image
        .decode()
        .then(() => {
          if (!cancelled) setActive(requested);
        })
        .catch(() => {
          if (!cancelled)
            setFailed((items) => (items.includes(requested) ? items : [...items, requested]));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [requested]);

  useGSAP(
    () => {
      const elements = images.current.filter((image): image is HTMLImageElement => image !== null);
      gsap.to(elements, {
        opacity: (index: number) => (index === active ? 1 : 0),
        duration: reduced ? 0 : 0.65,
        ease: 'power1.inOut',
        overwrite: true,
      });
    },
    { scope: root, dependencies: [active, reduced] },
  );

  return (
    <div
      ref={root}
      className="home-product-carousel"
      role="region"
      aria-roledescription="trình chiếu"
      aria-label="Các hương vị bánh chả Hà Thành Vị"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="hero-photo" aria-live="off">
        {slides.map((slide, index) => (
          <img
            key={slide.id}
            ref={(node) => {
              images.current[index] = node;
            }}
            className={index === active ? 'is-active' : ''}
            src={`/brand/product/${slide.id}-1080.webp`}
            srcSet={`/brand/product/${slide.id}-640.webp 640w, /brand/product/${slide.id}-1080.webp 1080w`}
            sizes="(max-width: 640px) calc(100vw - 54px), (max-width: 1600px) 44vw, 680px"
            width="1080"
            height="1080"
            alt={`Bánh chả Hà Thành Vị — ${slide.name}`}
            aria-hidden={index !== active}
            fetchPriority={index === 0 ? 'high' : 'low'}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
            onError={() =>
              setFailed((items) => (items.includes(index) ? items : [...items, index]))
            }
          />
        ))}
      </div>
    </div>
  );
}
