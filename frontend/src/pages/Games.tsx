import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Clock3, Gift, Layers3, Sparkles, Ticket } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useNotificationCenter } from '../components/NotificationCenter';
import { MemoryCard } from '../components/MemoryCard';
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

type PairView = { round: number; indices: number[]; ready: number[]; matched: boolean };
const number = (value: number) => value.toLocaleString('vi-VN');
const date = (value: string) =>
  new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

export function Games() {
  const [state, setState] = useState<GameState | null>(null);
  const [guest, setGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [networkBusy, setBusy] = useState(false);
  const [pairView, setPairView] = useState<PairView | null>(null);
  const pairRef = useRef<PairView | null>(null);
  const busy = networkBusy || pairView !== null;
  function showPair(pair: PairView | null) {
    pairRef.current = pair;
    setPairView(pair);
  }
  const cardRevealed = useCallback((index: number) => {
    const pair = pairRef.current;
    if (!pair || !pair.indices.includes(index) || pair.ready.includes(index)) return;
    const next = { ...pair, ready: [...pair.ready, index] };
    pairRef.current = next;
    setPairView(next);
  }, []);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [queuedIndex, setQueuedIndex] = useState<number | null>(null);
  const queuedFlip = useRef<number | null>(null);
  const flipInFlight = useRef<number | null>(null);
  const mounted = useRef(true);
  const revealedFaces = useRef<Record<number, string>>({});
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'memory' | 'collection'>('memory');
  const [section, setSection] = useState<'missions' | 'rewards'>('missions');
  const [confirm, setConfirm] = useState<9 | 10 | null>(null);
  const [confirmPoints, setConfirmPoints] = useState<number | null>(null);
  const [pointReward, setPointReward] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now);
  const serverOffset = useRef(0);
  const expiredRefresh = useRef<number | null>(null);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [reward, setReward] = useState<GameResult['reward']>();
  const actionLock = useRef(false);
  const requestVersion = useRef(0);
  const retries = useRef(new Map<string, string>());
  const { notify } = useNotificationCenter();
  const hasGame = state !== null;
  const acceptState = useCallback((next: GameState) => {
    const now = Date.now();
    serverOffset.current = Date.parse(next.memory.serverNow) - now;
    setClockNow(now);
    setState(next);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pairRef.current = null;
      queuedFlip.current = null;
      ++requestVersion.current;
    };
  }, []);
  useEffect(() => {
    if (!hasGame || tab !== 'memory') return;
    // Warm the public artwork, without exposing any hidden board positions.
    for (const [id] of gameCards) {
      const image = new Image();
      image.src = gameImage(id);
      void image.decode().catch(() => undefined);
    }
  }, [hasGame, tab]);
  const refresh = useCallback(
    async (enter = false) => {
      if (actionLock.current || pairRef.current) return;
      const version = ++requestVersion.current;
      try {
        const result = await (enter ? gameApi.enter() : gameApi.state());
        if (version !== requestVersion.current) return;
        if (result.state.memory.mismatchUntil) {
          const indices = result.state.memory.cards
            .filter((card) => card.cardId)
            .map((card) => card.index);
          if (indices.length === 2) {
            setTab('memory');
            showPair({ round: result.state.memory.round, indices, ready: [], matched: false });
          }
        }
        acceptState(result.state);
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
    },
    [acceptState],
  );
  useEffect(() => {
    void refresh(true);
    const visible = () => {
      if (document.visibilityState === 'visible' && !actionLock.current) void refresh(true);
    };
    const sessionChanged = () => {
      ++requestVersion.current;
      actionLock.current = false;
      queuedFlip.current = null;
      flipInFlight.current = null;
      revealedFaces.current = {};
      retries.current.clear();
      showPair(null);
      setDrawn(null);
      setReward(undefined);
      setConfirm(null);
      setConfirmPoints(null);
      setPointReward(false);
      expiredRefresh.current = null;
      setState(null);
      setQueuedIndex(null);
      setPendingIndex(null);
      setBusy(false);
      setLoading(true);
      void refresh(true);
    };
    window.addEventListener('customer-session-changed', sessionChanged);
    document.addEventListener('visibilitychange', visible);
    const interval = window.setInterval(visible, 60000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('customer-session-changed', sessionChanged);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!pairView || pairView.ready.length !== 2) return;
    const timer = setTimeout(() => {
      if (pairRef.current !== pairView) return;
      if (!pairView.matched)
        setState((current) =>
          !current || current.memory.round !== pairView.round
            ? current
            : {
                ...current,
                memory: {
                  ...current.memory,
                  mismatchUntil: null,
                  cards: current.memory.cards.map((card) =>
                    pairView.indices.includes(card.index) ? { ...card, cardId: null } : card,
                  ),
                },
              },
        );
      showPair(null);
    }, 1600);
    return () => clearTimeout(timer);
  }, [pairView]);
  async function action(
    key: string,
    run: (id: string) => Promise<GameResult>,
    index?: number,
    before = state,
  ) {
    if (actionLock.current || pairRef.current) return;
    actionLock.current = true;
    setBusy(true);
    setPendingIndex(index ?? null);
    setError('');
    const version = ++requestVersion.current;
    const id = retries.current.get(key) || crypto.randomUUID();
    retries.current.set(key, id);
    try {
      const result = await run(id);
      if (!mounted.current || version !== requestVersion.current) return;
      retries.current.delete(key);
      if (result.state.memory.round !== before?.memory.round) revealedFaces.current = {};
      for (const card of result.state.memory.cards) {
        if (card.cardId) revealedFaces.current[card.index] = card.cardId;
      }
      if (
        index !== undefined &&
        result.state.memory.cards[index].matched &&
        before?.memory.firstIndex !== null &&
        before?.memory.firstIndex !== undefined
      ) {
        const first = before.memory.firstIndex;
        const face = revealedFaces.current[first] || before.memory.cards[first].cardId;
        if (face) {
          revealedFaces.current[first] = face;
          revealedFaces.current[index] = face;
        }
      }
      if (
        index !== undefined &&
        (result.state.memory.cards[index]?.cardId || result.state.memory.cards[index]?.matched) &&
        before?.memory.firstIndex !== null &&
        before?.memory.firstIndex !== undefined
      ) {
        showPair({
          round: result.state.memory.round,
          indices: [before.memory.firstIndex, index],
          ready: [],
          matched: result.state.memory.cards[index].matched,
        });
      }
      acceptState(result.state);
      setConfirm(null);
      setConfirmPoints(null);
      if (result.card) setDrawn(result.card);
      if (result.reward) {
        setPointReward(key === 'redeem-memory');
        setReward(result.reward);
        notify({
          title: 'Quà đã vào ví ưu đãi!',
          message: result.reward.name,
          href: '/tai-khoan?section=vouchers',
          actionLabel: 'Mở ví ưu đãi',
          tone: 'success',
        });
      }
      return result;
    } catch (reason) {
      if (!mounted.current || version !== requestVersion.current) return;
      if (reason instanceof GameApiError && reason.status === 401) {
        setGuest(true);
        setState(null);
      }
      setError(
        reason instanceof Error ? reason.message : 'Thao tác chưa hoàn tất. Vui lòng thử lại.',
      );
    } finally {
      if (mounted.current && version === requestVersion.current) {
        actionLock.current = false;
        setBusy(false);
        setPendingIndex(null);
      }
    }
  }
  async function flip(index: number, current = state) {
    if (!current) return;
    const memory = current.memory;
    if (
      memory.status !== 'playing' ||
      !memory.deadline ||
      Date.parse(memory.deadline) <= Date.now() + serverOffset.current
    )
      return;
    if (actionLock.current) {
      if (
        flipInFlight.current !== null &&
        memory.firstIndex === null &&
        queuedFlip.current === null &&
        index !== flipInFlight.current
      ) {
        queuedFlip.current = index;
        setQueuedIndex(index);
      }
      return;
    }
    flipInFlight.current = index;
    const expectedVersion = requestVersion.current + 1;
    const result = await action(
      `flip-${memory.round}-${index}`,
      (id) => gameApi.flip(index, id, memory.round),
      index,
      current,
    );
    if (!mounted.current || expectedVersion !== requestVersion.current) return;
    flipInFlight.current = null;
    const next = queuedFlip.current;
    queuedFlip.current = null;
    setQueuedIndex(null);
    if (
      result &&
      next !== null &&
      result.state.memory.round === memory.round &&
      result.state.memory.firstIndex !== null
    ) {
      await flip(next, result.state);
    }
  }
  const memory = state?.memory;
  const seconds = memory?.deadline
    ? Math.max(0, Math.ceil((Date.parse(memory.deadline) - clockNow - serverOffset.current) / 1000))
    : 60;
  useEffect(() => {
    if (memory?.status !== 'playing') return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [memory?.status, memory?.round]);
  useEffect(() => {
    if (
      memory?.status !== 'playing' ||
      seconds > 0 ||
      busy ||
      expiredRefresh.current === memory.round
    )
      return;
    expiredRefresh.current = memory.round;
    void refresh();
  }, [memory?.status, memory?.round, seconds, busy, refresh]);
  useEffect(() => {
    if (!memory?.soonestExpiry || busy) return;
    const delay = Math.max(0, Date.parse(memory.soonestExpiry) - Date.now() - serverOffset.current);
    // A timeout cannot exceed a signed 32-bit delay; longer lots are checked by the minute refresh.
    if (delay > 2147483647) return;
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [memory?.soonestExpiry, busy, refresh]);
  useEffect(() => {
    if (confirmPoints !== null && memory && confirmPoints !== memory.points) {
      setConfirmPoints(null);
      setError('Số điểm còn hạn đã thay đổi. Hãy kiểm tra số dư trước khi đổi thưởng.');
    }
  }, [confirmPoints, memory]);
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
        <button
          disabled={loading || busy}
          aria-pressed={tab === 'memory'}
          onClick={() => setTab('memory')}
        >
          <Layers3 size={20} />
          <span>
            Lật thẻ làm bánh<small>Ghép đôi · Tích điểm đổi quà</small>
          </span>
        </button>
        <button
          disabled={loading || busy}
          aria-pressed={tab === 'collection'}
          onClick={() => setTab('collection')}
        >
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
            Lật thẻ: 3 ván mỗi ngày, mỗi ván 60 giây. Sưu tập: 1 thẻ mỗi ngày, thêm 1 lượt khi xem
            sản phẩm đủ 30 giây.
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
                <strong>{memory.remainingRounds}</strong> ván còn lại hôm nay
              </span>
            </div>
            <div className="games-progress">
              <span>{matched / 2}/10 cặp đã tìm thấy</span>
              <progress value={matched} max={20} aria-label="Tiến độ ghép đôi" />
            </div>
            <div className="games-round-bar">
              <div
                className={`games-timer${memory.status === 'playing' && seconds <= 10 ? ' is-urgent' : ''}`}
              >
                <Clock3 size={19} />
                <span role="timer" aria-label="Thời gian ván chơi" aria-live="off">
                  {memory.status === 'playing'
                    ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
                    : '60 giây / ván'}
                </span>
              </div>
              {memory.status !== 'playing' && (
                <button
                  className="games-button"
                  disabled={busy || memory.remainingRounds < 1}
                  onClick={() =>
                    void action(`start-${memory.round}`, (id) =>
                      gameApi.startMemory(memory.round, id),
                    )
                  }
                >
                  {networkBusy
                    ? 'Đang mở ván…'
                    : memory.remainingRounds < 1
                      ? 'Hết ván hôm nay'
                      : 'Bắt đầu ván 60 giây'}
                </button>
              )}
            </div>
            {(memory.status === 'won' || memory.status === 'lost') && !pairView && (
              <div
                className={`games-round-result${memory.status === 'won' ? ' is-won' : ''}`}
                role="status"
              >
                <strong>
                  {memory.status === 'won' ? 'Trọn mẻ bánh, thật khéo!' : 'Hết giờ cho mẻ bánh này'}
                </strong>
                <p>
                  {memory.status === 'lost'
                    ? 'Ván này không có điểm. Ghi nhớ nguyên liệu và thử lại ở ván tiếp theo nhé.'
                    : memory.wins === 1
                      ? 'Chiến thắng đầu tiên đã lập kỷ lục của bạn. Từ lần thắng thứ hai, bạn sẽ nhận điểm.'
                      : memory.lastPoints > 0
                        ? `Đã cộng ${number(memory.lastPoints)} điểm vào số dư của bạn.`
                        : 'Bạn đã đạt giới hạn 600 điểm hôm nay. Kỷ lục vẫn được ghi nhận.'}
                </p>
              </div>
            )}
            <p className="games-hint" aria-live="polite">
              {memory.status !== 'playing'
                ? 'Bấm bắt đầu khi sẵn sàng. Ghép đủ 10 cặp trong 60 giây để thắng.'
                : seconds === 0
                  ? 'Đã hết 60 giây. Đang xác nhận kết quả ván chơi…'
                  : memory.mismatchUntil
                    ? 'Chưa cùng nguyên liệu rồi. Ghi nhớ vị trí và thử lại nhé.'
                    : memory.firstIndex !== null
                      ? 'Chọn thêm một thẻ để hoàn thành lượt.'
                      : 'Chọn 2 thẻ giống nhau. Bạn được chọn nhiều cặp trong thời gian ván chơi.'}
            </p>
            <div className="games-memory-grid">
              {memory.cards.map((card) => (
                <MemoryCard
                  key={`${memory.round}-${card.index}`}
                  card={card}
                  face={card.cardId || revealedFaces.current[card.index] || null}
                  displayPair={
                    pairView?.round === memory.round && pairView.indices.includes(card.index)
                  }
                  onRevealed={() => cardRevealed(card.index)}
                  pending={pendingIndex === card.index || queuedIndex === card.index}
                  disabled={
                    (busy &&
                      (pendingIndex === null ||
                        memory.firstIndex !== null ||
                        queuedIndex !== null)) ||
                    pendingIndex === card.index ||
                    card.matched ||
                    !!card.cardId ||
                    !!memory.mismatchUntil ||
                    memory.status !== 'playing' ||
                    seconds === 0
                  }
                  label={
                    card.matched
                      ? `Ô ${card.index + 1}, đã ghép`
                      : card.cardId
                        ? gameCardName(card.cardId)
                        : `Lật thẻ ${card.index + 1}`
                  }
                  onClick={() => void flip(card.index)}
                />
              ))}
            </div>
            <p className="games-note">
              <Clock3 size={14} /> Vị trí giữ suốt ván. Đồng hồ tiếp tục chạy khi bạn chuyển trang.
              Ván mới làm mới lúc 00:00 GMT+7.
            </p>
            {memory.bestMs !== null && (
              <p className="games-personal-best">
                Kỷ lục cá nhân:{' '}
                <strong>
                  {(memory.bestMs / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}{' '}
                  giây
                </strong>
              </p>
            )}
          </section>
          <aside className="games-sidebar">
            <h2>Đổi thưởng từ điểm</h2>
            <div className="games-prize games-points-prize">
              <Ticket />
              <span>ĐIỂM CÒN HẠN CỦA BẠN</span>
              <strong className="games-point-balance">
                {number(memory.points)} <small>điểm</small>
              </strong>
              <p>
                1 điểm = 1đ ưu đãi. Từ 3.000 điểm, đổi toàn bộ số dư thành một voucher riêng cho
                bạn.
              </p>
              <dl className="games-points-details">
                <div>
                  <dt>Nhận hôm nay</dt>
                  <dd>{number(memory.earnedToday)} / 600 điểm</dd>
                </div>
                <div>
                  <dt>Hạn điểm gần nhất</dt>
                  <dd>{memory.soonestExpiry ? date(memory.soonestExpiry) : 'Chưa có điểm'}</dd>
                </div>
              </dl>
              <button
                className="games-button"
                disabled={memory.points < 3000 || busy}
                onClick={() => setConfirmPoints(memory.points)}
              >
                {memory.points < 3000 ? 'Chưa đủ 3.000 điểm' : 'Đổi toàn bộ điểm'}
              </button>
              <p className="games-note">
                Voucher hạn 30 ngày, giảm tối đa 10% giá trị hàng trong đơn. Phần chưa dùng sẽ mất
                sau khi dùng voucher.
              </p>
            </div>
            <div className="games-point-rules">
              <h3>Chơi khéo, gom điểm</h3>
              <p>
                Ván thắng đầu tiên lập kỷ lục. Từ lần thắng thứ hai: +200 điểm; phá kỷ lục cá nhân:
                thêm 50 điểm.
              </p>
              <p>
                Tổng tối đa 600 điểm/ngày, kể cả thưởng kỷ lục. Mỗi đợt điểm hết hạn sau 90 ngày.
                Điểm chỉ đổi ưu đãi mua hàng.
              </p>
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
          Lật thẻ: 3 ván mỗi ngày GMT+7, mỗi ván 60 giây từ lúc bắt đầu, không giới hạn lần chọn
          cặp. Bàn 20 thẻ tạo thành 10 cặp: đúng thì cặp biến mất, sai thì úp lại. Ghép hết bàn
          trước khi hết giờ để thắng. Tải lại hoặc ẩn trang không gia hạn đồng hồ.
        </p>
        <p>
          Ván thắng đầu tiên của tài khoản không có điểm. Từ ván thắng thứ hai nhận 200 điểm; thắng
          nhanh hơn kỷ lục cá nhân được thêm 50 điểm. Tổng điểm nhận tối đa 600/ngày, nên ván cuối
          có thể được ít điểm hơn khi chạm giới hạn.
        </p>
        <p>
          Mỗi đợt điểm hết hạn sau 90 ngày. Từ 3.000 điểm còn hạn có thể đổi toàn bộ thành voucher,
          1 điểm = 1đ. Voucher dùng một lần, giảm bằng giá trị đã đổi nhưng tối đa 10% giá trị hàng
          trong đơn; phần giá trị chưa dùng sẽ mất, không hoàn lại điểm. Điểm không rút tiền mặt
          hoặc chuyển cho người khác.
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
      {confirmPoints !== null && (
        <Modal
          title="Đổi điểm lấy ưu đãi?"
          onClose={() => {
            if (!busy) setConfirmPoints(null);
          }}
        >
          <div className="games-dialog">
            <p>
              Đổi toàn bộ <strong>{number(confirmPoints)} điểm còn hạn</strong> thành voucher giá
              trị <strong>{number(confirmPoints)}đ</strong>. Điểm sẽ được trừ ngay; điểm hết hạn
              trước lúc đổi không được tính.
            </p>
            <p>
              Voucher riêng cho tài khoản, dùng một lần trong 30 ngày, mọi mặt hàng và đơn từ 0đ.
              Mức giảm thực tế không vượt 10% giá trị hàng trong đơn.{' '}
              <strong>Phần chưa dùng sẽ mất</strong> sau khi dùng voucher.
            </p>
            <button
              className="games-button"
              disabled={busy}
              onClick={() => void action('redeem-memory', (id) => gameApi.redeemMemory(id))}
            >
              {busy ? 'Đang đổi…' : 'Xác nhận đổi điểm'}
            </button>
          </div>
        </Modal>
      )}
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
            {pointReward && (
              <p>
                Giảm tối đa 10% giá trị hàng trong đơn. Phần chưa dùng sẽ mất sau khi dùng voucher.
              </p>
            )}
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
