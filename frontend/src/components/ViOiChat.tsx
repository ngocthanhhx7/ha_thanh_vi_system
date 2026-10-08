import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Send, X, Headphones, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useShop } from '../hooks/useShop';
import { ViOiMascot, type ViOiMascotMood } from './ViOiMascot';
import {
  chatApi,
  ChatApiError,
  type ChatHandoff,
  type ChatHistory,
  type ChatReply,
} from '../services/chatApi';
import { priceLabel } from '../utils/format';
import './vi-oi-chat.css';

type Message = ChatHistory & {
  result?: ChatReply;
  id?: string;
  sender?: 'staff';
  authorName?: string | null;
};
type HandoffSession = { id: string };
const handoffSessionKey = 'htv-chat-handoff';
const pendingHandoffTokenKey = 'htv-chat-handoff-token';
const chatDraftStorageKey = 'htv-chat-draft';
const pendingMessageStorageKey = 'htv-chat-pending-message';
const chatVisitorTokenKey = 'htv-chat-visitor-token';
function storedChatDraft() {
  try {
    const value =
      sessionStorage.getItem(chatDraftStorageKey) ??
      sessionStorage.getItem(pendingMessageStorageKey) ??
      '';
    return value.length <= 1500 ? value : '';
  } catch {
    return '';
  }
}
function writeSessionValue(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function removeSessionValue(key: string) {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
function pendingHandoffToken() {
  let existing: string | null = null;
  try {
    existing = sessionStorage.getItem(pendingHandoffTokenKey);
  } catch {
    existing = null;
  }
  if (existing && /^[\w-]{40,60}$/.test(existing)) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  try {
    sessionStorage.setItem(pendingHandoffTokenKey, token);
  } catch {
    return token;
  }
  return token;
}
function chatVisitorToken() {
  try {
    const existing = sessionStorage.getItem(chatVisitorTokenKey);
    if (existing && /^[\w-]{40,60}$/.test(existing)) return existing;
  } catch {
    // A fresh visitor token still works when session storage is unavailable.
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  writeSessionValue(chatVisitorTokenKey, token);
  return token;
}
function storedHandoffSession(): HandoffSession | null {
  try {
    const value = sessionStorage.getItem(handoffSessionKey);
    if (!value) return null;
    const session = JSON.parse(value) as HandoffSession;
    return typeof session.id === 'string' ? session : null;
  } catch {
    return null;
  }
}
function displayHandoffMessages(handoff: ChatHandoff): Message[] {
  return handoff.messages
    .filter((message) => message.sender !== 'system')
    .map((message) => ({
      id: message.id,
      role: message.sender === 'customer' ? 'user' : 'assistant',
      content: message.content,
      ...(message.sender === 'staff' ? { sender: 'staff' as const } : {}),
      authorName: message.authorName,
    }));
}
export function ViOiChat() {
  const { pathname } = useLocation();
  const {
    content: { site, products: catalog },
  } = useShop();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [handoff, setHandoff] = useState<ChatHandoff | null>(null);
  const [handoffSession, setHandoffSession] = useState<HandoffSession | null>(storedHandoffSession);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffError, setHandoffError] = useState('');
  const [handoffOffer, setHandoffOffer] = useState<'limit' | 'requested' | null>(null);
  const [chatQuotaLimit, setChatQuotaLimit] = useState(5);
  const [suggestions, setSuggestions] = useState([
    'Chọn quà biếu giúp mình',
    'Bánh chả có những vị nào?',
    'Cửa hàng giao hàng thế nào?',
  ]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState(storedChatDraft);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  const handoffRef = useRef(handoff);
  const handoffBusyRef = useRef(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const speechTimer = useRef<number | null>(null);
  const activeAiRequest = useRef<AbortController | null>(null);
  const pendingAiMessage = useRef<string | null>(null);
  const handoffRequestInFlight = useRef(false);
  const handoffUpdatedAt = useRef('');
  const wasOpen = useRef(false);
  const isStaffPage = pathname.startsWith('/quan-tri');
  const mascotMood: ViOiMascotMood = pending
    ? 'thinking'
    : speaking
      ? 'speaking'
      : !enabled || error
        ? 'offline'
        : 'idle';
  function updateDraft(value: string) {
    draftRef.current = value;
    setDraft(value);
  }
  function updateHandoff(value: ChatHandoff | null) {
    handoffRef.current = value;
    setHandoff(value);
  }
  useEffect(() => {
    if (draft) writeSessionValue(chatDraftStorageKey, draft);
    else removeSessionValue(chatDraftStorageKey);
  }, [draft]);
  useEffect(() => {
    removeSessionValue(pendingMessageStorageKey);
  }, []);
  function animateSpeaking() {
    setSpeaking(true);
    if (speechTimer.current) window.clearTimeout(speechTimer.current);
    speechTimer.current = window.setTimeout(() => setSpeaking(false), 1500);
  }
  useEffect(() => {
    active.current = true;
    if (isStaffPage) {
      active.current = false;
      const interruptedQuestion = pendingAiMessage.current;
      activeAiRequest.current?.abort();
      activeAiRequest.current = null;
      pendingAiMessage.current = null;
      handoffBusyRef.current = false;
      handoffRequestInFlight.current = false;
      if (interruptedQuestion && !draftRef.current.trim()) updateDraft(interruptedQuestion);
      setPending(false);
      setHandoffBusy(false);
      return;
    }
    chatApi
      .config()
      .then((config) => {
        if (active.current) {
          setEnabled(config.enabled);
          if (config.suggestions?.length) setSuggestions(config.suggestions.slice(0, 4));
        }
      })
      .catch(() => {
        if (active.current) setEnabled(false);
      });
    return () => {
      active.current = false;
      activeAiRequest.current?.abort();
    };
  }, [isStaffPage]);
  useEffect(() => {
    if (!open || isStaffPage || !handoffSession || handoff?.status === 'resolved') return;
    let alive = true;
    const refresh = async () => {
      try {
        const result = await chatApi.getHandoff(handoffSession.id);
        if (alive && result.handoff.updatedAt !== handoffUpdatedAt.current) {
          const latest = result.handoff.messages.at(-1);
          const hasNewStaffReply = handoffUpdatedAt.current && latest?.sender === 'staff';
          handoffUpdatedAt.current = result.handoff.updatedAt;
          updateHandoff(result.handoff);
          setMessages(displayHandoffMessages(result.handoff));
          if (hasNewStaffReply) animateSpeaking();
        }
      } catch {
        if (alive) setHandoffError('Chưa thể tải trạng thái tư vấn. Vui lòng thử lại sau.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 7000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [open, isStaffPage, handoffSession, handoff?.status]);
  function close() {
    setOpen(false);
  }
  useEffect(() => {
    if (wasOpen.current && !open) toggle.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key === 'Tab') {
        const items = panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],textarea:not(:disabled)',
        );
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, pending, error, open]);
  useEffect(
    () => () => {
      if (speechTimer.current) window.clearTimeout(speechTimer.current);
      activeAiRequest.current?.abort();
    },
    [],
  );
  function safeUrl(value?: string) {
    if (!value || [...value].some((character) => character.charCodeAt(0) <= 32)) return undefined;
    try {
      const url = new URL(value, window.location.origin);
      if (
        url.origin === window.location.origin &&
        /^\/san-pham(?:\/[a-zA-Z0-9-]+)?$/.test(url.pathname) &&
        !url.search &&
        !url.hash
      )
        return url.pathname;
      if (
        url.protocol === 'https:' &&
        [site.facebook, site.zalo].some((contact) => {
          try {
            return new URL(contact).href === url.href;
          } catch {
            return false;
          }
        })
      )
        return url.href;
    } catch {
      /* Invalid provider links are plain text. */
    }
    return undefined;
  }
  async function send(value: string, retry = false) {
    const text = value.trim();
    if (
      !text ||
      pending ||
      handoffBusyRef.current ||
      text.length > 1500 ||
      handoff?.status === 'resolved'
    )
      return;
    const submittedCurrentDraft = text === draftRef.current.trim();
    writeSessionValue(pendingMessageStorageKey, text);
    const history = (retry ? messages.slice(0, -1) : messages)
      .map(({ role, content }) => ({ role, content }))
      .slice(-8);
    if (!retry) setMessages((previous) => [...previous, { role: 'user', content: text }]);
    if (submittedCurrentDraft) updateDraft('');
    setPending(true);
    setHandoffOffer(null);
    setError('');
    setFailed('');
    let requestController: AbortController | null = null;
    try {
      if (handoff && handoffSession) {
        const result = await chatApi.sendHandoffMessage(handoff.id, text);
        if (!active.current) return;
        updateHandoff(result.handoff);
        setMessages(displayHandoffMessages(result.handoff));
        removeSessionValue(pendingMessageStorageKey);
        return;
      }
      requestController = new AbortController();
      activeAiRequest.current = requestController;
      pendingAiMessage.current = text;
      const result = await chatApi.send(
        text,
        history,
        requestController.signal,
        chatVisitorToken(),
      );
      if (!active.current) return;
      if (handoffRequestInFlight.current || handoffRef.current) return;
      if (result.available === false)
        throw new ChatApiError(
          result.reply || 'Vị Ơi đang tạm nghỉ. Bạn liên hệ cửa hàng nhé.',
          result,
        );
      setMessages((previous) => [
        ...previous,
        { role: 'assistant', content: result.reply, result },
      ]);
      if (result.limit) setChatQuotaLimit(result.limit);
      setHandoffOffer(result.remaining === 0 ? 'limit' : result.handoff ? 'requested' : null);
      removeSessionValue(pendingMessageStorageKey);
      animateSpeaking();
    } catch (reason) {
      if (!active.current) return;
      if (requestController?.signal.aborted) return;
      const quotaReply = reason instanceof ChatApiError ? reason.response : undefined;
      if (quotaReply?.handoff && quotaReply.limit) {
        setMessages((previous) => [
          ...previous,
          { role: 'assistant', content: quotaReply.reply, result: quotaReply },
        ]);
        setChatQuotaLimit(quotaReply.limit);
        setHandoffOffer('limit');
        setError('');
        setFailed('');
        removeSessionValue(pendingMessageStorageKey);
        animateSpeaking();
        return;
      }
      setError(
        reason instanceof Error ? reason.message : 'Vị Ơi chưa thể trả lời. Bạn thử lại nhé.',
      );
      setFailed(text);
      removeSessionValue(pendingMessageStorageKey);
      if (!draftRef.current.trim()) updateDraft(text);
    } finally {
      if (activeAiRequest.current === requestController) activeAiRequest.current = null;
      if (pendingAiMessage.current === text) pendingAiMessage.current = null;
      if (active.current) setPending(false);
    }
  }
  async function requestStaff() {
    if (!handoffOffer || handoffBusyRef.current || handoffRef.current) return;
    handoffBusyRef.current = true;
    handoffRequestInFlight.current = true;
    const interruptedQuestion = pendingAiMessage.current;
    if (activeAiRequest.current) {
      activeAiRequest.current.abort();
      activeAiRequest.current = null;
      setPending(false);
    }
    setHandoffBusy(true);
    setHandoffError('');
    setError('');
    try {
      const accessToken = pendingHandoffToken();
      const result = await chatApi.createHandoff(
        messages.map(({ role, content }) => ({ role, content })).slice(-30),
        accessToken,
      );
      if (!active.current) return;
      const session = { id: result.handoff.id };
      setHandoffSession(session);
      updateHandoff(result.handoff);
      setHandoffOffer(null);
      setMessages(displayHandoffMessages(result.handoff));
      if (interruptedQuestion && draftRef.current.trim() === interruptedQuestion) updateDraft('');
      const sessionStored = writeSessionValue(handoffSessionKey, JSON.stringify(session));
      const tokenRemoved = removeSessionValue(pendingHandoffTokenKey);
      removeSessionValue(pendingMessageStorageKey);
      if (!sessionStored || !tokenRemoved) {
        setHandoffError('Hãy giữ tab này mở để theo dõi phản hồi của nhân viên.');
      }
    } catch (reason) {
      if (interruptedQuestion && !draftRef.current.trim()) updateDraft(interruptedQuestion);
      removeSessionValue(pendingMessageStorageKey);
      setHandoffError(
        reason instanceof Error
          ? reason.message
          : 'Chưa thể kết nối nhân viên. Bạn có thể liên hệ cửa hàng qua Zalo hoặc điện thoại.',
      );
    } finally {
      handoffBusyRef.current = false;
      handoffRequestInFlight.current = false;
      if (active.current) setHandoffBusy(false);
      if (active.current) setPending(false);
    }
  }
  function startNewConversation() {
    updateHandoff(null);
    setHandoffOffer(null);
    setHandoffSession(null);
    setMessages([]);
    setError('');
    setHandoffError('');
    try {
      sessionStorage.removeItem(handoffSessionKey);
      sessionStorage.removeItem(pendingHandoffTokenKey);
    } catch {
      /* The current conversation remains usable until the tab closes. */
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }
  if (pathname.startsWith('/quan-tri')) return null;
  return (
    <div className={'vi-chat-widget' + (open ? ' is-open' : '')}>
      {open && (
        <section
          className="vi-chat-panel"
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="vi-chat-title"
        >
          <header className="vi-chat-header">
            <div className={'vi-chat-mascot vi-chat-avatar is-' + mascotMood} aria-hidden="true">
              <ViOiMascot mood={mascotMood} />
            </div>
            <div>
              <h2 id="vi-chat-title">Vị Ơi</h2>
              <p className={'vi-chat-presence' + (enabled ? ' is-online' : ' is-offline')}>
                <span />
                {handoff?.status === 'waiting'
                  ? 'Đang nối bạn với nhân viên'
                  : handoff?.status === 'assigned'
                    ? `${handoff.assignedStaffName || 'Nhân viên'} đang hỗ trợ`
                    : enabled
                      ? 'Sẵn sàng chọn quà cùng bạn'
                      : 'AI tạm nghỉ · nhân viên vẫn hỗ trợ'}
              </p>
            </div>
            <button type="button" aria-label="Đóng Vị Ơi" className="icon-button" onClick={close}>
              <X size={20} />
            </button>
          </header>
          <div className="vi-chat-scroll">
            {!messages.length && (
              <div className="vi-chat-welcome">
                <span className="vi-chat-welcome-icon">
                  <Sparkles size={18} />
                </span>
                <p className="vi-chat-eyebrow">MỘT CHÚT HÀ NỘI, MỘT CHÚT DỊU DÀNG</p>
                <h3>Chào bạn, mình là Vị Ơi!</h3>
                <p>Mình giúp bạn tìm bánh, chọn set quà và khám phá những thức quà Hà Thành.</p>
                <small>
                  Không gửi mật khẩu, OTP hay thông tin thanh toán. Khi gặp nhân viên, chỉ chia sẻ
                  mã đơn hoặc số liên hệ cần thiết.
                </small>
              </div>
            )}
            {!enabled && (
              <p role="status" className="vi-chat-offline">
                Trợ lý AI đang tạm nghỉ. Bạn có thể liên hệ cửa hàng qua Zalo hoặc điện thoại bên
                dưới.
              </p>
            )}
            {enabled && !messages.length && !handoff && (
              <div className="vi-chat-suggestions">
                {suggestions.map((text) => (
                  <button key={text} type="button" onClick={() => void send(text)}>
                    {text}
                  </button>
                ))}
              </div>
            )}
            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Cuộc trò chuyện với Vị Ơi"
            >
              {messages.map((message, index) => (
                <article
                  className={
                    'vi-chat-message vi-chat-' +
                    message.role +
                    (message.sender === 'staff' ? ' is-staff' : '')
                  }
                  key={message.id ?? index}
                >
                  <span className="vi-chat-speaker">
                    {message.sender === 'staff'
                      ? message.authorName || 'Nhân viên Hà Thành Vị'
                      : message.role === 'user'
                        ? 'Bạn'
                        : 'Vị Ơi'}
                  </span>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    skipHtml
                    urlTransform={(value) => safeUrl(value) || ''}
                    components={{
                      img: () => null,
                      a: ({ href, children }) => {
                        const url = safeUrl(href);
                        return url ? (
                          <a
                            href={url}
                            target={url.startsWith('/') ? undefined : '_blank'}
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ) : (
                          <span>{children}</span>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {message.result?.products
                    ?.filter((product) =>
                      catalog.some(
                        (known) => known.id === product.id && known.slug === product.slug,
                      ),
                    )
                    .map((product) => {
                      const known = catalog.find((item) => item.id === product.id)!;
                      return (
                        <Link
                          className="vi-chat-product"
                          key={product.id}
                          to={'/san-pham/' + known.slug}
                        >
                          <strong>{known.name}</strong>
                          <span>
                            {known.price === null ? 'Liên hệ giá' : priceLabel(known.price)}
                          </span>
                        </Link>
                      );
                    })}
                  {message.result?.sources
                    ?.filter((source) => {
                      const href = safeUrl(source.url);
                      if (!href) return false;
                      return !message.result?.products?.some(
                        (product) =>
                          catalog.some(
                            (known) => known.id === product.id && known.slug === product.slug,
                          ) && href === '/san-pham/' + product.slug,
                      );
                    })
                    .map((source, i) => (
                      <a
                        className="vi-chat-source"
                        key={i}
                        href={safeUrl(source.url)}
                        target={source.url.startsWith('/') ? undefined : '_blank'}
                        rel="noopener noreferrer"
                      >
                        {source.label}
                      </a>
                    ))}
                  {message.result?.handoff && (
                    <p>Vị Ơi đã xác nhận yêu cầu. Bạn có thể chọn gặp nhân viên ở bên dưới.</p>
                  )}
                </article>
              ))}
            </div>
            {pending && <p role="status">Vị Ơi đang chuẩn bị câu trả lời…</p>}
            {error && (
              <div className="vi-chat-error">
                <p role="alert">{error}</p>
                <button type="button" disabled={pending} onClick={() => void send(failed, true)}>
                  Thử lại câu hỏi
                </button>
              </div>
            )}
            {handoff && (
              <div className={'vi-chat-handoff-status is-' + handoff.status} role="status">
                <span className="vi-chat-status-dot" />
                {handoff.status === 'waiting'
                  ? 'Đã gửi yêu cầu. Nhân viên sẽ trả lời ngay tại cuộc trò chuyện này.'
                  : handoff.status === 'assigned'
                    ? `${handoff.assignedStaffName || 'Nhân viên Hà Thành Vị'} đã tiếp nhận yêu cầu.`
                    : 'Cuộc tư vấn đã kết thúc. Cảm ơn bạn đã trò chuyện cùng Hà Thành Vị.'}
                {handoff.status === 'resolved' && (
                  <button type="button" onClick={startNewConversation}>
                    Bắt đầu cuộc trò chuyện mới
                  </button>
                )}
              </div>
            )}
            {handoffError && (
              <p className="vi-chat-handoff-error" role="alert">
                {handoffError}
              </p>
            )}
            <div ref={bottom} />
          </div>
          {!handoff && handoffOffer && (
            <div className="vi-chat-escalate">
              <div>
                <strong>
                  {handoffOffer === 'limit'
                    ? `Bạn đã dùng hết ${chatQuotaLimit} lượt tư vấn trong 24 giờ.`
                    : 'Vị Ơi xác nhận: bạn muốn gặp nhân viên chứ?'}
                </strong>
                <span>Chọn xác nhận để tiếp tục trò chuyện trực tiếp tại đây.</span>
              </div>
              <button type="button" disabled={handoffBusy} onClick={() => void requestStaff()}>
                <Headphones size={17} />
                {handoffBusy ? 'Đang kết nối…' : 'Đồng ý, gặp nhân viên'}
              </button>
            </div>
          )}
          <div className="vi-chat-contact">
            <a href={site.zalo} target="_blank" rel="noopener noreferrer">
              Nhắn cửa hàng qua Zalo
            </a>
            <a href={'tel:' + site.phone}>Gọi cửa hàng</a>
          </div>
          <form className="vi-chat-compose" onSubmit={submit}>
            <label className="sr-only" htmlFor="vi-chat-input">
              Câu hỏi cho Vị Ơi
            </label>
            <textarea
              id="vi-chat-input"
              ref={input}
              value={draft}
              onChange={(event) => updateDraft(event.target.value)}
              placeholder={handoff ? 'Nhắn tin cho nhân viên…' : 'Bạn muốn chọn thức quà nào?'}
              disabled={handoff?.status === 'resolved'}
              maxLength={1500}
              rows={2}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !pending &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
            />
            <button
              type="submit"
              aria-label="Gửi câu hỏi"
              disabled={pending || handoffBusy || !draft.trim() || handoff?.status === 'resolved'}
            >
              <Send size={20} />
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        ref={toggle}
        className="vi-chat-toggle"
        aria-label={open ? 'Đóng Vị Ơi' : 'Trò chuyện với Vị Ơi'}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <div
          className={'vi-chat-mascot vi-chat-launcher-mascot is-' + mascotMood}
          aria-hidden="true"
        >
          <ViOiMascot mood={mascotMood} />
        </div>
      </button>
    </div>
  );
}
