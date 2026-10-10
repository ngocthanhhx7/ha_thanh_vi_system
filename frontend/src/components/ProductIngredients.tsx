import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Pause, Play } from 'lucide-react';
import type { Ingredient, Product } from '../constants/catalog';
import { Modal } from './Modal';
import './product-ingredients.css';

gsap.registerPlugin(useGSAP);

export function ProductIngredients({
  product,
  ingredients,
}: {
  product: Product;
  ingredients: Ingredient[];
}) {
  const selectedIngredients = (product.ingredientIds ?? [])
    .map((id) => ingredients.find((ingredient) => ingredient.id === id))
    .filter((ingredient): ingredient is Ingredient => Boolean(ingredient));
  return (
    <section className="product-ingredients-section" aria-label="Thành phần và hướng dẫn sản phẩm">
      {selectedIngredients.length ? (
        <IngredientStrip key={product.id} ingredients={selectedIngredients} />
      ) : (
        <div className="ingredient-empty">
          <h2>Thành phần tạo nên hương vị</h2>
          <p>Thành phần của thức quà này đang được cập nhật.</p>
        </div>
      )}
      <div className="ingredient-product-notes">
        {product.ingredients && (
          <p>
            <strong>Thành phần trên nhãn: </strong>
            {product.ingredients}
          </p>
        )}
        <p>
          <strong>Thông tin dị ứng: </strong>
          {product.allergens ||
            'Chưa có thông tin xác nhận. Nếu bạn có dị ứng thực phẩm, vui lòng hỏi shop trước khi mua.'}
        </p>
        <p>
          <strong>Bảo quản: </strong>
          {product.storage ||
            'Theo hướng dẫn trên bao bì chính thức; shop đang cập nhật thông tin.'}
        </p>
      </div>
    </section>
  );
}

function IngredientStrip({ ingredients }: { ingredients: Ingredient[] }) {
  const root = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const animation = useRef<gsap.core.Tween | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const staticList = paused || focused || reduced;
  const running = !staticList && !hovered && !selected && visible && pageVisible;
  const runningRef = useRef(running);
  runningRef.current = running;
  const identity = ingredients.map((ingredient) => ingredient.id).join(',');

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReduced(media.matches);
    const updateVisibility = () => setPageVisible(!document.hidden);
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useGSAP(
    (_context, contextSafe) => {
      if (staticList || !track.current || !group.current || !viewport.current || !contextSafe)
        return;
      let previousWidth = 0;
      const rebuild = contextSafe(() => {
        if (!track.current || !group.current) return;
        const width = group.current.getBoundingClientRect().width;
        if (!width || Math.abs(width - previousWidth) < 0.5) return;
        const progress = animation.current?.progress() ?? 0;
        animation.current?.kill();
        previousWidth = width;
        animation.current = gsap.fromTo(
          track.current,
          { x: 0 },
          {
            x: -width,
            duration: width / 32,
            repeat: -1,
            ease: 'none',
            paused: true,
          },
        );
        animation.current.progress(progress).paused(!runningRef.current);
      });
      rebuild();
      const observer = new ResizeObserver(rebuild);
      observer.observe(viewport.current);
      return () => {
        observer.disconnect();
        animation.current?.kill();
        animation.current = null;
      };
    },
    { scope: root, dependencies: [identity, staticList], revertOnUpdate: true },
  );

  useEffect(() => {
    animation.current?.paused(!running);
  }, [running]);

  useEffect(() => {
    if (!selected && trigger.current) {
      trigger.current.focus({ preventScroll: true });
      trigger.current = null;
    }
  }, [selected]);

  function open(ingredient: Ingredient, button: HTMLButtonElement) {
    // Decorative loop copies do not enter keyboard navigation. Restore to the real card.
    trigger.current = button.closest('[aria-hidden="true"]')
      ? (group.current?.querySelector<HTMLButtonElement>(`[data-ingredient="${ingredient.id}"]`) ??
        null)
      : button;
    setSelected(ingredient);
  }

  function close() {
    setSelected(null);
  }

  const cards = (duplicate: boolean) =>
    ingredients.map((ingredient) => (
      <button
        type="button"
        className="ingredient-card"
        key={ingredient.id}
        data-ingredient={ingredient.id}
        aria-label={'Xem thành phần ' + ingredient.name}
        tabIndex={duplicate ? -1 : 0}
        onMouseDown={duplicate ? (event) => event.preventDefault() : undefined}
        onClick={(event) => open(ingredient, event.currentTarget)}
      >
        <img
          src={ingredient.image}
          alt=""
          width="480"
          height="720"
          loading="lazy"
          draggable={false}
        />
        <span>{ingredient.name}</span>
        <small>Khám phá hương vị</small>
      </button>
    ));

  return (
    <section
      ref={root}
      className={'product-ingredients' + (staticList ? ' is-static' : '')}
      aria-label="Thành phần tạo nên hương vị"
    >
      <div className="ingredient-heading">
        <div>
          <p className="eyebrow">TỪ NHỮNG ĐIỀU THÂN QUEN</p>
          <h2>
            Thành phần tạo nên <em>hương vị.</em>
          </h2>
          <p>Chạm vào từng thành phần để khám phá hương vị cốt lõi.</p>
        </div>
        {!reduced && (
          <button
            type="button"
            className="ingredient-motion-button"
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? 'Tiếp tục chuyển động' : 'Dừng chuyển động'}
          >
            {paused ? (
              <Play size={17} aria-hidden="true" />
            ) : (
              <Pause size={17} aria-hidden="true" />
            )}
            <span>{paused ? 'Tiếp tục' : 'Dừng'}</span>
          </button>
        )}
      </div>
      <div
        ref={viewport}
        className="ingredient-viewport"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
        onFocusCapture={(event) => setFocused(event.target.matches(':focus-visible'))}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
        <div className="ingredient-track" ref={track}>
          <div className="ingredient-group" ref={group}>
            {cards(false)}
          </div>
          {!staticList && (
            <div className="ingredient-group ingredient-loop-copy" aria-hidden="true">
              {cards(true)}
            </div>
          )}
        </div>
      </div>
      {selected && (
        <Modal title={selected.name} onClose={close}>
          <IngredientDetail ingredient={selected} />
        </Modal>
      )}
    </section>
  );
}

function IngredientDetail({ ingredient }: { ingredient: Ingredient }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from(ref.current, {
          autoAlpha: 0,
          y: 14,
          scale: 0.97,
          duration: 0.22,
          ease: 'power2.out',
        });
      });
      return () => media.revert();
    },
    { scope: ref },
  );
  return (
    <div className="ingredient-detail" ref={ref}>
      <img
        src={ingredient.image}
        alt={ingredient.name}
        width="480"
        height="720"
        draggable={false}
      />
      <div>
        <p>{ingredient.description}</p>
        <p className="ingredient-core-label">HƯƠNG VỊ CỐT LÕI</p>
        <p className="ingredient-core-flavor">{ingredient.coreFlavor}</p>
      </div>
    </div>
  );
}
