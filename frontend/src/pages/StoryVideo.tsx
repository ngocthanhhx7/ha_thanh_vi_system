import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import './story-video.css';

export function StoryVideo() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackVersion = useRef(0);
  const [muted, setMuted] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const version = ++playbackVersion.current;
    if (!video.getAttribute('src')) video.src = '/brand/video/story-film-v1.mp4';
    setNeedsPlay(false);
    setFailed(false);
    setLoading(true);
    try {
      await video.play();
    } catch {
      if (!video.isConnected || playbackVersion.current !== version) return;
      if (video.error) {
        setFailed(true);
        setLoading(false);
        return;
      }
      // Browser policies often allow autoplay only with sound disabled.
      video.muted = true;
      setMuted(true);
      try {
        await video.play();
      } catch {
        if (!video.isConnected || playbackVersion.current !== version) return;
        setFailed(!!video.error);
        setNeedsPlay(true);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    document.title = 'Thước phim Hà Thành Vị';
    const video = videoRef.current;
    void startPlayback();
    return () => {
      ++playbackVersion.current;
      video?.pause();
      video?.removeAttribute('src');
      video?.load();
    };
  }, [startPlayback]);

  return (
    <main className="story-video-page" aria-label="Thước phim Hà Thành Vị">
      <video
        ref={videoRef}
        src="/brand/video/story-film-v1.mp4"
        poster="/brand/video/story-poster-v1.webp"
        aria-label="Video câu chuyện Hà Thành Vị"
        autoPlay
        playsInline
        controls
        controlsList="nodownload"
        onEnded={() => navigate('/', { replace: true })}
        onPlaying={() => {
          setLoading(false);
          setNeedsPlay(false);
        }}
        onWaiting={() => setLoading(true)}
        onPause={() => setLoading(false)}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
      />
      <header className="story-video-page__header">
        <div>
          <span>HÀ THÀNH VỊ</span>
          <p>Một chút vị xưa, một khoảng trời thân quen.</p>
        </div>
        <Link to="/">
          Về Trang chủ <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </header>
      <button
        className="story-video-page__sound"
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          video.muted = !video.muted;
          if (!video.muted && video.paused) void startPlayback();
        }}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        {muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
      </button>
      {(failed || needsPlay) && (
        <div className="story-video-page__fallback">
          <p>
            {failed ? 'Video chưa tải được. Mời bạn thử lại.' : 'Nhấn để bắt đầu xem câu chuyện.'}
          </p>
          <button
            onClick={() => {
              if (failed) videoRef.current?.load();
              void startPlayback();
            }}
          >
            {failed ? <RotateCcw size={22} /> : <Play size={22} />}
            {failed ? 'Thử lại video' : 'Phát video'}
          </button>
        </div>
      )}
      {loading && !failed && !needsPlay && (
        <p className="story-video-page__loading" role="status">
          Đang tải video…
        </p>
      )}
      <p className="story-video-page__note">Kết thúc phim, bạn sẽ được đưa về Trang chủ.</p>
    </main>
  );
}
