import { useEffect, useRef, useState } from 'react';
import { Clock3, Play, RotateCcw, Volume2 } from 'lucide-react';
import './story-film.css';

const filmSource = '/brand/video/story-film-v1.mp4';

export function StoryFilm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activated, setActivated] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const pauseWhenHidden = () => {
      if (document.hidden) video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      video.closest('.story-film')?.setAttribute('data-in-view', String(entry.isIntersecting));
      if (!entry.isIntersecting) video.pause();
    });
    observer.observe(video);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  function playFilm() {
    const video = videoRef.current;
    if (!video) return;
    setActivated(true);
    setFailed(false);
    setNotice('');
    setBuffering(true);
    if (!video.getAttribute('src')) video.src = filmSource;
    else if (failed) video.load();
    video.focus();
    // Start inside the user's click so mobile browsers can play with sound.
    void video.play().catch(() => {
      if (videoRef.current !== video || !video.isConnected) return;
      setBuffering(false);
      if (video.error) setFailed(true);
      else setNotice('Nhấn nút phát trên video để bắt đầu xem.');
    });
  }

  return (
    <figure className="story-film" aria-label="Phim câu chuyện Hà Thành Vị">
      <div className="story-film__frame">
        <video
          ref={videoRef}
          className="story-film__video"
          aria-label="Video câu chuyện Hà Thành Vị"
          aria-describedby="story-film-caption"
          poster="/brand/video/story-poster-v1.webp"
          width="1912"
          height="1080"
          preload="none"
          playsInline
          controls={activated && !failed}
          controlsList="nodownload"
          tabIndex={activated ? 0 : -1}
          onLoadStart={() => setBuffering(true)}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onPlaying={() => {
            setBuffering(false);
            setNotice('');
          }}
          onPause={() => setBuffering(false)}
          onError={() => {
            setFailed(true);
            setBuffering(false);
          }}
        />
        {(!activated || failed) && (
          <button
            type="button"
            className="story-film__cover"
            onClick={playFilm}
            aria-label={failed ? 'Thử lại video câu chuyện' : 'Xem câu chuyện Hà Thành Vị'}
          >
            <span className="story-film__play" aria-hidden="true">
              {failed ? <RotateCcw size={28} /> : <Play size={30} fill="currentColor" />}
            </span>
            <span className="story-film__invitation">
              <span className="story-film__kicker">HÀ THÀNH VỊ · THƯỚC PHIM THƯƠNG HIỆU</span>
              <strong>{failed ? 'Thử lại video' : 'Xem câu chuyện'}</strong>
              <span>
                {failed
                  ? 'Video chưa tải được. Mời bạn thử lại.'
                  : 'Một chút vị xưa, một khoảng trời thân quen.'}
              </span>
            </span>
          </button>
        )}
        {activated && !failed && (buffering || notice) && (
          <p className="story-film__status" role="status">
            {notice || 'Đang tải video…'}
          </p>
        )}
      </div>
      <figcaption id="story-film-caption" className="story-film__caption">
        <span>Mời bạn chậm lại, cùng nghe một câu chuyện.</span>
        <span className="story-film__details">
          <span>
            <Clock3 size={15} aria-hidden="true" /> 01:22
          </span>
          <span>
            <Volume2 size={15} aria-hidden="true" /> Có âm thanh
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
