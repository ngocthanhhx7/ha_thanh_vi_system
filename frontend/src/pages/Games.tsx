import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Clock3, Gift, Layers3, Sparkles, Ticket } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useNotificationCenter } from '../components/NotificationCenter';
import {
  GameApiError,
  gameApi,
  gameCards,
  gameCardName,
  gameImage,
  type GameResult,
  type GameState,
} from '../services/gameApi';
import './games.css';

export function Games() {
  const [state, setState] = useState<GameState | null>(null);
  const [guest, setGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const revealedFaces = useRef<Record<number, string>>({});
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'memory' | 'collection'>('memory');
  const [section, setSection] = useState<'missions' | 'rewards'>('missions');
  const [confirm, setConfirm] = useState<9 | 10 | null>(null);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [reward, setReward] = useState<GameResult['reward']>();
  const actionLock = useRef(false);
  const requestVersion = useRef(0);
  const retries = useRef(new Map<string, string>());
  const { notify } = useNotificationCenter();
  const hasGame = state !== null;
  useEffect(() => {
    if (!hasGame || tab !== 'memory') return;
    // Warm the public artwork, without exposing any hidden board positions.
    for (const [id] of gameCards) {
      const image = new Image();
      image.src = gameImage(id);
      void image.decode().catch(() => undefined);
    }
  }, [hasGame, tab]);
  const refresh = useCallback(async (enter = false) => {
    if (actionLock.current) return;
    const version = ++requestVersion.current;
    try {
      const result = await (enter ? gameApi.enter() : gameApi.state());
      if (version !== requestVersion.current) return;
      setState(result.state);
      setGuest(false);
      setError('');
    } catch (reason) {
      if (version !== requestVersion.current) return;
      if (reason instanceof GameApiError && reason.status === 401) {
        setGuest(true);
        setState(null);
      } else setError(reason instanceof Error ? reason.message : 'Chưa tải được trò chơi.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh(true);
    const visible = () => {
      if (document.visibilityState === 'visible' && !actionLock.current) void refresh(true);
    };
    window.addEventListener('customer-session-changed', visible);
    document.addEventListener('visibilitychange', visible);
    const interval = window.setInterval(visible, 60000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('customer-session-changed', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!state?.memory.mismatchUntil) return;
    const { round, mismatchUntil } = state.memory;
    const timer = setTimeout(
      () =>
        setState((current) => {
          if (
            !current ||
            current.memory.round !== round ||
            current.memory.mismatchUntil !== mismatchUntil
          )
            return current;
          return {
            ...current,
            memory: {
              ...current.memory,
              mismatchUntil: null,
              cards: current.memory.cards.map((card) => ({ ...card, cardId: null })),
            },
          };
        }),
      Math.max(0, new Date(mismatchUntil).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state?.memory.round, state?.memory.mismatchUntil]);
  async function action(key: string, run: (id: string) => Promise<GameResult>, index?: number) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setPendingIndex(index ?? null);
    setError('');
    ++requestVersion.current;
    const id = retries.current.get(key) || crypto.randomUUID();
    retries.current.set(key, id);
    try {
      const result = await run(id);
      retries.current.delete(key);
      if (result.state.memory.round !== state?.memory.round) revealedFaces.current = {};
      for (const card of result.state.memory.cards) {
        if (card.cardId) revealedFaces.current[card.index] = card.cardId;
      }
      if (
        index !== undefined &&
        result.state.memory.cards[index].matched &&
        state?.memory.firstIndex !== null &&
        state?.memory.firstIndex !== undefined
      ) {
        const face = revealedFaces.current[state.memory.firstIndex];
        if (face) revealedFaces.current[index] = face;
      }
      setState(result.state);
      setConfirm(null);
      if (result.card) setDrawn(result.card);
      if (result.reward) {
        setReward(result.reward);
        notify({
          title: 'Quà đã vào ví ưu đãi!',
          message: result.reward.name,
          href: '/tai-khoan?section=vouchers',
          actionLabel: 'Mở ví ưu đãi',
          tone: 'success',
        });
      }
    } catch (reason) {
      if (reason instanceof GameApiError && reason.status === 401) {
        setGuest(true);
        setState(null);
      }
      setError(
        reason instanceof Error ? reason.message : 'Thao tác chưa hoàn tất. Vui lòng thử lại.',
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
      setPendingIndex(null);
    }
  }
  const memory = state?.memory;
  const collection = state?.collection;
  const matched = memory?.cards.filter((card) => card.matched).length || 0;
  const unique = gameCards.filter(([id]) => (collection?.inventory[id] || 0) > 0).length;
  const canRedeem = (tier: 9 | 10) =>
    gameCards.slice(0, tier).every(([id]) => (collection?.inventory[id] || 0) >= 1);
  return (
    <div className="games-page">
      <header className="games-intro">
        <div>
          <span className="games-eyebrow">GÓC VUI HÀ THÀNH</span>
          <h1>
            Gom chút vui.
            <br />
            <em>Nhận chút thương.</em>
          </h1>
          <p>
            Lật tìm nguyên liệu, góp nhặt thẻ xinh.
            <br />
            Những món quà nhỏ đang chờ bạn khám phá.
          </p>
        </div>
        <div className="games-intro-art" aria-hidden="true">
          <img src={gameImage('lime-leaf')} alt="" />
          <img src={gameImage('card-back')} alt="" />
          <img src={gameImage('banh-cha')} alt="" />
          <span>
            <Sparkles size={18} /> Một lượt chơi, một niềm vui
          </span>
        </div>
      </header>
      <div className="games-switch" role="group" aria-label="Chọn trò chơi">
        <button aria-pressed={tab === 'memory'} onClick={() => setTab('memory')}>
          <Layers3 size={20} />
          <span>
            Lật thẻ làm bánh<small>Ghép đôi · Nhận 30.000đ</small>
          </span>
        </button>
        <button aria-pressed={tab === 'collection'} onClick={() => setTab('collection')}>
          <Sparkles size={20} />
          <span>
            Sưu tập hương vị<small>Gom thẻ · Đổi quà</small>
          </span>
        </button>
      </div>
      {error && (
        <div className="games-error" role="alert">
          {error}{' '}
          <button onClick={() => void refresh()} disabled={busy}>
            Tải lại tiến độ
          </button>
        </div>
      )}
      {loading && (
        <p className="games-loading" role="status">
          Đang mở hộp thẻ của bạn…
        </p>
      )}
      {guest && (
        <section className="games-guest">
          <Gift size={30} />
          <h2>Một bộ thẻ dành riêng cho bạn</h2>
          <p>Đăng nhập để lưu tiến độ, nhận lượt mỗi ngày và đưa phần thưởng vào ví ưu đãi.</p>
          <Link className="games-button" to="/tai-khoan">
            Đăng nhập để chơi <ArrowRight size={16} />
          </Link>
          <p className="games-note">
            Lật thẻ: 3 lượt chào mừng + 1 lượt mỗi ngày. Sưu tập: 1 thẻ mỗi ngày, thêm 1 lượt khi
            xem sản phẩm đủ 30 giây.
          </p>
        </section>
      )}
      {state && tab === 'memory' && memory && (
        <div className="games-layout">
          <section className="games-board-panel" aria-label="Bàn lật thẻ">
            <div className="games-panel-heading">
              <div>
                <span className="games-eyebrow">MẺ BÁNH SỐ {memory.round}</span>
                <h2>Tìm đôi, trọn vị</h2>
              </div>
              <span className="games-counter">
                <strong>{memory.attempts}</strong> lượt còn lại
              </span>
            </div>
            <div className="games-progress">
              <span>{matched / 2}/10 cặp đã tìm thấy</span>
              <progress value={matched} max={20} aria-label="Tiến độ ghép đôi" />
            </div>
            <p className="games-hint" aria-live="polite">
              {memory.complete
                ? 'Bạn đã tìm đủ nguyên liệu! Nhận quà ở bảng nhiệm vụ để mở mẻ bánh mới.'
                : memory.mismatchUntil
                  ? 'Chưa cùng nguyên liệu rồi. Ghi nhớ vị trí và thử lại nhé.'
                  : memory.firstIndex !== null
                    ? 'Chọn thêm một thẻ để hoàn thành lượt.'
                    : memory.attempts === 0
                      ? 'Hết lượt hôm nay? Khám phá nhiệm vụ bên cạnh để nhận thêm.'
                      : 'Chọn 2 thẻ giống nhau. Mỗi cặp chọn dùng 1 lượt, kể cả khi chưa khớp.'}
            </p>
            <div className="games-memory-grid">
              {memory.cards.map((card) => (
                <button
                  key={card.index}
                  className={`games-memory-card${card.matched ? ' is-matched' : ''}${card.cardId || card.matched ? ' is-revealed' : ''}${pendingIndex === card.index ? ' is-pending' : ''}`}
                  disabled={
                    busy ||
                    card.matched ||
                    !!card.cardId ||
                    !!memory.mismatchUntil ||
                    (memory.attempts === 0 && memory.firstIndex === null)
                  }
                  aria-label={
                    card.matched
                      ? `Ô ${card.index + 1}, đã ghép`
                      : card.cardId
                        ? gameCardName(card.cardId)
                        : `Lật thẻ ${card.index + 1}`
                  }
                  onClick={() =>
                    void action(
                      `flip-${memory.round}-${card.index}`,
                      (id) => gameApi.flip(card.index, id),
                      card.index,
                    )
                  }
                >
                  <div className="games-memory-turn" aria-hidden="true">
                    <div className="games-memory-back">
                      <img src={gameImage('card-back')} alt="" />
                      <span>{card.index + 1}</span>
                    </div>
                    <div className="games-memory-front">
                      <img
                        src={gameImage(
                          card.cardId || revealedFaces.current[card.index] || 'card-back',
                        )}
                        alt=""
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <p className="games-note">
              <Clock3 size={14} /> Vị trí được giữ suốt ván. Lượt chưa dùng được giữ qua ngày và mẻ
              bánh mới.
            </p>
          </section>
          <aside className="games-sidebar">
            <h2>Nhiệm vụ của bạn</h2>
            <span className="games-eyebrow">HẰNG NGÀY</span>
            <Mission
              title="Ghé chơi mỗi ngày"
              detail="+1 lượt · Làm mới lúc 00:00 GMT+7"
              done={memory.missions.daily}
            />
            <span className="games-eyebrow">MỘT LẦN DUY NHẤT</span>
            <Mission
              title="Lời chào đầu tiên"
              detail="+3 lượt khi mở game lần đầu"
              done={memory.missions.welcome}
            />
            <Mission
              title="Ghé quầy bánh"
              detail="+1 lượt · Khám phá sản phẩm"
              done={memory.missions.products}
              to="/san-pham"
            />
            <Mission
              title="Làm quen Hà Thành Vị"
              detail="+1 lượt · Đọc câu chuyện chúng tôi"
              done={memory.missions.about}
              to="/ve-chung-toi"
            />
            <div className="games-prize">
              <Ticket />
              <span>HOÀN THÀNH MẺ BÁNH</span>
              <strong>30.000đ</strong>
              <p>Giảm trực tiếp mọi mặt hàng, đơn từ 0đ. Có hiệu lực 30 ngày.</p>
              <button
                className="games-button"
                disabled={!memory.complete || busy}
                onClick={() =>
                  void action(`reward-${memory.round}`, () => gameApi.memoryReward(memory.round))
                }
              >
                {busy ? 'Đang xử lý…' : 'Nhận thưởng & chơi ván mới'}
              </button>
            </div>
          </aside>
        </div>
      )}
      {state && tab === 'collection' && collection && (
        <div className="games-layout">
          <section className="games-board-panel">
            <div className="games-panel-heading">
              <div>
                <span className="games-eyebrow">BỘ SƯU TẬP CỦA BẠN</span>
                <h2>Mười vị, một Hà Nội</h2>
              </div>
              <span className="games-counter">
                <strong>{unique}/10</strong> loại đang có
              </span>
            </div>
            <p className="games-hint">
              Mỗi thẻ là một chút hương vị. Thẻ trùng được giữ lại để đổi quà.
            </p>
            <div className="games-collection-grid">
              {gameCards.map(([id, name]) => {
                const count = collection.inventory[id] || 0;
                return (
                  <figure key={id} className={`games-collectible${count ? '' : ' is-unowned'}`}>
                    <div className={`games-card-art games-card-${id}`}>
                      <img src={gameImage(id)} alt={name} loading="lazy" />
                      {!count && (
                        <img
                          className="games-unowned-layer"
                          src={gameImage(id)}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                        />
                      )}
                      {id === 'banh-cha' && <span className="games-rare-label">HIẾM · 10 THẺ</span>}
                    </div>
                    <figcaption>
                      <strong>{name}</strong>
                      <span>{count ? `Đang có: ${count}` : 'Chưa có · 0'}</span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <div className="games-draw-bar">
              <div>
                <strong>{collection.draws} lượt rút hôm nay</strong>
                <span>Lượt chưa dùng hết hạn lúc 00:00 GMT+7.</span>
              </div>
              <button
                className="games-button"
                disabled={busy || collection.draws < 1}
                onClick={() => void action('draw', (id) => gameApi.draw(id))}
              >
                <Sparkles size={17} />
                {busy ? 'Đang mở thẻ…' : 'Rút một thẻ'}
              </button>
            </div>
            <p className="games-note">
              {collection.rareEver
                ? 'Bạn đã được phát thẻ Bánh chả. Các lượt tiếp theo chia đều cho 9 nguyên liệu (mỗi loại 1/9).'
                : collection.rareRemaining === 0
                  ? '10 thẻ Bánh chả đã được phát hết. Các lượt rút chia đều cho 9 nguyên liệu (mỗi loại 1/9).'
                  : `Bánh chả: 5% · Còn ${collection.rareRemaining}/10 thẻ toàn chương trình. Chín nguyên liệu chia đều 95% còn lại (khoảng 10,56% mỗi loại). Mỗi tài khoản chỉ nhận Bánh chả một lần.`}
            </p>
          </section>
          <aside className="games-sidebar">
            <div className="games-side-tabs" role="group" aria-label="Nội dung sưu tập">
              <button aria-pressed={section === 'missions'} onClick={() => setSection('missions')}>
                Nhiệm vụ
              </button>
              <button aria-pressed={section === 'rewards'} onClick={() => setSection('rewards')}>
                Đổi thưởng
              </button>
            </div>
            {section === 'missions' ? (
              <>
                <h2>Ghé chơi, góp thẻ</h2>
                <Mission title="Lượt rút mỗi ngày" detail="Đã cộng 1 lượt hôm nay" done />
                <Mission
                  title="Dạo quầy bánh 30 giây"
                  detail={
                    collection.productBonusClaimed
                      ? 'Đã nhận thêm 1 lượt hôm nay'
                      : `${Math.min(30, collection.productSeconds)}/30 giây · Thêm 1 lượt hôm nay`
                  }
                  done={collection.productBonusClaimed}
                  to="/san-pham"
                />
                <p className="games-note">
                  Giữ trang sản phẩm hiển thị để thời gian được ghi nhận. Thẻ đã nhận luôn được giữ
                  đến khi đổi thưởng.
                </p>
                <div className="games-prize games-prize-soft">
                  <Gift />
                  <h3>Gom đủ vị, đổi quà xinh</h3>
                  <p>
                    9 nguyên liệu đổi 30.000đ.
                    <br />
                    Trọn 10 loại đổi giảm 50%.
                  </p>
                  <button className="games-text-button" onClick={() => setSection('rewards')}>
                    Xem phần thưởng <ArrowRight size={15} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Quà từ bộ sưu tập</h2>
                {([9, 10] as const).map((tier) => {
                  const redeemed = tier === 9 ? collection.redeemed9 : collection.redeemed10;
                  return (
                    <div className="games-prize" key={tier}>
                      <Ticket />
                      <span>{tier === 9 ? '9 LOẠI NGUYÊN LIỆU' : 'TRỌN BỘ 10 LOẠI'}</span>
                      <strong>{tier === 9 ? '30.000đ' : 'Giảm 50%'}</strong>
                      <p>
                        {tier === 10 && <>Tối đa 100.000đ. </>}Đơn từ 0đ, mọi mặt hàng, hạn 30 ngày.
                      </p>
                      <p>
                        Trừ 1 thẻ mỗi loại{tier === 9 ? ', không dùng Bánh chả' : ', gồm Bánh chả'}.
                        Mỗi mốc đổi một lần.
                      </p>
                      <button
                        className="games-button"
                        disabled={busy || redeemed || !canRedeem(tier)}
                        onClick={() => setConfirm(tier)}
                      >
                        {redeemed
                          ? 'Đã đổi phần thưởng'
                          : canRedeem(tier)
                            ? 'Đổi phần thưởng'
                            : 'Chưa đủ thẻ'}
                      </button>
                    </div>
                  );
                })}
                <p className="games-note">
                  Muốn nhận cả hai mốc, bạn cần sưu tập thêm những thẻ đã dùng ở lần đổi trước.
                </p>
              </>
            )}
          </aside>
        </div>
      )}
      <details className="games-rules">
        <summary>Luật chơi & những điều cần biết</summary>
        <p>
          Lật thẻ: 20 thẻ tạo thành 10 cặp. Mỗi lượt chọn hai thẻ, đúng thì cặp biến mất, sai thì úp
          lại. Ghép hết bàn và nhận thưởng để bắt đầu ván mới. Các nhiệm vụ một lần không được cấp
          lại.
        </p>
        <p>
          Sưu tập: mỗi ngày một lượt rút và thêm một lượt khi xem trang sản phẩm đủ 30 giây. Ngày
          mới bắt đầu lúc 00:00 GMT+7. Bánh chả chỉ phát 10 thẻ toàn hệ thống, không bổ sung sau khi
          đổi; mỗi tài khoản chỉ được phát tối đa một thẻ.
        </p>
        <p>
          Ưu đãi được cấp riêng cho tài khoản, dùng một lần, có hiệu lực 30 ngày từ khi nhận. Đổi bộ
          9 trừ một bản mỗi nguyên liệu; đổi bộ 10 trừ một bản của cả 10 loại. Mỗi mốc sưu tập chỉ
          đổi được một lần.
        </p>
      </details>
      {confirm && (
        <Modal
          title="Đổi thẻ lấy ưu đãi?"
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <div className="games-dialog">
            <p>
              Bạn sẽ dùng <strong>1 bản của mỗi loại trong bộ {confirm} thẻ</strong>
              {confirm === 9 ? ' nguyên liệu, không gồm Bánh chả' : ', gồm cả Bánh chả'}. Số thẻ này
              sẽ được trừ khỏi bộ sưu tập.
            </p>
            <p>
              Nhận {confirm === 9 ? '30.000đ' : 'giảm 50%, tối đa 100.000đ'} vào ví, đơn từ 0đ, hiệu
              lực 30 ngày. Mốc này chỉ đổi một lần.
            </p>
            <button
              className="games-button"
              disabled={busy}
              onClick={() => void action(`redeem-${confirm}`, () => gameApi.redeem(confirm))}
            >
              {busy ? 'Đang đổi…' : 'Xác nhận đổi thẻ'}
            </button>
          </div>
        </Modal>
      )}
      {drawn && (
        <Modal title="Một hương vị vừa ghé đến" onClose={() => setDrawn(null)}>
          <div className="games-dialog games-reveal">
            <img src={gameImage(drawn)} alt={gameCardName(drawn)} />
            <h3>{gameCardName(drawn)}</h3>
            <p>Đã thêm vào bộ sưu tập của bạn.</p>
            <button className="games-button" onClick={() => setDrawn(null)}>
              Cất vào bộ sưu tập
            </button>
          </div>
        </Modal>
      )}
      {reward && (
        <Modal title="Quà đã vào ví ưu đãi!" onClose={() => setReward(undefined)}>
          <div className="games-dialog games-reveal">
            <Gift size={42} />
            <h3>{reward.name}</h3>
            <p>
              Mã ưu đãi của riêng bạn: <strong>{reward.code}</strong>
            </p>
            <p>Áp dụng mọi mặt hàng, đơn từ 0đ. Có hiệu lực 30 ngày kể từ lúc nhận.</p>
            <Link className="games-button" to="/tai-khoan?section=vouchers">
              Xem ví ưu đãi <ArrowRight size={16} />
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Mission({
  title,
  detail,
  done,
  to,
}: {
  title: string;
  detail: string;
  done: boolean;
  to?: string;
}) {
  return (
    <div className="games-mission">
      <span className={`games-mission-icon${done ? ' is-done' : ''}`} aria-hidden="true">
        {done ? <Check size={17} /> : <Gift size={17} />}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
        {done ? (
          <small>Đã nhận</small>
        ) : (
          to && (
            <Link to={to}>
              Khám phá <ArrowRight size={13} />
            </Link>
          )
        )}
      </div>
    </div>
  );
}
